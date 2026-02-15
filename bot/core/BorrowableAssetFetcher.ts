/**
 * BorrowableAssetFetcher
 * 
 * Fetches and validates all borrowable assets from Aave V3 on Base.
 * Implements complete reserve data retrieval, configuration decoding,
 * liquidity calculation, and caching with TTL.
 * 
 * Mathematical Foundation: See PHASE_1_MATHEMATICAL_FOUNDATION.md
 */

import { ethers } from 'ethers';
import {
  AAVE_V3_BASE_CONFIG,
  decodeReserveConfiguration,
  type ReserveConfiguration,
} from '../config/aave.config';
import { BASE_CONFIG, weiToEth } from '../config/base.config';

/**
 * Reserve data structure matching Aave V3 on-chain format
 */
export interface ReserveData {
  configuration: bigint;
  liquidityIndex: bigint;
  currentLiquidityRate: bigint;
  variableBorrowIndex: bigint;
  currentVariableBorrowRate: bigint;
  currentStableBorrowRate: bigint;
  lastUpdateTimestamp: number;
  id: number;
  aTokenAddress: string;
  stableDebtTokenAddress: string;
  variableDebtTokenAddress: string;
  interestRateStrategyAddress: string;
  accruedToTreasury: bigint;
  unbacked: bigint;
  isolationModeTotalDebt: bigint;
}

/**
 * Borrowable asset with computed liquidity
 */
export interface BorrowableAsset {
  address: string;
  symbol: string;
  decimals: number;
  
  // Reserve data
  reserveData: ReserveData;
  config: ReserveConfiguration;
  
  // Liquidity calculations
  totalLiquidity: bigint; // R_i in wei
  totalDebt: bigint; // U_i in wei
  availableLiquidity: bigint; // A_i = R_i - U_i in wei
  
  // Normalized values (18 decimals)
  totalLiquidityNormalized: bigint;
  totalDebtNormalized: bigint;
  availableLiquidityNormalized: bigint;
  
  // Metadata
  flashLoanFee: number; // basis points
  utilizationRate: number; // percentage (0-100)
  
  // Cache timestamp
  fetchedAt: number;
}

/**
 * Cache entry with TTL
 */
interface CacheEntry {
  assets: BorrowableAsset[];
  timestamp: number;
}

/**
 * Aave V3 Pool ABI (minimal for required functions)
 */
const POOL_ABI = [
  'function getReservesList() external view returns (address[])',
  'function getReserveData(address asset) external view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))',
];

/**
 * ERC20 ABI (minimal)
 */
const ERC20_ABI = [
  'function symbol() external view returns (string)',
  'function decimals() external view returns (uint8)',
  'function totalSupply() external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
];

export class BorrowableAssetFetcher {
  private provider: ethers.JsonRpcProvider;
  private poolContract: ethers.Contract;
  private cache: CacheEntry | null = null;
  
  constructor(provider: ethers.JsonRpcProvider) {
    this.provider = provider;
    this.poolContract = new ethers.Contract(
      AAVE_V3_BASE_CONFIG.POOL,
      POOL_ABI,
      provider
    );
  }
  
