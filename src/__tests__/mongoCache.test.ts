import { InfluxDB } from 'influx';
import { Measurement, ILogAny, TimeSeriesDB } from '../lib/utils/influx1x.js';
import { waitFor } from '../lib/utils/utility.js';
import { DataSource, DataSourceInfo } from '../lib/datasource/types.js';
import { DB, MongoCache } from '../lib/utils/mongoCache.js';

// jest.mock('influx'); // SoundPlayer is now a mock constructor

jest.mock('influx', () => {
  return {
    InfluxDB: function () {
      return {
        getDatabaseNames: jest.fn().mockImplementation(async () => {
          return ['testdb'];
        }),
        createDatabase: jest.fn().mockImplementation(async () => {
          await waitFor(1000);
        }),
        dropMeasurement: jest.fn().mockImplementation(async () => {}),
      };
    },
  };
});

const ONE_HOUR = 3600

class MockDataSource implements DataSource<any> {
  constructor(public info: DataSourceInfo) {
  }

  get id(): string {
    return 'mock'
  }
  get key(): string {
    return 'mock'
  }
  init(): Promise<void> {
    return Promise.resolve(undefined);
  }

  async fetch(from: number, to: number, limit?: number): Promise<any[]> {
    if (this.info.resolution === '1h') {
      from = Math.ceil(from / ONE_HOUR) * ONE_HOUR
      to = Math.floor(to / ONE_HOUR) * ONE_HOUR
      const diff = to - from
      const hours = diff / ONE_HOUR
      const timestamps = new Array(hours).fill(from).map((e, i) => e + i * ONE_HOUR);
      return timestamps.map(e => ({
        timestamp: e,
        data: [e * 100 * Math.random()]
      }))
    }
    await waitFor(100)
    return []
  }

  
}
let source!: MockDataSource 
let cache!: MongoCache<any>

describe('Test MongoDB Caching hourly data', () => {
  beforeAll(async () => {
    source = new MockDataSource({ chain: 'avalanche', protocol: 'aave', resolution: '1h' })
    cache = await MongoCache.create(source)
  })

  beforeEach(async () => {
    await cache.db.clearKey('mock')
  })

  it('simple fetch', async () => {
    const start = 0
    const end = 6 * ONE_HOUR
    const limit = 1000
    const { data, cached } = await cache.fetch(start, end, limit)
    expect(cached).toEqual(false)
    expect(data.length).toEqual(6)
    expect(data[0].timestamp).toEqual(start)
    expect(data[data.length-1].timestamp).toEqual(end - ONE_HOUR)
  });

  it('Fetching equal sections', async () => {
    const start = 0
    const end = 6 * ONE_HOUR
    const limit = 1000
    const first = await cache.fetch(start, end, limit)
    expect(first.cached).toEqual(false)
    console.log(first.data)
    const second = await cache.fetch(start, end, limit)
    expect(second.cached).toEqual(true)
    console.log(second.data)
    expect(first.data).toEqual(second.data)
  });

  it('Fetching multiple sections', async () => {
    const start = 0
    const end = 6 * ONE_HOUR
    const end2 = end +  6 * ONE_HOUR
    const limit = 1000
    const data1 = await cache.fetch(start, end, limit)
    expect(data1.cached).toEqual(false)
    const data2 = await cache.fetch(end, end2, limit)
    expect(data2.cached).toEqual(false)


    const cached1 = await cache.fetch(start, end, limit)
    expect(cached1.cached).toEqual(true)
    const cached2 = await cache.fetch(end, end2, limit)
    expect(cached2.cached).toEqual(true)
    console.log(data1, data2)
    console.log(cached1, cached2)
    console.log({end2})

    expect(data1.data).toEqual(cached1.data)
    expect(data2.data).toEqual(cached2.data)
  });

  it('Fetching multiple sections change from', async () => {
    const start = 0
    const end = 6 * ONE_HOUR
    const end2 = end +  6 * ONE_HOUR
    const limit = 1000
    const data1 = await cache.fetch(start, end, limit)
    expect(data1.cached).toEqual(false)
    const data2 = await cache.fetch(end, end2, limit)
    expect(data2.cached).toEqual(false)

    console.log(data1.data, data2.data)


    const cached1 = await cache.fetch(start, end2, limit)
    const data = cached1.data
    console.log(data)
    expect(data[0].timestamp).toEqual(start)
    expect(data[data.length-1].timestamp).toEqual(end2 - ONE_HOUR)

  });

  it('Fetching subsection from cache', async () => {
    const start1 = 0
    const end1 = 12 * ONE_HOUR
    const limit = 1000
    const data1 = await cache.fetch(start1, end1, limit)
    expect(data1.cached).toEqual(false)

    const start2 = start1 + 1 * ONE_HOUR
    const end2 = start2 + 6 * ONE_HOUR
    const cached1 = await cache.fetch(start2, end2, limit)

    const data = data1.data.slice(1, 7)
    const cached = cached1.data
    expect(data).toEqual(cached)

  });

  it('Fetching across gap from cache', async () => {
    const start = 0
    const end = 6 * ONE_HOUR
    const shift = 12 * ONE_HOUR
    const limit = 1000
    const data1 = await cache.fetch(start, end, limit)
    expect(data1.cached).toEqual(false)
    const data2 = await cache.fetch(start + shift, end + shift, limit)
    expect(data2.cached).toEqual(false)

    // Fetching across the gap should only return the first section
    const cached1 = await cache.fetch(start, end + shift, limit)
    expect(cached1.cached).toEqual(true)
    expect(cached1.data.length).toEqual(6)
  });

  afterAll=(() => {
    DB.disconnect()
  })
});
