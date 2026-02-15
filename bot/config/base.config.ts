/**
 * Base Chain Configuration
 * 
 * Network parameters and RPC endpoints for Base L2
 */

export const BASE_CONFIG = {
  // Network Identification
  CHAIN_ID: 8453,
  NETWORK_NAME: 'base',
  NETWORK_DISPLAY_NAME: 'Base',
  
  // RPC Endpoints (in priority order)
  RPC_ENDPOINTS: [
    'https://mainnet.base.org',
    'https://base.llamarpc.com',
    'https://base-mainnet.public.blastapi.io',
    'https://base.blockpi.network/v1/rpc/public',
    'https://1rpc.io/base',
  ],
  
  // Block Explorer
  BLOCK_EXPLORER: 'https://basescan.org',
  BLOCK_EXPLORER_API: 'https://api.basescan.org/api',
  
  // Native Token
  NATIVE_TOKEN: {
    symbol: 'ETH',
    decimals: 18,
    name: 'Ethereum',
  },
  
  // Wrapped Native Token
  WETH: '0x4200000000000000000000000000000000000006',
  
  // Stablecoins
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  USDBC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', // Bridged USDC
  DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
  
  // Major Tokens
  WBTC: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c',
  cbETH: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
  
  // Block Time
  BLOCK_TIME: 2, // ~2 seconds per block
  
  // Gas Configuration
  GAS_CONFIG: {
    // EIP-1559 parameters
    MAX_PRIORITY_FEE_PER_GAS: 0.001e9, // 0.001 gwei (Base has very low priority fees)
    MAX_FEE_PER_GAS_MULTIPLIER: 1.5, // Multiply base fee by this for max fee
    
    // Gas limits
    SIMPLE_TRANSFER: 21000n,
    ERC20_TRANSFER: 65000n,
    SWAP_GAS_BASE: 150000n,
    SWAP_GAS_PER_HOP: 100000n,
    FLASH_LOAN_BASE: 80000n,
    V2_SWAP_GAS: 110000n,
    V3_SWAP_GAS: 150000n,
    
    // Safety margins
    GAS_LIMIT_MULTIPLIER: 1.2, // Add 20% safety margin
    
    // Dynamic gas modeling
    MIN_BASE_FEE: 0.001e9, // 0.001 gwei
    MAX_BASE_FEE: 100e9, // 100 gwei
    EXPECTED_BASE_FEE: 0.01e9, // 0.01 gwei (typical for Base)
  },
  
  // Oracle Configuration
  CHAINLINK_FEEDS: {
    ETH_USD: '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70',
    BTC_USD: '0x64c911996D3c6aC71f9b455B1E8E7266BcbD848F',
    USDC_USD: '0x7e860098F58bBFC8648a4311b374B1D669a2bc6B',
  },
  
  // MEV Configuration
  MEV_CONFIG: {
    FLASHBOTS_RPC: 'https://rpc.titanbuilder.xyz', // Titan Builder for Base
    PRIVATE_RPC_ENDPOINTS: [
      'https://rpc.titanbuilder.xyz',
    ],
    
    // Bundle configuration
    BLOCK_LOOKAHEAD: 3, // Target blocks ahead
    MAX_BUNDLE_SIZE: 3, // Max transactions per bundle
    MIN_PROFIT_USD: 5, // Minimum profit to submit bundle
    
    // Simulation
    SIMULATE_BEFORE_SEND: true,
    MAX_SIMULATION_RETRIES: 2,
  },
  
  // Mempool Configuration
  MEMPOOL_CONFIG: {
    ENABLE_MONITORING: true,
    SUBSCRIPTION_ENDPOINT: 'wss://mainnet.base.org',
    FILTER_MIN_VALUE_USD: 1000, // Only monitor txs > $1000
  },
  
  // Rate Limiting
  RATE_LIMITS: {
    RPC_CALLS_PER_SECOND: 10,
    RPC_CALLS_PER_MINUTE: 300,
    BURST_SIZE: 20,
  },
  
  // Retry Configuration
  RETRY_CONFIG: {
    MAX_RETRIES: 3,
    INITIAL_DELAY: 1000, // 1 second
    MAX_DELAY: 10000, // 10 seconds
    EXPONENTIAL_BACKOFF: true,
  },
  
  // Health Check
  HEALTH_CHECK: {
    BLOCK_DELAY_THRESHOLD: 30, // Alert if node is 30 seconds behind
    MIN_PEER_COUNT: 3,
    CHECK_INTERVAL: 30000, // 30 seconds
  },
  
  // Fork Testing Configuration
  FORK_CONFIG: {
    FORK_BLOCK_NUMBER: undefined, // Use latest if undefined
    FORK_ACCOUNTS: [
      // Impersonate accounts with funds for testing
      '0x3304E22DDaa22bCdC5fCa2269b418046aE7b566A', // Aave V3 Pool
      '0xF977814e90dA44bFA03b6295A0616a897441aceC', // Binance hot wallet
    ],
  },
} as const;

/**
 * Get active RPC endpoint with fallback
 */
export async function getActiveRpcEndpoint(): Promise<string> {
  for (const endpoint of BASE_CONFIG.RPC_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_blockNumber',
          params: [],
        }),
      });
      
      if (response.ok) {
        return endpoint;
      }
    } catch (error) {
      continue;
    }
  }
  
  // Fallback to first endpoint
  return BASE_CONFIG.RPC_ENDPOINTS[0];
}

/**
 * Convert wei to ETH
 */
export function weiToEth(wei: bigint): number {
  return Number(wei) / 1e18;
}

/**
 * Convert ETH to wei
 */
export function ethToWei(eth: number): bigint {
  return BigInt(Math.floor(eth * 1e18));
}

/**
 * Format gas price for display
 */
export function formatGasPrice(gasPrice: bigint): string {
  const gwei = Number(gasPrice) / 1e9;
  return `${gwei.toFixed(4)} gwei`;
}

/**
 * Calculate gas cost in USD
 */
export function calculateGasCostUSD(
  gasUsed: bigint,
  gasPrice: bigint,
  ethPriceUSD: number
): number {
  const ethCost = weiToEth(gasUsed * gasPrice);
  return ethCost * ethPriceUSD;
}

export type BaseConfig = typeof BASE_CONFIG;
