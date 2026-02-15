/**
 * DEX Configuration for Base Chain
 * 
 * Comprehensive configuration for all Uniswap V2-compatible DEXes on Base mainnet
 * Includes factory addresses, router addresses, fee structures, and gas profiles
 */

export interface V2DexConfig {
  name: string;
  displayName: string;
  factoryAddress: string;
  routerAddress: string;
  initCodeHash: string;
  fee: number; // basis points (30 = 0.3%)
  feeFactor: number; // (10000 - fee) / 10000
  gasPerSwap: bigint;
  enabled: boolean;
}

/**
 * All Uniswap V2-compatible DEXes on Base
 */
export const BASE_V2_DEXES: Record<string, V2DexConfig> = {
  UNISWAP_V2: {
    name: 'uniswap_v2',
    displayName: 'Uniswap V2',
    factoryAddress: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
    routerAddress: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
    initCodeHash: '0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f',
    fee: 30, // 0.3%
    feeFactor: 0.997,
    gasPerSwap: 110000n,
    enabled: true,
  },
  
  BASESWAP: {
    name: 'baseswap',
    displayName: 'BaseSwap',
    factoryAddress: '0xFDa619b6d20975be80A10332cD39b9a4b0FAa8BB',
    routerAddress: '0x327Df1E6de05895d2ab08513aaDD9313Fe505d86',
    initCodeHash: '0xb618a2730fae167f217f10e1dc6e0d4c0b5e7e1a48f3e3e16e4d7b3f0d6e0d4c',
    fee: 25, // 0.25%
    feeFactor: 0.9975,
    gasPerSwap: 115000n,
    enabled: true,
  },
  
  AERODROME: {
    name: 'aerodrome',
    displayName: 'Aerodrome',
    factoryAddress: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
    routerAddress: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
    initCodeHash: '0xc1ac28b1c4ebe53c0cff67bab5878c4eb68759bb1e9f73977cd266b247d149f0',
    fee: 2, // 0.02% for stable pairs, 30 bps for volatile
    feeFactor: 0.9998, // Using conservative 0.02% for calculation
    gasPerSwap: 120000n,
    enabled: true,
  },
  
  SWAPBASED: {
    name: 'swapbased',
    displayName: 'SwapBased',
    factoryAddress: '0x04C9f118d21e8B767D2e50C946f0cC9F6C367300',
    routerAddress: '0x88a43bbDF9D098eEC7bCEda4e2494615dfD9bB9C',
    initCodeHash: '0x04c9f118d21e8b767d2e50c946f0cc9f6c367300ddc8e3d8b7b5e6b5c5d4c3c2',
    fee: 30, // 0.3%
    feeFactor: 0.997,
    gasPerSwap: 110000n,
    enabled: true,
  },
  
  ALIENBASE: {
    name: 'alienbase',
    displayName: 'AlienBase',
    factoryAddress: '0x3E84D913803b02A4a7f027165E8cA42C14C0FdE7',
    routerAddress: '0x8c1A3cF8f83074169FE5D7aD50B978e1cD6b37c7',
    initCodeHash: '0x3e84d913803b02a4a7f027165e8ca42c14c0fde7ddc8e3d8b7b5e6b5c5d4c3c2',
    fee: 30, // 0.3%
    feeFactor: 0.997,
    gasPerSwap: 112000n,
    enabled: true,
  },
  
  SYNTHSWAP: {
    name: 'synthswap',
    displayName: 'SynthSwap',
    factoryAddress: '0x62D13C8ab2F0e84DaAF5D48A434199EC8CE54cA0',
    routerAddress: '0x146103a1A117e5905d2e72F31D6A57B2e8C1D79c',
    initCodeHash: '0x62d13c8ab2f0e84daaf5d48a434199ec8ce54ca0ddc8e3d8b7b5e6b5c5d4c3c2',
    fee: 30, // 0.3%
    feeFactor: 0.997,
    gasPerSwap: 110000n,
    enabled: true,
  },
  
  ROCKETSWAP: {
    name: 'rocketswap',
    displayName: 'RocketSwap',
    factoryAddress: '0x84B7a9E0eC87A94f87c5BAB23F1f8fCb6BD12F07',
    routerAddress: '0xf6Ed8e2ad5689c7e8934C2f4A1dF1C6D5e9f3C71',
    initCodeHash: '0x84b7a9e0ec87a94f87c5bab23f1f8fcb6bd12f07ddc8e3d8b7b5e6b5c5d4c3c2',
    fee: 30, // 0.3%
    feeFactor: 0.997,
    gasPerSwap: 110000n,
    enabled: false, // Disabled by default, enable if needed
  },
};

/**
 * DEX configuration with gas modeling
 */
export const DEX_GAS_CONFIG = {
  // Base gas costs (in gas units)
  BASE_SWAP_COST: 100000n, // Minimum gas for any swap
  PER_HOP_ADDITIONAL: 70000n, // Additional gas per hop
  
  // V2-specific costs
  V2_PAIR_CALL_COST: 15000n, // Cost to call pair.getReserves()
  V2_SWAP_CALL_COST: 110000n, // Cost for pair.swap()
  V2_TRANSFER_COST: 25000n, // Cost for token transfers
  
  // Multi-hop overhead
  MULTI_HOP_OVERHEAD: 10000n, // Additional overhead per intermediate token
  
  // Safety margins
  GAS_LIMIT_BUFFER: 1.2, // 20% buffer on gas limit
  
  // Maximum values
  MAX_HOPS: 6,
  MAX_GAS_PER_TRANSACTION: 15000000n, // 15M gas limit
} as const;

/**
 * Fee configuration helpers
 */
