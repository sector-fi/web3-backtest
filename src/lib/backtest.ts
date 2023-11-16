import { DataSourceStore } from './datasource/datasource.js';
import {
  DataSnapshot,
  DataSource,
  DataSourceInfo,
  Resolution,
} from './datasource/types.js';
import { getCachedData, updateCache } from './utils/cache.js';
import { DB, MongoCache } from './utils/mongoCache.js';
import { NoCache } from './utils/noCache.js';

type BacktestOptions = {
  useCache?: boolean; // default: true
};

const ONE_HOUR = 3600;
const ONE_MINUTE = 60;

const formatTime = (time: number) => {
  const t = new Date(time * 1000)
    .toISOString()
    .replace(':00.000Z', '')
    .split('T');
  return `${t[0]} ${t[1]}`;
};

const toElapsed = (start: number) => {
  return ((Date.now() - start) / 1000).toFixed(2) + 's';
};

export class Backtest {
  private onDataHandler?: (update: DataSnapshot<any>) => Promise<void>;
  private onBeforeHandler?: () => Promise<void>;
  private onAfterHandler?: () => Promise<void>;

  constructor(
    private start: Date,
    private end: Date,
    public readonly sources: DataSource[],
    public options: BacktestOptions,
    private limit = 3000, // too high and the query will hang
  ) {}

  public static async create(
    start: Date,
    end: Date,
    sourceConfig?: DataSourceInfo[],
    _sources?: DataSource[],
    options?: BacktestOptions,
  ): Promise<Backtest> {
    const sources =
      _sources || sourceConfig?.map((source) => DataSourceStore.get(source));
    if (!sources) throw new Error('no sources provided');
    const bt = new Backtest(
      start,
      end,
      sources,
      options || { useCache: false },
    );
    return bt;
  }

  public static ResToSeconds(res: Resolution) {
    switch (res) {
      case '1m':
        return 60;
      case '1h':
        return 60 * 60;
      case '1d':
        return 60 * 60 * 24;
      default:
        throw new Error('unsuppported resolution');
    }
  }

  public onBefore(handler: () => Promise<void>) {
    this.onBeforeHandler = handler;
  }

  public onData<T = any>(handler: (update: DataSnapshot<T>) => Promise<void>) {
    this.onDataHandler = handler;
  }

  public onAfter(handler: () => Promise<void>) {
    this.onAfterHandler = handler;
  }

  public async run() {
    // Initialise the goodz
    await Promise.all(this.sources.map((e) => e.init()));
    if (this.onBeforeHandler) await this.onBeforeHandler();

    // sort the datasources from high res to low res
    const sources = this.sources.sort((a, b) => {
      const aRes = Backtest.ResToSeconds(a.info.resolution);
      const bRes = Backtest.ResToSeconds(b.info.resolution);
      return aRes > bRes ? 1 : -1;
    });

    const start = this.start.getTime() / 1000;
    const end = this.end.getTime() / 1000;
    let finished = false;
    let from = start;
    let to = end;
    let count = 0;
    const res = sources[0].info.resolution
    const addition = res === '1h' ? ONE_HOUR : res === '1m' ? ONE_MINUTE : 1 

    const getSource = async <T>(source: DataSource<DataSnapshot<T>>) => {
      return this.options.useCache ? await MongoCache.create(source) : NoCache.create(source);
    }
    // use the first data source as the lead because it'll have the highest resolution
    const lead = await getSource(sources[0]);
    const others = await Promise.all(sources.slice(1).map(async (source) => await getSource(source)));
    do {
      console.time(`[${count}] Fetch Data  `)
      const { data, cached } = await lead.fetch(from, end, this.limit);
      if (data.length === 0) break;

      to = data[data.length - 1].timestamp + addition;
      console.log(
        `Fetched data from ${formatTime(from)} to ${formatTime(to)}`,
      );

      const allData = [
        data,
        ...await Promise.all(others.map((ds) => ds.fetch(from, to, this.limit).then(e => e.data))),
      ];
      from = to;

      // merge all timestamps
      const timestamps = Array.prototype.concat.apply(
        [],
        allData.map((e) => e.map((e) => e.timestamp)),
      ) as number[];
      const unique = Array.from(new Set(timestamps)).sort((a, b) => a - b);

      const mergedData = unique.map((ts) => {
        // find all datasources that have a snapshot at this timestamp
        const dsWithSnapshots = allData.filter(
          (ds) => ds.findIndex((e) => e.timestamp === ts) !== -1,
        );
        // grab data from each datasource at this timestamp
        const data = dsWithSnapshots.map(
          (ds) => ds.find((e) => e.timestamp === ts)?.data,
        );
        return {
          timestamp: ts,
          data: Object.assign({}, ...data),
        };
      });
      console.timeEnd(`[${count}] Fetch Data  `)

      console.time(`[${count}] Run Backtest`)
      // emit each of the snapshots
      for (const snap of mergedData) {
        if (this.onDataHandler) await this.onDataHandler(snap);
      }
      console.timeEnd(`[${count}] Run Backtest`)
      console.log('------------------------')
      // End when we run out of data
      finished = data.length === 0 || from >= end;;
      if (finished) {
        console.log('FINISHED!!!')
      }
      count++
    } while (!finished);

    if (this.onAfterHandler)
      await this.onAfterHandler()
    
    DB.disconnect()
  }
}
