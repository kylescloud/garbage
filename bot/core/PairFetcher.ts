/**
 * PairFetcher
 * 
 * Fetches and caches all Uniswap V2 pairs from multiple DEXes on Base.
 * Implements complete pair discovery, reserve fetching, and metadata storage.
 * 
 * Mathematical Foundation: See PHASE_2_MATHEMATICAL_FOUNDATION.md
 */

import { ethers } from 'ethers';
import {
  BASE_V2_DEXES,
  getEnabledDexes,
  getDexByFactory,
  type V2DexConfig,
  type PairMetadata,
  PAIR_CACHE_CONFIG,
  PAIR_FILTER_CONFIG,
} from '../config/dex.config';
import { BASE_CONFIG } from '../config/base.config';

/**
 * Factory ABI (minimal)
 */
const FACTORY_ABI = [
  'function allPairsLength() external view returns (uint256)',
  'function allPairs(uint256 index) external view returns (address)',
  'function getPair(address tokenA, address tokenB) external view returns (address)',
];

/**
 * Pair ABI (minimal)
 */
const PAIR_ABI = [
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function factory() external view returns (address)',
];

/**
 * ERC20 ABI (minimal)
 */
const ERC20_ABI = [
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
  'function name() external view returns (string)',
];

/**
 * Cache entry with TTL
 */
interface CacheEntry {
  pairs: PairMetadata[];
  timestamp: number;
  blockNumber: number;
}

/**
 * Token metadata cache
 */
interface TokenMetadata {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

export class PairFetcher {
  private provider: ethers.JsonRpcProvider;
  private cache: Map<string, CacheEntry> = new Map();
  private tokenMetadataCache: Map<string, TokenMetadata> = new Map();
  private allPairsCache: PairMetadata[] | null = null;
  private allPairsCacheTimestamp: number = 0;
  
  constructor(provider: ethers.JsonRpcProvider) {
    this.provider = provider;
  }
  
  /**
   * Fetch all pairs from all enabled DEXes
   * Uses cache if available and not expired
   */
  async fetchAllPairs(forceRefresh: boolean = false): Promise<PairMetadata[]> {
    // Check cache
    if (!forceRefresh && this.allPairsCache) {
      const age = Date.now() - this.allPairsCacheTimestamp;
      if (age < PAIR_CACHE_CONFIG.TTL * 1000) {
        console.log(`Using cached pairs (age: ${age}ms, count: ${this.allPairsCache.length})`);
        return this.allPairsCache;
      }
    }
    
    console.log('Fetching pairs from all DEXes...');
    const startTime = Date.now();
    
    const enabledDexes = getEnabledDexes();
    console.log(`Enabled DEXes: ${enabledDexes.map(d => d.displayName).join(', ')}`);
    
    // Fetch pairs from all DEXes in parallel
    const pairPromises = enabledDexes.map(dex => this.fetchPairsFromDex(dex));
    const pairArrays = await Promise.all(pairPromises);
    
    // Flatten and deduplicate
    const allPairs: PairMetadata[] = [];
    const seenAddresses = new Set<string>();
    
    for (const pairs of pairArrays) {
      for (const pair of pairs) {
        const key = pair.address.toLowerCase();
        if (!seenAddresses.has(key)) {
          seenAddresses.add(key);
          allPairs.push(pair);
        }
      }
    }
    
    // Sort by total liquidity (reserve0 * reserve1)
    allPairs.sort((a, b) => {
      const liquidityA = a.reserve0 * a.reserve1;
      const liquidityB = b.reserve0 * b.reserve1;
      if (liquidityB > liquidityA) return 1;
      if (liquidityB < liquidityA) return -1;
      return 0;
    });
    
    // Update cache
    this.allPairsCache = allPairs;
    this.allPairsCacheTimestamp = Date.now();
    
    const elapsed = Date.now() - startTime;
    console.log(`Fetched ${allPairs.length} unique pairs in ${elapsed}ms`);
    
    return allPairs;
  }
  
