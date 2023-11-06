import { Collection, MongoClient } from 'mongodb'
import { DataSnapshot, DataSource } from '../datasource/types.js';

const url = 'mongodb://localhost:27017';
const client = new MongoClient(url);

const DB_NAME = 'cache';
const CACHE_INFO = 'cache-info';
const CACHE_DATA = 'cache-data';

type Section = {
  start: number
  end: number
}

type CacheInfo = {
  key: string
  sections: Section[]
}

export const combineSections = (cached: CacheInfo): CacheInfo => {
  const sections = cached.sections.sort((a, b) => a.start - b.start)
  const combined: Section[] = []
  let current = sections[0]
  for (let i = 1; i < sections.length; i++) {
    const next = sections[i]
    if (next.start - 1 <= current.end) {
      current.end = next.end
    } else {
      combined.push(current)
      current = next
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

  static async disconnect() {
    if (DB.initialised)
      await client.close()
  }
}

export class MongoCache<T> {
  constructor(private db: DB, private source: DataSource<DataSnapshot<T>>)  {}

  public static async create<T> (source: DataSource<DataSnapshot<T>>) {
    return new MongoCache(await DB.create(), source)
  }

  public isPartiallyCached(cached: CacheInfo, from: number, to: number): boolean {
    for (const section of cached.sections) {
      if (from >= section.start && from <= section.end) {
        return true
      }
    }
    return false
  }

  async fetch(from: number, to: number, limit: number): Promise<DataSnapshot<T>[]> {
    const cached = (await this.db.info.findOne({ key: this.source.key })) as any 
    if (!cached || !this.isPartiallyCached(cached, from, to)) {
      // No cached for this key. 
      return this.fetchAndCache(from, to, limit)
    }

    const cachedData = await this.db.data.find({ key: this.source.key, timestamp: { $gte: from, $lte: to } })
      .limit(limit)
      .toArray()
    if (cachedData.length < limit) {
      // We have some cached data but not enough. 
      return this.fetchAndCache(from, to, limit)
    }

    console.log('Fetched from cache')
    return cachedData as any
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
    cached = combineSections(cached)
    
    const cachedData = await this.db.data.find({ key: this.source.key, timestamp: { $gte: from, $lte: to } }).toArray()
    const rec = data
      .filter(e => !cachedData.find(c => c.timestamp === e.timestamp))
      .map(e => ({ key: this.source.key, ...e }))

    if (rec.length > 0)
      await this.db.data.insertMany(rec)

    await this.db.info.updateOne({ key: this.source.key }, { $set: cached }, { upsert: true })
    return data
  }
}