/**
 * GasEstimator
 * 
 * Comprehensive gas cost estimation for arbitrage transactions.
 * Combines flash loan costs, V2/V3 swap costs, and overhead.
 * 
 * Mathematical Foundation: See PHASE_4_MATHEMATICAL_FOUNDATION.md Section 6
 */

import { ethers } from 'ethers';
import { BASE_CONFIG } from '../config/base.config';

/**
 * Gas cost breakdown
 */
export interface GasCostBreakdown {
  flashLoanGas: bigint;
  swapGas: bigint;
  overheadGas: bigint;
  totalGas: bigint;
  gasPriceWei: bigint;
  gasCostWei: bigint; // In ETH
  gasCostUsd: number; // In USD
  gasCostAsset: bigint; // In borrowed asset units
}

/**
 * Swap type for gas calculation
 */
export type SwapType = 'v2' | 'v3';

/**
 * Swap gas info
 */
export interface SwapGasInfo {
  type: SwapType;
  baseGas: bigint;
  ticksCrossed?: number; // For V3 only
}

export class GasEstimator {
  private provider: ethers.JsonRpcProvider;
  private ethPriceUsd: number = 3000; // Default, should be fetched from oracle
  
  /**
   * Gas constants (from empirical testing)
   */
  private static readonly GAS_CONSTANTS = {
    // Flash loan
    FLASH_LOAN_BASE: 200000n,
    
    // V2 swaps
    V2_SWAP_BASE: 110000n,
    
    // V3 swaps
    V3_SWAP_BASE: 120000n,
    V3_TICK_CROSSING: 25000n,
    
    // Overhead
    CONTRACT_DEPLOYMENT: 0n, // Assume contract already deployed
    TRANSFER_OVERHEAD: 25000n, // Token transfers
    CALLBACK_OVERHEAD: 25000n, // Flash loan callback
    SAFETY_BUFFER: 50000n, // Extra buffer for unexpected costs
  } as const;
  
  constructor(provider: ethers.JsonRpcProvider) {
    this.provider = provider;
  }
  
  /**
   * Set ETH price for USD conversion
   */
  setEthPrice(priceUsd: number): void {
    if (priceUsd <= 0) {
      throw new Error('ETH price must be positive');
    }
    this.ethPriceUsd = priceUsd;
  }
  
  /**
   * Fetch current ETH price from provider or oracle
   * TODO: In production, use Chainlink oracle or similar
   */
  async fetchEthPrice(): Promise<number> {
    // Placeholder: In production, fetch from oracle
    // For now, return default
    return this.ethPriceUsd;
  }
  
  /**
   * Get current gas price from provider
   */
  async getGasPrice(): Promise<bigint> {
    try {
      const feeData = await this.provider.getFeeData();
      
      // Use maxFeePerGas if available (EIP-1559), otherwise gasPrice
      const gasPrice = feeData.maxFeePerGas || feeData.gasPrice || 100000000n; // 0.1 gwei default
      
      // Apply 10% safety buffer for volatility
      const bufferedGasPrice = (gasPrice * 110n) / 100n;
      
      return bufferedGasPrice;
    } catch (error) {
      console.error('Failed to fetch gas price:', error);
      // Fallback to 0.1 gwei
      return 100000000n;
    }
  }
  
  /**
   * Estimate gas for flash loan arbitrage
   */
  estimateArbitrageGas(swaps: SwapGasInfo[]): bigint {
    // Flash loan base cost
    let totalGas = GasEstimator.GAS_CONSTANTS.FLASH_LOAN_BASE;
    
    // Add swap costs
    for (const swap of swaps) {
      if (swap.type === 'v2') {
        totalGas += swap.baseGas || GasEstimator.GAS_CONSTANTS.V2_SWAP_BASE;
      } else if (swap.type === 'v3') {
        const baseGas = swap.baseGas || GasEstimator.GAS_CONSTANTS.V3_SWAP_BASE;
        const tickGas = BigInt(swap.ticksCrossed || 0) * GasEstimator.GAS_CONSTANTS.V3_TICK_CROSSING;
        totalGas += baseGas + tickGas;
      }
    }
    
    // Add overhead
    totalGas += GasEstimator.GAS_CONSTANTS.TRANSFER_OVERHEAD;
    totalGas += GasEstimator.GAS_CONSTANTS.CALLBACK_OVERHEAD;
    totalGas += GasEstimator.GAS_CONSTANTS.SAFETY_BUFFER;
    
    return totalGas;
  }
  