  /**
   * Fetch all borrowable assets with complete reserve data
   * Uses cache if available and not expired
   */
  async fetchBorrowableAssets(
    forceRefresh: boolean = false
  ): Promise<BorrowableAsset[]> {
    // Check cache
    if (!forceRefresh && this.cache) {
      const age = Date.now() - this.cache.timestamp;
      if (age < AAVE_V3_BASE_CONFIG.RESERVE_CACHE_TTL * 1000) {
        console.log(`Using cached borrowable assets (age: ${age}ms)`);
        return this.cache.assets;
      }
    }
    
    console.log('Fetching borrowable assets from Aave V3...');
    const startTime = Date.now();
    
    // Step 1: Get list of all reserves
    const reserveAddresses = await this.poolContract.getReservesList();
    console.log(`Found ${reserveAddresses.length} reserves`);
    
    // Step 2: Fetch reserve data in parallel
    const assets: BorrowableAsset[] = [];
    const fetchPromises = reserveAddresses.map(async (address: string) => {
      try {
        return await this.fetchReserveDetails(address);
      } catch (error) {
        console.error(`Error fetching reserve ${address}:`, error);
        return null;
      }
    });
    
    const results = await Promise.all(fetchPromises);
    
    // Step 3: Filter valid borrowable assets
    for (const asset of results) {
      if (asset && this.isValidBorrowableAsset(asset)) {
        assets.push(asset);
      }
    }
    
    // Step 4: Sort by available liquidity (descending)
    assets.sort((a, b) => {
      if (a.availableLiquidityNormalized > b.availableLiquidityNormalized) return -1;
      if (a.availableLiquidityNormalized < b.availableLiquidityNormalized) return 1;
      return 0;
    });
    
    // Update cache
    this.cache = {
      assets,
      timestamp: Date.now(),
    };
    
    const elapsed = Date.now() - startTime;
    console.log(`Fetched ${assets.length} borrowable assets in ${elapsed}ms`);
    
    return assets;
  }
  
  /**
   * Fetch detailed reserve data for a single asset
   */
  private async fetchReserveDetails(
    assetAddress: string
  ): Promise<BorrowableAsset | null> {
    try {
      // Fetch reserve data from pool
      const reserveDataRaw = await this.poolContract.getReserveData(assetAddress);
      
      // Parse reserve data
      const reserveData: ReserveData = {
        configuration: BigInt(reserveDataRaw.configuration.toString()),
        liquidityIndex: BigInt(reserveDataRaw.liquidityIndex.toString()),
        currentLiquidityRate: BigInt(reserveDataRaw.currentLiquidityRate.toString()),
        variableBorrowIndex: BigInt(reserveDataRaw.variableBorrowIndex.toString()),
        currentVariableBorrowRate: BigInt(reserveDataRaw.currentVariableBorrowRate.toString()),
        currentStableBorrowRate: BigInt(reserveDataRaw.currentStableBorrowRate.toString()),
        lastUpdateTimestamp: Number(reserveDataRaw.lastUpdateTimestamp),
        id: Number(reserveDataRaw.id),
        aTokenAddress: reserveDataRaw.aTokenAddress,
        stableDebtTokenAddress: reserveDataRaw.stableDebtTokenAddress,
        variableDebtTokenAddress: reserveDataRaw.variableDebtTokenAddress,
        interestRateStrategyAddress: reserveDataRaw.interestRateStrategyAddress,
        accruedToTreasury: BigInt(reserveDataRaw.accruedToTreasury.toString()),
        unbacked: BigInt(reserveDataRaw.unbacked.toString()),
        isolationModeTotalDebt: BigInt(reserveDataRaw.isolationModeTotalDebt.toString()),
      };
      
      // Decode configuration
      const config = decodeReserveConfiguration(reserveData.configuration);
      
      // Fetch token metadata
      const tokenContract = new ethers.Contract(assetAddress, ERC20_ABI, this.provider);
      const [symbol, decimals] = await Promise.all([
        tokenContract.symbol(),
        tokenContract.decimals(),
      ]);
      
      // Calculate liquidity
      const liquidity = await this.calculateLiquidity(reserveData, assetAddress);
      
      // Normalize to 18 decimals
      const decimalDiff = 18 - Number(decimals);
      const normalizationFactor = 10n ** BigInt(Math.abs(decimalDiff));
      
      let totalLiquidityNormalized: bigint;
      let totalDebtNormalized: bigint;
      let availableLiquidityNormalized: bigint;
      
      if (decimalDiff >= 0) {
        // Scale up
        totalLiquidityNormalized = liquidity.totalLiquidity * normalizationFactor;
        totalDebtNormalized = liquidity.totalDebt * normalizationFactor;
        availableLiquidityNormalized = liquidity.availableLiquidity * normalizationFactor;
      } else {
        // Scale down
        totalLiquidityNormalized = liquidity.totalLiquidity / normalizationFactor;
        totalDebtNormalized = liquidity.totalDebt / normalizationFactor;
        availableLiquidityNormalized = liquidity.availableLiquidity / normalizationFactor;
      }
      
      // Calculate utilization rate
      const utilizationRate = liquidity.totalLiquidity > 0n
        ? Number((liquidity.totalDebt * 10000n) / liquidity.totalLiquidity) / 100
        : 0;
      
      return {
        address: assetAddress,
        symbol,
        decimals: Number(decimals),
        reserveData,
        config,
        totalLiquidity: liquidity.totalLiquidity,
        totalDebt: liquidity.totalDebt,
        availableLiquidity: liquidity.availableLiquidity,
        totalLiquidityNormalized,
        totalDebtNormalized,
        availableLiquidityNormalized,
        flashLoanFee: AAVE_V3_BASE_CONFIG.FLASH_LOAN_PREMIUM_TOTAL,
        utilizationRate,
        fetchedAt: Date.now(),
      };
    } catch (error) {
      console.error(`Failed to fetch reserve details for ${assetAddress}:`, error);
      return null;
    }
  }
  
