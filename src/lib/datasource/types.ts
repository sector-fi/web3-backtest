export abstract class DataSource<T = DataSnapshot<any>> {
  abstract get id(): string;
  abstract get info(): DataSourceInfo;
  abstract init(): Promise<void>;
  abstract fetch(from: number, to: number, limit?: number): Promise<T[]>;
}

export type Chains = 'ethereum' | 'arbitrum' | 'optimism' | 'avalanche';

export type Protocols =
  | 'aave'
  | 'camelot-dex'
  | 'camelot-farm'
  | 'velodrome-dex'
  | 'curve-dex'
  | 'uniswap-dex'
  | 'joes-v2-dex'
  | 'sonne';

export type Resolution = '1m' | '1h' | '1d' | 'swap';

export type DataSourceInfo = {
  id?: string; // optional id for the datasource
  chain: Chains;
  protocol: Protocols;
  resolution: Resolution;
  config?: any;
};
export type DataSourceRegister = {
  id?: string; // optional id for the datasource
  chain: Chains;
  protocol: Protocols;
  resolutions: Resolution[];
  config?: any;
};

export type DataSnapshot<T> = {
  timestamp: number;
  data: { [key: string]: T[] };
};