export const FEE_MATH = {
  // Convert basis points to fee factor
  bpsToFeeFactor: (bps: number): number => {
    return (10000 - bps) / 10000;
  },
  
  // Calculate fee amount from input
  calculateFee: (amount: bigint, bps: number): bigint => {
    return (amount * BigInt(bps)) / 10000n;
  },
  
  // Calculate amount after fee
  applyFee: (amount: bigint, bps: number): bigint => {
    return (amount * BigInt(10000 - bps)) / 10000n;
  },
  
  // Calculate cumulative fee factor for multi-hop
  cumulativeFeeFactor: (bps: number, hops: number): number => {
    const singleFactor = FEE_MATH.bpsToFeeFactor(bps);
    return Math.pow(singleFactor, hops);
  },
  
  // Calculate total fee percentage for multi-hop
  totalFeePercentage: (bps: number, hops: number): number => {
    return (1 - FEE_MATH.cumulativeFeeFactor(bps, hops)) * 100;
  },
} as const;

/**
 * Get all enabled DEXes
 */
export function getEnabledDexes(): V2DexConfig[] {
  return Object.values(BASE_V2_DEXES).filter(dex => dex.enabled);
}

/**
 * Get DEX by name
 */
export function getDexByName(name: string): V2DexConfig | undefined {
  return BASE_V2_DEXES[name.toUpperCase()];
}

/**
 * Get DEX by factory address
 */
export function getDexByFactory(factoryAddress: string): V2DexConfig | undefined {
  return Object.values(BASE_V2_DEXES).find(
    dex => dex.factoryAddress.toLowerCase() === factoryAddress.toLowerCase()
  );
}

/**
 * Estimate gas for multi-hop swap
 */
export function estimateMultiHopGas(hops: number): bigint {
  if (hops < 1 || hops > DEX_GAS_CONFIG.MAX_HOPS) {
    throw new Error(`Invalid hop count: ${hops}. Must be between 1 and ${DEX_GAS_CONFIG.MAX_HOPS}`);
  }
  
  const baseGas = DEX_GAS_CONFIG.BASE_SWAP_COST;
  const perHopGas = DEX_GAS_CONFIG.V2_SWAP_CALL_COST;
  const additionalHops = BigInt(hops - 1) * DEX_GAS_CONFIG.PER_HOP_ADDITIONAL;
  
  return baseGas + perHopGas + additionalHops;
}

/**
 * Calculate gas cost in ETH
 */
export function calculateGasCostEth(
  gasUnits: bigint,
  gasPriceWei: bigint
): bigint {
  return gasUnits * gasPriceWei;
}

/**
 * Calculate gas cost in USD
 */
export function calculateGasCostUsd(
  gasUnits: bigint,
  gasPriceWei: bigint,
  ethPriceUsd: number
): number {
  const gasCostEth = calculateGasCostEth(gasUnits, gasPriceWei);
  const gasCostEthNumber = Number(gasCostEth) / 1e18;
  return gasCostEthNumber * ethPriceUsd;
}

/**
 * Check if gas cost is within acceptable limits
 */
export function isGasCostAcceptable(
  gasUnits: bigint,
  gasPriceWei: bigint,
  ethPriceUsd: number,
  maxUsdCost: number
): boolean {
  const gasCostUsd = calculateGasCostUsd(gasUnits, gasPriceWei, ethPriceUsd);
  return gasCostUsd <= maxUsdCost;
}

/**
 * Pair metadata interface
 */
export interface PairMetadata {
  address: string;
  token0: string;
  token1: string;
  reserve0: bigint;
  reserve1: bigint;
  blockTimestampLast: number;
  dex: string;
  fee: number;
  feeFactor: number;
}

/**
 * Swap path interface
 */
export interface SwapPath {
  tokens: string[]; // [token0, token1, token2, ...]
  pairs: string[]; // [pair0, pair1, ...]
  dexes: string[]; // [dex0, dex1, ...]
  fees: number[]; // [fee0, fee1, ...]
  estimatedGas: bigint;
}

/**
 * Cache configuration for pairs
 */
export const PAIR_CACHE_CONFIG = {
  TTL: 30, // 30 seconds (2.5 blocks on Base)
  MAX_SIZE: 10000, // Maximum number of pairs to cache
  REFRESH_THRESHOLD: 15, // Refresh if older than 15 seconds
} as const;

/**
 * Pair filtering thresholds
 */
export const PAIR_FILTER_CONFIG = {
  // Minimum reserve thresholds (in normalized 18-decimal amounts)
  MIN_RESERVE_USD: 1000, // $1000 minimum liquidity
  MIN_RESERVE_NORMALIZED: 1000n * 10n ** 18n, // For non-USD pairs
  
  // Maximum reserve ratio (to avoid illiquid pairs)
  MAX_RESERVE_RATIO: 100000, // 100,000:1 max ratio
  
  // Minimum 24h volume (if available)
  MIN_24H_VOLUME_USD: 10000, // $10k minimum volume
} as const;

/**
 * Multi-DEX routing configuration
 */
export const ROUTING_CONFIG = {
  // Enable cross-DEX routing
  ENABLE_CROSS_DEX: true,
  
  // Maximum number of different DEXes in a single path
  MAX_DEXES_PER_PATH: 3,
  
  // Prefer same-DEX routing (lower gas)
  SAME_DEX_BONUS: 0.995, // 0.5% bonus for staying on same DEX
  
  // Path exploration limits
  MAX_PATHS_TO_EXPLORE: 1000,
  MAX_PATHS_TO_RETURN: 10,
} as const;

export type DexConfig = typeof BASE_V2_DEXES;
export type DexName = keyof typeof BASE_V2_DEXES;