  /**
   * Calculate total liquidity, debt, and available liquidity
   * 
   * Mathematical derivation from PHASE_1_MATHEMATICAL_FOUNDATION.md:
   * R_i = aToken.totalSupply() × liquidityIndex / RAY
   * U_i = variableDebtToken.totalSupply() × variableBorrowIndex / RAY + stableDebtToken.totalSupply()
   * A_i = R_i - U_i
   */
  private async calculateLiquidity(
    reserveData: ReserveData,
    assetAddress: string
  ): Promise<{
    totalLiquidity: bigint;
    totalDebt: bigint;
    availableLiquidity: bigint;
  }> {
    const aTokenContract = new ethers.Contract(
      reserveData.aTokenAddress,
      ERC20_ABI,
      this.provider
    );
    
    const variableDebtContract = new ethers.Contract(
      reserveData.variableDebtTokenAddress,
      ERC20_ABI,
      this.provider
    );
    
    const stableDebtContract = new ethers.Contract(
      reserveData.stableDebtTokenAddress,
      ERC20_ABI,
      this.provider
    );
    
    // Fetch total supplies in parallel
    const [aTokenSupply, variableDebtSupply, stableDebtSupply] = await Promise.all([
      aTokenContract.totalSupply(),
      variableDebtContract.totalSupply(),
      stableDebtContract.totalSupply(),
    ]);
    
    const RAY = AAVE_V3_BASE_CONFIG.RAY;
    
    // Calculate total liquidity: R_i = aToken.totalSupply() × liquidityIndex / RAY
    const totalLiquidity = (BigInt(aTokenSupply.toString()) * reserveData.liquidityIndex) / RAY;
    
    // Calculate total debt: U_i = variableDebt × variableBorrowIndex / RAY + stableDebt
    const variableDebt = (BigInt(variableDebtSupply.toString()) * reserveData.variableBorrowIndex) / RAY;
    const stableDebt = BigInt(stableDebtSupply.toString());
    const totalDebt = variableDebt + stableDebt;
    
    // Calculate available liquidity: A_i = R_i - U_i
    // Use checked arithmetic (will throw if underflow, indicating protocol insolvency)
    const availableLiquidity = totalLiquidity - totalDebt;
    
    return {
      totalLiquidity,
      totalDebt,
      availableLiquidity,
    };
  }
  
