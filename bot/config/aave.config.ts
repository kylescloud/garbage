/**
 * AAVE V3 Base Configuration
 * 
 * All contract addresses for Aave V3 protocol on Base mainnet
 * Source: https://docs.aave.com/developers/deployed-contracts/v3-mainnet/base
 */

export const AAVE_V3_BASE_CONFIG = {
  // Core Protocol Contracts
  POOL: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
  POOL_IMPL: '0x527F6070103A44e65a56Bb7e46eec97050113B9a',
  POOL_CONFIGURATOR: '0x5731a04B1b0A13E38Ff96895d776a93e1d0C9e5b',
  POOL_CONFIGURATOR_IMPL: '0x04caE5409636E0E4e5eEd3A9e9d63fd71FD2a4e2',
  POOL_ADDRESSES_PROVIDER: '0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D',
  POOL_ADDRESSES_PROVIDER_REGISTRY: '0x2f6571d3Eb9a4e350C68C36bCD2afe39530078E2',
  
  // Data Providers
  POOL_DATA_PROVIDER: '0x2d8A3C5677189723C4cB8873CfC9C8976FDF38Ac',
  AAVE_ORACLE: '0x2Cc0Fc26eD4563A5ce5e8bdcfe1A2878676Ae156',
  
  // Periphery Contracts
  ACL_MANAGER: '0x43955b0899Ab7232E3a454cf84AedD22Ad46FD33',
  ACL_ADMIN: '0xF7a74E0A464d91D88f91F801Dd0aA8C5D4cD0E5A',
  COLLECTOR: '0x4F7e6ee0D0d8fE2b3B92d8eA8Cf62B9F2FdA5891',
  COLLECTOR_CONTROLLER: '0x6a1f0F26C0f8419e2f38Bbe8BF60D8f35f8E9B6b',
  
  // UI Helpers
  UI_POOL_DATA_PROVIDER: '0x5d4D4007A4c6336550DdAa2a7c0d5e7972eeeA20',
  UI_INCENTIVE_DATA_PROVIDER: '0x0B15EFbC0AB47dF3b0B63c9aD80d9F1f5EaBD5E9',
  
  // Wallets
  EMISSION_MANAGER: '0x5C3aCF5E1D3DbF8e0E8C55A8d2ed9E3fF6B8f0E5',
  
  // Flash Loan Configuration
  FLASH_LOAN_PREMIUM_TOTAL: 9, // 9 basis points (0.09%)
  FLASH_LOAN_PREMIUM_TO_PROTOCOL: 0, // 0 basis points
  
  // Network Configuration
  CHAIN_ID: 8453, // Base mainnet
  NETWORK_NAME: 'base',
  
  // Reserve Configuration Bitmap Layout
  CONFIG_BITS: {
    LTV_MASK: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0000,
    LIQUIDATION_THRESHOLD_MASK: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0000FFFF,
    LIQUIDATION_BONUS_MASK: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0000FFFFFFFF,
    DECIMALS_MASK: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00FFFFFFFFFFFF,
    ACTIVE_MASK: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFFFFFFFFFF,
    FROZEN_MASK: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFDFFFFFFFFFFFFFF,
    BORROWING_MASK: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFBFFFFFFFFFFFFFF,
    STABLE_BORROWING_MASK: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF7FFFFFFFFFFFFFF,
    PAUSED_MASK: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFFFFFFFFFFF,
    BORROWABLE_IN_ISOLATION_MASK: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFDFFFFFFFFFFFFFFF,
    SILOED_BORROWING_MASK: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFBFFFFFFFFFFFFFFF,
    FLASHLOAN_ENABLED_MASK: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF7FFFFFFFFFFFFFFF,
    RESERVE_FACTOR_MASK: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0000FFFFFFFFFFFFFFFF,
  },
  
  // Bit positions for reserve configuration
  CONFIG_BIT_POSITIONS: {
    LTV_START: 0,
    LIQUIDATION_THRESHOLD_START: 16,
    LIQUIDATION_BONUS_START: 32,
    DECIMALS_START: 48,
    ACTIVE_START: 56,
    FROZEN_START: 57,
    BORROWING_ENABLED_START: 58,
    STABLE_BORROWING_ENABLED_START: 59,
    PAUSED_START: 60,
    BORROWABLE_IN_ISOLATION_START: 61,
    SILOED_BORROWING_START: 62,
    FLASHLOAN_ENABLED_START: 63,
    RESERVE_FACTOR_START: 64,
  },
  
  // RAY precision (Aave uses 27 decimals for rates)
  RAY: 10n ** 27n,
  WAD: 10n ** 18n,
  
  // Minimum liquidity thresholds (in USD)
  MIN_LIQUIDITY_USD: 100, // Minimum $100 available liquidity
  MIN_LOAN_SIZE_USD: 50, // Minimum $50 flash loan size
  
  // Cache TTL (seconds)
  RESERVE_CACHE_TTL: 60, // 1 minute
  LIQUIDITY_CACHE_TTL: 12, // 12 seconds (~1 block on Base)
} as const;

