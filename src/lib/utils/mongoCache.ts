import { Collection, MongoClient } from 'mongodb'
import { DataSnapshot, DataSource, Resolution } from '../datasource/types.js';

const url = 'mongodb://localhost:27017';
const client = new MongoClient(url);

const DB_NAME = 'cache';
const CACHE_INFO = 'cache-info';
const CACHE_DATA = 'cache-data';
const ONE_HOUR = 3600
const ONE_MINUTE = 60

type Section = {
  start: number
  end: number
}

type CacheInfo = {
  key: string
  sections: Section[]
}

export const combineSections = (cached: CacheInfo, res: Resolution): CacheInfo => {
  
  const sections = cached.sections.sort((a, b) => a.start - b.start)
  const combined: Section[] = []
  let current = sections[0]
  if (res === 'swap') {
    for (let i = 1; i < sections.length; i++) {
      const next = sections[i]
      if (next.start - 1 <= current.end) {
        current.end = next.end
      } else {
        combined.push(current)
        current = next
      }
    }
  } else {
    const period = res === '1h' ? ONE_HOUR : ONE_MINUTE
    for (let i = 1; i < sections.length; i++) {
      const next = sections[i]
      if (next.start - period <= current.end) {
        current.end = next.end
      } else {
        combined.push(current)
        current = next
      }
    }
  }
  combined.push(current)
  return { ...cached, sections: combined }
}

export class DB {
  static initialised = false
  info: Collection<Document>
  data: Collection<Document>

  constructor() {
    this.info = client.db(DB_NAME).collection(CACHE_INFO)
    this.data = client.db(DB_NAME).collection(CACHE_DATA)
  }

  public static async create() {
    if (!DB.initialised) {
      await client.connect();
      DB.initialised = true
    }
    const db = new DB()
    await db.data.createIndex({ key: 1, timestamp: 1 })
    await db.info.createIndex({ key: 1 })
    return db
  }

  async clear() {
    await this.info.drop()
    await this.data.drop()
    console.log('Cache collections dropped')
  }

  async clearKey(key: string) {
    await this.info.deleteOne({key})
    await this.data.deleteMany({key})
    console.log(`key ${key} dropped`)
  }

  static async disconnect() {
    if (DB.initialised)
      await client.close()
  }
}

type CachedResponse<T> = {
  cached: boolean,
  data: DataSnapshot<T>[]
}

export class MongoCache<T> {
  res: Resolution
  constructor(public db: DB, private source: DataSource<DataSnapshot<T>>)  {
    this.res = source.info.resolution
  }

  public static async create<T> (source: DataSource<DataSnapshot<T>>) {
    return new MongoCache(await DB.create(), source)
  }

  public isPartiallyCached(cached: CacheInfo, from: number, to: number) {
    if (this.res === 'swap') {
      for (const section of cached.sections) {
        if (from >= section.start && from <= section.end) {
          return { isPartiallyCached: true, section }
        }
      }
    } else {
      for (const section of cached.sections) {
        if (from >= section.start && from < section.end) {
          return { isPartiallyCached: true, section }
        }
      }
    }
    return { isPartiallyCached: false }
  }

  private validate(from: number, to: number) {
    if (this.res === '1h') {
      if (from % ONE_HOUR !== 0) throw new Error('from must be a multiple of 1 hour')
      if (to % ONE_HOUR !== 0) throw new Error('to must be a multiple of 1 hour')
    } else if (this.res === '1m') {
      if (from % ONE_MINUTE !== 0) throw new Error('from must be a multiple of 1 minute')
      if (to % ONE_MINUTE !== 0) throw new Error('to must be a multiple of 1 minute')
    }
    return { from, to }
  }

  async fetch(from: number, to: number, limit: number): Promise<CachedResponse<T>> {
    this.validate(from, to)

    const cached = (await this.db.info.findOne({ key: this.source.key })) as any 
    if (!cached) {
      return { data: await this.fetchAndCache(from, to, limit), cached: false }
    }

    const { isPartiallyCached, section } = this.isPartiallyCached(cached, from, to)
    if (!isPartiallyCached) {
      return { data: await this.fetchAndCache(from, to, limit), cached: false }
    }

    if (this.res !== 'swap') {
      const period = this.res === '1h' ? ONE_HOUR : ONE_MINUTE
      to = Math.min(section!.end + period, to)
      
    } else {
      to = Math.min(section!.end, to)
    }
    const cachedData = (await this.db.data.find({ key: this.source.key, timestamp: { $gte: from, $lt: to } })
      .limit(limit)
      .toArray())
      .map((e: any) => ({ timestamp: e.timestamp, data: e.data }))
      

    if (cachedData.length === 0) {
      return { data: await this.fetchAndCache(from, to, limit), cached: false }
    }
    console.log('Fetched from cache')
    return { data: cachedData as any[], cached: true }
  }

  async fetchAndCache(from: number, to: number, limit?: number): Promise<DataSnapshot<T>[]> {
    const dbCache = await this.db.info.findOne({ key: this.source.key })
    let cached = (dbCache || { key: this.source.key, sections: [] }) as CacheInfo

    const data = await this.source.fetch(from, to, limit)
    if (data.length === 0) return data

    if (data.length === limit) {
      cached.sections.push({ start: from, end: to })
    } else {
      cached.sections.push({ start: from, end: data[data.length - 1].timestamp })
    }
    cached = combineSections(cached, this.res)
    
    const cachedData = await this.db.data.find({ key: this.source.key, timestamp: { $gte: from, $lt: to } }).toArray()
    const rec = (data as any)
      .filter((e: any) => !cachedData.find(c => (c as any).timestamp === e.timestamp))
      .map((e: any) => ({ key: this.source.key, ...e }))

    if (rec.length > 0)
      await this.db.data.insertMany(rec)

    await this.db.info.updateOne({ key: this.source.key }, { $set: cached }, { upsert: true })
    return data.map(e => ({ timestamp: e.timestamp, data: e.data }))
  }
}