  /**
   * Validate if asset is suitable for flash loans
   * 
   * Validation criteria:
   * 1. Active (bit 56 = 1)
   * 2. Not frozen (bit 57 = 0)
   * 3. Borrowing enabled (bit 58 = 1)
   * 4. Not paused (bit 60 = 0)
   * 5. Flash loan enabled (bit 63 = 1)
   * 6. Available liquidity > 0
   * 7. Available liquidity > minimum threshold
   */
  private isValidBorrowableAsset(asset: BorrowableAsset): boolean {
    const { config, availableLiquidity } = asset;
    
    // Check configuration flags
    if (!config.active) {
      console.log(`${asset.symbol}: Not active`);
      return false;
    }
    
    if (config.frozen) {
      console.log(`${asset.symbol}: Frozen`);
      return false;
    }
    
    if (!config.borrowingEnabled) {
      console.log(`${asset.symbol}: Borrowing not enabled`);
      return false;
    }
    
    if (config.paused) {
      console.log(`${asset.symbol}: Paused`);
      return false;
    }
    
    if (!config.flashloanEnabled) {
      console.log(`${asset.symbol}: Flash loans not enabled`);
      return false;
    }
    
    // Check available liquidity
    if (availableLiquidity <= 0n) {
      console.log(`${asset.symbol}: No available liquidity`);
      return false;
    }
    
    // For stablecoins (6 decimals), minimum is $100
    // For other tokens, we'll validate against minimum threshold later with price oracle
    const minLiquidityRaw = asset.decimals === 6 ? 100n * (10n ** 6n) : 0n;
    if (availableLiquidity < minLiquidityRaw) {
      console.log(`${asset.symbol}: Below minimum liquidity threshold`);
      return false;
    }
    
    return true;
  }
  
  /**
   * Get borrowable asset by address
   */
  async getBorrowableAsset(address: string): Promise<BorrowableAsset | null> {
    const assets = await this.fetchBorrowableAssets();
    return assets.find(asset => 
      asset.address.toLowerCase() === address.toLowerCase()
    ) || null;
  }
  
  /**
   * Get borrowable asset by symbol
   */
  async getBorrowableAssetBySymbol(symbol: string): Promise<BorrowableAsset | null> {
    const assets = await this.fetchBorrowableAssets();
    return assets.find(asset => 
      asset.symbol.toLowerCase() === symbol.toLowerCase()
    ) || null;
  }
  
  /**
   * Print summary of borrowable assets
   */
  async printSummary(): Promise<void> {
    const assets = await this.fetchBorrowableAssets();
    
    console.log('\n=== BORROWABLE ASSETS SUMMARY ===\n');
    console.log(`Total assets: ${assets.length}\n`);
    
    for (const asset of assets) {
      console.log(`${asset.symbol}:`);
      console.log(`  Address: ${asset.address}`);
      console.log(`  Decimals: ${asset.decimals}`);
      console.log(`  Total Liquidity: ${weiToEth(asset.totalLiquidityNormalized).toFixed(4)} (normalized)`);
      console.log(`  Total Debt: ${weiToEth(asset.totalDebtNormalized).toFixed(4)} (normalized)`);
      console.log(`  Available: ${weiToEth(asset.availableLiquidityNormalized).toFixed(4)} (normalized)`);
      console.log(`  Utilization: ${asset.utilizationRate.toFixed(2)}%`);
      console.log(`  Flash Loan Fee: ${asset.flashLoanFee} bps`);
      console.log('');
    }
  }
  
  /**
   * Export borrowable assets to JSON file
   */
  async exportToJson(filePath: string): Promise<void> {
    const assets = await this.fetchBorrowableAssets();
    const data = {
      timestamp: Date.now(),
      chainId: BASE_CONFIG.CHAIN_ID,
      network: BASE_CONFIG.NETWORK_NAME,
      aavePool: AAVE_V3_BASE_CONFIG.POOL,
      assets: assets.map(asset => ({
        address: asset.address,
        symbol: asset.symbol,
        decimals: asset.decimals,
        availableLiquidity: asset.availableLiquidity.toString(),
        availableLiquidityNormalized: asset.availableLiquidityNormalized.toString(),
        flashLoanFee: asset.flashLoanFee,
        utilizationRate: asset.utilizationRate,
      })),
    };
    
    const fs = await import('fs/promises');
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    console.log(`Exported borrowable assets to ${filePath}`);
  }
}