/**
 * Helper function to extract configuration bits
 */
export function extractConfigBit(
  config: bigint,
  bitPosition: number
): boolean {
  return ((config >> BigInt(bitPosition)) & 1n) === 1n;
}

/**
 * Helper function to extract configuration value
 */
export function extractConfigValue(
  config: bigint,
  startBit: number,
  length: number
): bigint {
  const mask = (1n << BigInt(length)) - 1n;
  return (config >> BigInt(startBit)) & mask;
}

/**
 * Decode full reserve configuration
 */
export interface ReserveConfiguration {
  ltv: bigint;
  liquidationThreshold: bigint;
  liquidationBonus: bigint;
  decimals: bigint;
  active: boolean;
  frozen: boolean;
  borrowingEnabled: boolean;
  stableBorrowingEnabled: boolean;
  paused: boolean;
  borrowableInIsolation: boolean;
  siloedBorrowing: boolean;
  flashloanEnabled: boolean;
  reserveFactor: bigint;
}

export function decodeReserveConfiguration(config: bigint): ReserveConfiguration {
  const { CONFIG_BIT_POSITIONS } = AAVE_V3_BASE_CONFIG;
  
  return {
    ltv: extractConfigValue(config, CONFIG_BIT_POSITIONS.LTV_START, 16),
    liquidationThreshold: extractConfigValue(config, CONFIG_BIT_POSITIONS.LIQUIDATION_THRESHOLD_START, 16),
    liquidationBonus: extractConfigValue(config, CONFIG_BIT_POSITIONS.LIQUIDATION_BONUS_START, 16),
    decimals: extractConfigValue(config, CONFIG_BIT_POSITIONS.DECIMALS_START, 8),
    active: extractConfigBit(config, CONFIG_BIT_POSITIONS.ACTIVE_START),
    frozen: extractConfigBit(config, CONFIG_BIT_POSITIONS.FROZEN_START),
    borrowingEnabled: extractConfigBit(config, CONFIG_BIT_POSITIONS.BORROWING_ENABLED_START),
    stableBorrowingEnabled: extractConfigBit(config, CONFIG_BIT_POSITIONS.STABLE_BORROWING_ENABLED_START),
    paused: extractConfigBit(config, CONFIG_BIT_POSITIONS.PAUSED_START),
    borrowableInIsolation: extractConfigBit(config, CONFIG_BIT_POSITIONS.BORROWABLE_IN_ISOLATION_START),
    siloedBorrowing: extractConfigBit(config, CONFIG_BIT_POSITIONS.SILOED_BORROWING_START),
    flashloanEnabled: extractConfigBit(config, CONFIG_BIT_POSITIONS.FLASHLOAN_ENABLED_START),
    reserveFactor: extractConfigValue(config, CONFIG_BIT_POSITIONS.RESERVE_FACTOR_START, 16),
  };
}

export type AaveV3BaseConfig = typeof AAVE_V3_BASE_CONFIG;