  /**
   * Fetch all pairs from a specific DEX
   */
  async fetchPairsFromDex(dexConfig: V2DexConfig): Promise<PairMetadata[]> {
    const cacheKey = dexConfig.factoryAddress.toLowerCase();
    
    // Check cache
    const cachedEntry = this.cache.get(cacheKey);
    if (cachedEntry) {
      const age = Date.now() - cachedEntry.timestamp;
      if (age < PAIR_CACHE_CONFIG.TTL * 1000) {
        return cachedEntry.pairs;
      }
    }
    
    console.log(`Fetching pairs from ${dexConfig.displayName}...`);
    const startTime = Date.now();
    
    try {
      const factoryContract = new ethers.Contract(
        dexConfig.factoryAddress,
        FACTORY_ABI,
        this.provider
      );
      
      // Get total number of pairs
      const pairCount = await factoryContract.allPairsLength();
      const pairCountNum = Number(pairCount);
      console.log(`  ${dexConfig.displayName}: ${pairCountNum} pairs`);
      
      if (pairCountNum === 0) {
        return [];
      }
      
      // Fetch pair addresses in batches
      const batchSize = 100;
      const pairAddresses: string[] = [];
      
      for (let i = 0; i < pairCountNum; i += batchSize) {
        const batchEnd = Math.min(i + batchSize, pairCountNum);
        const batchPromises: Promise<string>[] = [];
        
        for (let j = i; j < batchEnd; j++) {
          batchPromises.push(factoryContract.allPairs(j));
        }
        
        const batchResults = await Promise.all(batchPromises);
        pairAddresses.push(...batchResults);
      }
      
      // Fetch pair metadata in parallel (with rate limiting)
      const pairMetadataPromises: Promise<PairMetadata | null>[] = [];
      
      for (const pairAddress of pairAddresses) {
        pairMetadataPromises.push(
          this.fetchPairMetadata(pairAddress, dexConfig)
        );
      }
      
      const pairMetadataResults = await Promise.all(pairMetadataPromises);
      
      // Filter out null results (failed fetches) and apply filters
      const validPairs = pairMetadataResults.filter(
        (pair): pair is PairMetadata => pair !== null && this.isValidPair(pair)
      );
      
      // Update cache
      const blockNumber = await this.provider.getBlockNumber();
      this.cache.set(cacheKey, {
        pairs: validPairs,
        timestamp: Date.now(),
        blockNumber,
      });
      
      const elapsed = Date.now() - startTime;
      console.log(`  ${dexConfig.displayName}: Fetched ${validPairs.length} valid pairs in ${elapsed}ms`);
      
      return validPairs;
    } catch (error) {
      console.error(`Error fetching pairs from ${dexConfig.displayName}:`, error);
      return [];
    }
  }
  
  /**
   * Fetch metadata for a single pair
   */
  private async fetchPairMetadata(
    pairAddress: string,
    dexConfig: V2DexConfig
  ): Promise<PairMetadata | null> {
    try {
      const pairContract = new ethers.Contract(
        pairAddress,
        PAIR_ABI,
        this.provider
      );
      
      // Fetch all data in parallel
      const [token0, token1, reserves] = await Promise.all([
        pairContract.token0(),
        pairContract.token1(),
        pairContract.getReserves(),
      ]);
      
      return {
        address: pairAddress,
        token0: token0,
        token1: token1,
        reserve0: BigInt(reserves.reserve0.toString()),
        reserve1: BigInt(reserves.reserve1.toString()),
        blockTimestampLast: Number(reserves.blockTimestampLast),
        dex: dexConfig.name,
        fee: dexConfig.fee,
        feeFactor: dexConfig.feeFactor,
      };
    } catch (error) {
      console.error(`Error fetching pair metadata for ${pairAddress}:`, error);
      return null;
    }
  }
  