  /**
   * Calculate complete gas cost breakdown
   */
  async calculateGasCost(
    swaps: SwapGasInfo[],
    assetPriceUsd: number,
    assetDecimals: number
  ): Promise<GasCostBreakdown> {
    // Get current gas price
    const gasPriceWei = await this.getGasPrice();
    
    // Calculate component costs
    const flashLoanGas = GasEstimator.GAS_CONSTANTS.FLASH_LOAN_BASE;
    
    let swapGas = 0n;
    for (const swap of swaps) {
      if (swap.type === 'v2') {
        swapGas += swap.baseGas || GasEstimator.GAS_CONSTANTS.V2_SWAP_BASE;
      } else {
        const baseGas = swap.baseGas || GasEstimator.GAS_CONSTANTS.V3_SWAP_BASE;
        const tickGas = BigInt(swap.ticksCrossed || 0) * GasEstimator.GAS_CONSTANTS.V3_TICK_CROSSING;
        swapGas += baseGas + tickGas;
      }
    }
    
    const overheadGas = 
      GasEstimator.GAS_CONSTANTS.TRANSFER_OVERHEAD +
      GasEstimator.GAS_CONSTANTS.CALLBACK_OVERHEAD +
      GasEstimator.GAS_CONSTANTS.SAFETY_BUFFER;
    
    const totalGas = flashLoanGas + swapGas + overheadGas;
    
    // Calculate cost in ETH (wei)
    const gasCostWei = totalGas * gasPriceWei;
    
    // Calculate cost in USD
    const gasCostEth = Number(gasCostWei) / 1e18;
    const gasCostUsd = gasCostEth * this.ethPriceUsd;
    
    // Calculate cost in asset units
    const gasCostAssetFloat = gasCostUsd / assetPriceUsd;
    const gasCostAsset = BigInt(Math.ceil(gasCostAssetFloat * (10 ** assetDecimals)));
    
    return {
      flashLoanGas,
      swapGas,
      overheadGas,
      totalGas,
      gasPriceWei,
      gasCostWei,
      gasCostUsd,
      gasCostAsset,
    };
  }
  
  /**
   * Estimate gas for a V2-only path
   */
  estimateV2PathGas(hopCount: number): bigint {
    const swaps: SwapGasInfo[] = Array(hopCount).fill({
      type: 'v2',
      baseGas: GasEstimator.GAS_CONSTANTS.V2_SWAP_BASE,
    });
    
    return this.estimateArbitrageGas(swaps);
  }
  
  /**
   * Estimate gas for a V3-only path
   */
  estimateV3PathGas(hopCount: number, avgTicksPerHop: number): bigint {
    const swaps: SwapGasInfo[] = Array(hopCount).fill(null).map(() => ({
      type: 'v3' as SwapType,
      baseGas: GasEstimator.GAS_CONSTANTS.V3_SWAP_BASE,
      ticksCrossed: avgTicksPerHop,
    }));
    
    return this.estimateArbitrageGas(swaps);
  }
  
  /**
   * Estimate gas for mixed V2/V3 path
   */
  estimateMixedPathGas(v2Count: number, v3Count: number, v3TicksPerHop: number): bigint {
    const swaps: SwapGasInfo[] = [];
    
    // Add V2 swaps
    for (let i = 0; i < v2Count; i++) {
      swaps.push({
        type: 'v2',
        baseGas: GasEstimator.GAS_CONSTANTS.V2_SWAP_BASE,
      });
    }
    
    // Add V3 swaps
    for (let i = 0; i < v3Count; i++) {
      swaps.push({
        type: 'v3',
        baseGas: GasEstimator.GAS_CONSTANTS.V3_SWAP_BASE,
        ticksCrossed: v3TicksPerHop,
      });
    }
    
    return this.estimateArbitrageGas(swaps);
  }
  
  /**
   * Check if arbitrage is viable given gas costs
   */
  async isGasViable(
    swaps: SwapGasInfo[],
    expectedProfitUsd: number,
    minProfitThresholdUsd: number = 5
  ): Promise<boolean> {
    const gasCost = await this.calculateGasCost(swaps, 1, 6); // Assume USDC for quick check
    const netProfit = expectedProfitUsd - gasCost.gasCostUsd;
    
    return netProfit >= minProfitThresholdUsd;
  }
  
  /**
   * Get gas cost in specific asset
   */
  async getGasCostInAsset(
    totalGas: bigint,
    assetPriceUsd: number,
    assetDecimals: number
  ): Promise<bigint> {
    const gasPriceWei = await this.getGasPrice();
    const gasCostWei = totalGas * gasPriceWei;
    const gasCostEth = Number(gasCostWei) / 1e18;
    const gasCostUsd = gasCostEth * this.ethPriceUsd;
    const gasCostAssetFloat = gasCostUsd / assetPriceUsd;
    
    return BigInt(Math.ceil(gasCostAssetFloat * (10 ** assetDecimals)));
  }
  
  /**
   * Format gas cost for display
   */
  formatGasCost(breakdown: GasCostBreakdown): string {
    return `
Gas Cost Breakdown:
  Flash Loan: ${breakdown.flashLoanGas.toLocaleString()} gas
  Swaps: ${breakdown.swapGas.toLocaleString()} gas
  Overhead: ${breakdown.overheadGas.toLocaleString()} gas
  Total: ${breakdown.totalGas.toLocaleString()} gas
  Gas Price: ${Number(breakdown.gasPriceWei) / 1e9} gwei
  Cost (ETH): ${Number(breakdown.gasCostWei) / 1e18} ETH
  Cost (USD): $${breakdown.gasCostUsd.toFixed(2)}
    `.trim();
  }
  
  /**
   * Estimate worst-case gas (for safety)
   */
  estimateWorstCaseGas(swaps: SwapGasInfo[]): bigint {
    const baseEstimate = this.estimateArbitrageGas(swaps);
    
    // Add 50% buffer for worst case
    return (baseEstimate * 150n) / 100n;
  }
  
  /**
   * Compare gas costs for different paths
   */
  async comparePathGasCosts(
    paths: SwapGasInfo[][],
    assetPriceUsd: number,
    assetDecimals: number
  ): Promise<GasCostBreakdown[]> {
    const costs: GasCostBreakdown[] = [];
    
    for (const path of paths) {
      const cost = await this.calculateGasCost(path, assetPriceUsd, assetDecimals);
      costs.push(cost);
    }
    
    return costs;
  }
}
