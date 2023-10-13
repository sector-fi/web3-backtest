import { Schema, Measurement } from './influx2x.js';

interface ILogAny extends Schema {
  tags: any;
  fields: any;
}

export class InfluxBatcher<
  T extends Schema = ILogAny,
  Fields = any,
  Tags = any,
> extends Measurement<T, Fields, Tags> {
  lock = false;
  private points: T[] = [];
  constructor(private measurement: string) {
    super(measurement);
  }


  public async writePointBatched(point: T, batchLimit: number = 10000) {
    await this.writePoints([point], batchLimit);
  }

  public async writePoint(point: T, batchLimit: number = 10000) {
    await this.writePoints([point], batchLimit);
  }

  public async writePoints(points: T[], batchLimit: number = 10000) {
    while (this.lock) await new Promise((r) => setTimeout(r, 10));
    this.points.push(...points);
    if (this.points.length > batchLimit) await this.exec();
  }

  public pending() {
    return this.points.length;
  }

  public async exec(force = false) {
    if (this.points.length === 0) return;
    while (this.lock && !force) await new Promise((r) => setTimeout(r, 10));
    this.lock = true;
    const start = Date.now();
    await super.writePoints(this.points);
    this.lock = false;
    console.log(
      `batch ${this.measurement} ${this.points.length} points - elapsed ${
        Date.now() - start
      }ms`,
    );
    this.points = [];
  }
}