  /**
   * Validate if a pair meets minimum criteria
   * 
   * Validation criteria:
   * 1. Both reserves > 0
   * 2. Reserve ratio within acceptable range
   * 3. Minimum liquidity threshold met
   */
  private isValidPair(pair: PairMetadata): boolean {
    // Check reserves are positive
    if (pair.reserve0 <= 0n || pair.reserve1 <= 0n) {
      return false;
    }
    
    // Check reserve ratio (avoid extremely imbalanced pairs)
    const ratio0 = pair.reserve0 / pair.reserve1;
    const ratio1 = pair.reserve1 / pair.reserve0;
    const maxRatio = BigInt(PAIR_FILTER_CONFIG.MAX_RESERVE_RATIO);
    
    if (ratio0 > maxRatio || ratio1 > maxRatio) {
      return false;
    }
    
    // Check minimum liquidity (geometric mean of reserves)
    // sqrt(reserve0 * reserve1) should be above threshold
    // We approximate: if reserve0 * reserve1 > threshold^2, then pair is valid
    const liquidityProduct = pair.reserve0 * pair.reserve1;
    const minLiquidity = PAIR_FILTER_CONFIG.MIN_RESERVE_NORMALIZED;
    const minLiquiditySquared = minLiquidity * minLiquidity;
    
    if (liquidityProduct < minLiquiditySquared) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Find pairs containing a specific token
   */
  async findPairsWithToken(tokenAddress: string): Promise<PairMetadata[]> {
    const allPairs = await this.fetchAllPairs();
    const normalizedAddress = tokenAddress.toLowerCase();
    
    return allPairs.filter(pair =>
      pair.token0.toLowerCase() === normalizedAddress ||
      pair.token1.toLowerCase() === normalizedAddress
    );
  }
  
  /**
   * Find pair for a specific token pair
   */
  async findPair(
    tokenA: string,
    tokenB: string,
    dexName?: string
  ): Promise<PairMetadata | null> {
    const allPairs = await this.fetchAllPairs();
    
    const normalizedA = tokenA.toLowerCase();
    const normalizedB = tokenB.toLowerCase();
    
    for (const pair of allPairs) {
      // Check if DEX filter matches
      if (dexName && pair.dex !== dexName.toLowerCase()) {
        continue;
      }
      
      const token0Lower = pair.token0.toLowerCase();
      const token1Lower = pair.token1.toLowerCase();
      
      // Check both orderings
      if (
        (token0Lower === normalizedA && token1Lower === normalizedB) ||
        (token0Lower === normalizedB && token1Lower === normalizedA)
      ) {
        return pair;
      }
    }
    
    return null;
  }
  
  /**
   * Get token metadata (cached)
   */
  async getTokenMetadata(tokenAddress: string): Promise<TokenMetadata | null> {
    const normalizedAddress = tokenAddress.toLowerCase();
    
    // Check cache
    if (this.tokenMetadataCache.has(normalizedAddress)) {
      return this.tokenMetadataCache.get(normalizedAddress)!;
    }
    
    try {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ERC20_ABI,
        this.provider
      );
      
      const [symbol, name, decimals] = await Promise.all([
        tokenContract.symbol(),
        tokenContract.name(),
        tokenContract.decimals(),
      ]);
      
      const metadata: TokenMetadata = {
        address: tokenAddress,
        symbol,
        name,
        decimals: Number(decimals),
      };
      
      // Cache
      this.tokenMetadataCache.set(normalizedAddress, metadata);
      
      return metadata;
    } catch (error) {
      console.error(`Error fetching token metadata for ${tokenAddress}:`, error);
      return null;
    }
  }
  
  /**
   * Refresh reserves for a specific pair
   */
  async refreshPairReserves(pairAddress: string): Promise<PairMetadata | null> {
    try {
      const pairContract = new ethers.Contract(
        pairAddress,
        PAIR_ABI,
        this.provider
      );
      
      const [token0, token1, reserves, factory] = await Promise.all([
        pairContract.token0(),
        pairContract.token1(),
        pairContract.getReserves(),
        pairContract.factory(),
      ]);
      
      const dexConfig = getDexByFactory(factory);
      if (!dexConfig) {
        console.error(`Unknown factory: ${factory}`);
        return null;
      }
      
      return {
        address: pairAddress,
        token0: token0,
        token1: token1,
        reserve0: BigInt(reserves.reserve0.toString()),
        reserve1: BigInt(reserves.reserve1.toString()),
        blockTimestampLast: Number(reserves.blockTimestampLast),
        dex: dexConfig.name,
        fee: dexConfig.fee,
        feeFactor: dexConfig.feeFactor,
      };
    } catch (error) {
      console.error(`Error refreshing pair reserves for ${pairAddress}:`, error);
      return null;
    }
  }
  
