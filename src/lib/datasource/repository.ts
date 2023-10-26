import { AaveDataSource } from './Aave.js';
import { AaveArbitrumDataSource } from './aaveArbitrum.js';
import { CamelotDexDataSource } from './camelotDex.js';
import { CamelotFarmDataSource } from './camelotFarm.js';
import { CurveDexDataSource } from './curveDex.js';
import { DataSource, DataSourceInfo, DataSourceRegister } from './types.js';
import { VelodromeDexDataSource } from './velodromeDex.js';
import { Uni3DexDataSource } from './univ3Dex.js';
import { SonneDataSource } from './sonne.js';
import { JoesV2DexDataSource } from './joesv2Dex.js';

type DataSourceEntry = DataSourceRegister & {
  createSource: (info: DataSourceInfo) => DataSource;
};

// TODO - Temporary solution, this needs to be more generic.
export const DataSourcesRepo: DataSourceEntry[] = [
  {
    chain: 'arbitrum',
    protocol: 'aave',
    resolutions: ['1h'],
    createSource: AaveDataSource.create,
  },
  {
    chain: 'optimism',
    protocol: 'aave',
    resolutions: ['1h'],
    createSource: AaveDataSource.create,
  },
  {
    chain: 'arbitrum',
    protocol: 'camelot-farm',
    resolutions: ['1h'],
    createSource: CamelotFarmDataSource.create,
  },
  {
    chain: 'optimism',
    protocol: 'velodrome-dex',
    resolutions: ['1m'],
    createSource: VelodromeDexDataSource.create,
  },
  {
    chain: 'ethereum',
    protocol: 'curve-dex',
    resolutions: ['1m'],
    createSource: CurveDexDataSource.create,
  },
  {
    chain: 'ethereum',
    protocol: 'uniswap-dex',
    resolutions: ['1h'],
    createSource: Uni3DexDataSource.create,
  },
  {
    chain: 'arbitrum',
    protocol: 'camelot-dex',
    resolutions: ['1h', 'swap'],
    createSource: Uni3DexDataSource.create,
  },
  {
    chain: 'arbitrum',
    protocol: 'uniswap-dex',
    resolutions: ['1h'],
    createSource: Uni3DexDataSource.create,
  },
  {
    chain: 'optimism',
    protocol: 'sonne',
    resolutions: ['1h'],
    createSource: SonneDataSource.create,
  },
  {
    chain: 'optimism',
    protocol: 'sonne',
    resolutions: ['1h'],
    createSource: SonneDataSource.create,
  },
  {
    chain: 'avalanche',
    protocol: 'joes-v2-dex',
    resolutions: ['1h'],
    createSource: JoesV2DexDataSource.create,
  },
];
