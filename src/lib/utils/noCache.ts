import { DataSnapshot, DataSource } from "../datasource/types.js"

type CachedResponse<T> = {
  cached: boolean,
  data: DataSnapshot<T>[]
}

export class NoCache<T> {
  constructor(private source: DataSource<DataSnapshot<T>>)  {}

  public static async create<T> (source: DataSource<DataSnapshot<T>>) {
    return new NoCache(source)
  }


  async fetch(from: number, to: number, limit: number): Promise<CachedResponse<T>> {
    return { data: await this.source.fetch(from, to, limit), cached: true }
  }
}