  /**
   * Get pairs by DEX
   */
  async getPairsByDex(dexName: string): Promise<PairMetadata[]> {
    const allPairs = await this.fetchAllPairs();
    return allPairs.filter(pair => pair.dex === dexName.toLowerCase());
  }
  
  /**
   * Get top pairs by liquidity
   */
  async getTopPairs(limit: number = 100): Promise<PairMetadata[]> {
    const allPairs = await this.fetchAllPairs();
    return allPairs.slice(0, limit);
  }
  
  /**
   * Print summary of fetched pairs
   */
  async printSummary(): Promise<void> {
    const allPairs = await this.fetchAllPairs();
    
    console.log('\n=== PAIR FETCHER SUMMARY ===\n');
    console.log(`Total pairs: ${allPairs.length}\n`);
    
    // Group by DEX
    const pairsByDex = new Map<string, number>();
    for (const pair of allPairs) {
      const count = pairsByDex.get(pair.dex) || 0;
      pairsByDex.set(pair.dex, count + 1);
    }
    
    console.log('Pairs by DEX:');
    for (const [dex, count] of pairsByDex.entries()) {
      const dexConfig = Object.values(BASE_V2_DEXES).find(d => d.name === dex);
      const displayName = dexConfig?.displayName || dex;
      console.log(`  ${displayName}: ${count} pairs`);
    }
    
    console.log('\nTop 10 pairs by liquidity:');
    const topPairs = allPairs.slice(0, 10);
    for (let i = 0; i < topPairs.length; i++) {
      const pair = topPairs[i];
      const token0Meta = await this.getTokenMetadata(pair.token0);
      const token1Meta = await this.getTokenMetadata(pair.token1);
      
      const symbol0 = token0Meta?.symbol || 'UNKNOWN';
      const symbol1 = token1Meta?.symbol || 'UNKNOWN';
      
      const liquidity = pair.reserve0 * pair.reserve1;
      console.log(`  ${i + 1}. ${symbol0}/${symbol1} - ${pair.dex}`);
    }
    
    console.log();
  }
  
  /**
   * Export pairs to JSON
   */
  async exportToJson(filePath: string): Promise<void> {
    const allPairs = await this.fetchAllPairs();
    
    // Enrich with token metadata
    const enrichedPairs = await Promise.all(
      allPairs.map(async pair => {
        const token0Meta = await this.getTokenMetadata(pair.token0);
        const token1Meta = await this.getTokenMetadata(pair.token1);
        
        return {
          address: pair.address,
          token0: {
            address: pair.token0,
            symbol: token0Meta?.symbol || 'UNKNOWN',
            decimals: token0Meta?.decimals || 18,
          },
          token1: {
            address: pair.token1,
            symbol: token1Meta?.symbol || 'UNKNOWN',
            decimals: token1Meta?.decimals || 18,
          },
          reserve0: pair.reserve0.toString(),
          reserve1: pair.reserve1.toString(),
          dex: pair.dex,
          fee: pair.fee,
          feeFactor: pair.feeFactor,
        };
      })
    );
    
    const data = {
      timestamp: Date.now(),
      chainId: BASE_CONFIG.CHAIN_ID,
      network: BASE_CONFIG.NETWORK_NAME,
      pairCount: enrichedPairs.length,
      pairs: enrichedPairs,
    };
    
    const fs = await import('fs/promises');
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    console.log(`Exported ${enrichedPairs.length} pairs to ${filePath}`);
  }
  
  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.allPairsCache = null;
    this.allPairsCacheTimestamp = 0;
    console.log('Cache cleared');
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats(): {
    dexCacheSize: number;
    tokenMetadataCacheSize: number;
    allPairsCached: boolean;
    allPairsCacheAge: number;
  } {
    return {
      dexCacheSize: this.cache.size,
      tokenMetadataCacheSize: this.tokenMetadataCache.size,
      allPairsCached: this.allPairsCache !== null,
      allPairsCacheAge: this.allPairsCache ? Date.now() - this.allPairsCacheTimestamp : 0,
    };
  }
}
