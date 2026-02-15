/**
 * ProfitCalculator
 * 
 * Calculates net profit Π(L) for arbitrage paths.
 * 
 * Formula: Π(L) = F(L) - Debt(L) - Gas(L)
 * 
 * Where:
 * - F(L) = Final output from path execution
 * - Debt(L) = L(1 + φ) with φ = 0.0009 (flash loan fee)
 * - Gas(L) = Gas cost in borrowed asset units
 * 
 * Mathematical Foundation: See PHASE_4_MATHEMATICAL_FOUNDATION.md Section 1-2
 */

import { V2SwapSimulator, type MultiHopSwapResult } from './V2SwapSimulator';
import { V3SwapSimulator, type V3SwapResult } from './V3SwapSimulator';
import { GasEstimator, type SwapGasInfo } from './GasEstimator';
import type { PairMetadata } from '../config/dex.config';
import type { V3PoolMetadata, TickData } from '../config/v3.config';

/**
 * Hop in arbitrage path
 */
export interface PathHop {
  type: 'v2' | 'v3';
  tokenIn: string;
  tokenOut: string;
  // V2-specific
  pair?: PairMetadata;
  // V3-specific
  pool?: V3PoolMetadata;
  ticks?: Map<number, TickData>;
}

/**
 * Arbitrage path definition
 */
export interface ArbitragePath {
  hops: PathHop[];
  tokenAddresses: string[]; // [start, intermediate..., end] (start === end for arbitrage)
}

/**
 * Profit calculation result
 */
export interface ProfitResult {
  loanAmount: bigint; // L
  finalOutput: bigint; // F(L)
  debt: bigint; // Debt(L)
  gasCost: bigint; // Gas(L) in asset units
  netProfit: bigint; // Π(L)
  netProfitUsd: number; // Π(L) in USD
  profitable: boolean; // Π(L) > 0
  intermediateAmounts: bigint[]; // Amounts after each hop
  gasEstimate: bigint; // Total gas units
}

export class ProfitCalculator {
  private gasEstimator: GasEstimator;
  
  /**
   * Flash loan fee from Aave V3 (9 basis points)
   */
  private static readonly FLASH_LOAN_FEE = 0.0009;
  private static readonly FLASH_LOAN_FEE_FACTOR = 10009; // For integer math: L * 10009 / 10000
  
  constructor(gasEstimator: GasEstimator) {
    this.gasEstimator = gasEstimator;
  }
  
  /**
   * Calculate debt for flash loan
   * 
   * Formula: Debt(L) = L(1 + φ) = L × 1.0009
   * 
   * Using integer math: Debt(L) = L × 10009 / 10000
   */
  static calculateDebt(loanAmount: bigint): bigint {
    return (loanAmount * BigInt(ProfitCalculator.FLASH_LOAN_FEE_FACTOR)) / 10000n;
  }
  
  /**
   * Simulate path execution to get F(L)
   */
  async simulatePath(
    loanAmount: bigint,
    path: ArbitragePath
  ): Promise<{ finalOutput: bigint; intermediateAmounts: bigint[]; totalGas: bigint }> {
    let currentAmount = loanAmount;
    const intermediateAmounts: bigint[] = [loanAmount];
    const gasInfo: SwapGasInfo[] = [];
    
    // Execute each hop
    for (const hop of path.hops) {
      if (hop.type === 'v2') {
        // V2 swap
        if (!hop.pair) {
          throw new Error('V2 hop missing pair');
        }
        
        const pair = hop.pair;
        const tokenIn = hop.tokenIn.toLowerCase();
        
        // Determine reserve order
        const [reserveIn, reserveOut] = this.getV2ReserveOrder(pair, tokenIn, hop.tokenOut);
        
        // Calculate output
        const amountOut = V2SwapSimulator.getAmountOut(
          currentAmount,
          reserveIn,
          reserveOut,
          pair.fee
        );
        
        currentAmount = amountOut;
        intermediateAmounts.push(amountOut);
        
        // Track gas
        gasInfo.push({
          type: 'v2',
          baseGas: 110000n,
        });
        
      } else if (hop.type === 'v3') {
        // V3 swap
        if (!hop.pool) {
          throw new Error('V3 hop missing pool');
        }
        
        const pool = hop.pool;
        const tokenIn = hop.tokenIn.toLowerCase();
        const zeroForOne = tokenIn === pool.token0.toLowerCase();
        
        // Simulate V3 swap
        const ticks = hop.ticks || new Map();
        const result = V3SwapSimulator.simulateSwapMultiTick(
          currentAmount,
          pool,
          zeroForOne,
          ticks
        );
        
        currentAmount = result.amountOut;
        intermediateAmounts.push(result.amountOut);
        
        // Track gas
        gasInfo.push({
          type: 'v3',
          baseGas: 120000n,
          ticksCrossed: result.ticksCrossed,
        });
      }
    }
    
    // Calculate total gas
    const totalGas = this.gasEstimator.estimateArbitrageGas(gasInfo);
    
    return {
      finalOutput: currentAmount,
      intermediateAmounts,
      totalGas,
    };
  }
  
  /**
   * Get V2 reserves in correct order
   */
  private getV2ReserveOrder(
    pair: PairMetadata,
    tokenIn: string,
    tokenOut: string
  ): [bigint, bigint] {
    const token0Lower = pair.token0.toLowerCase();
    const tokenInLower = tokenIn.toLowerCase();
    const tokenOutLower = tokenOut.toLowerCase();
    
    if (tokenInLower === token0Lower && tokenOutLower === pair.token1.toLowerCase()) {
      return [pair.reserve0, pair.reserve1];
    } else if (tokenInLower === pair.token1.toLowerCase() && tokenOutLower === token0Lower) {
      return [pair.reserve1, pair.reserve0];
    }
    
    throw new Error(`Token mismatch: ${tokenIn} or ${tokenOut} not in pair ${pair.address}`);
  }
  
  /**
   * Calculate complete profit Π(L) for given loan size
   * 
   * Formula: Π(L) = F(L) - Debt(L) - Gas(L)
   */
  async calculateProfit(
    loanAmount: bigint,
    path: ArbitragePath,
    assetPriceUsd: number,
    assetDecimals: number
  ): Promise<ProfitResult> {
    // 1. Simulate path to get F(L)
    const { finalOutput, intermediateAmounts, totalGas } = await this.simulatePath(
      loanAmount,
      path
    );
    
    // 2. Calculate Debt(L) = L(1 + φ)
    const debt = ProfitCalculator.calculateDebt(loanAmount);
    
    // 3. Calculate Gas(L) in asset units
    const gasCost = await this.gasEstimator.getGasCostInAsset(
      totalGas,
      assetPriceUsd,
      assetDecimals
    );
    
    // 4. Calculate net profit: Π(L) = F(L) - Debt(L) - Gas(L)
    const netProfit = finalOutput - debt - gasCost;
    
    // 5. Convert to USD
    const netProfitFloat = Number(netProfit) / (10 ** assetDecimals);
    const netProfitUsd = netProfitFloat * assetPriceUsd;
    
    return {
      loanAmount,
      finalOutput,
      debt,
      gasCost,
      netProfit,
      netProfitUsd,
      profitable: netProfit > 0n,
      intermediateAmounts,
      gasEstimate: totalGas,
    };
  }
  
  /**
   * Calculate derivative dΠ/dL numerically using central difference
   * 
   * Formula: dΠ/dL ≈ (Π(L + h) - Π(L - h)) / (2h)
   */
  async calculateDerivative(
    loanAmount: bigint,
    path: ArbitragePath,
    assetPriceUsd: number,
    assetDecimals: number,
    h?: bigint
  ): Promise<number> {
    // Choose h = max(L * 10^-6, 1000) for numerical stability
    if (!h) {
      h = loanAmount / 1000000n;
      if (h < 1000n) h = 1000n;
    }
    
    // Calculate Π(L + h)
    const profitPlus = await this.calculateProfit(
      loanAmount + h,
      path,
      assetPriceUsd,
      assetDecimals
    );
    
    // Calculate Π(L - h)
    const profitMinus = await this.calculateProfit(
      loanAmount - h,
      path,
      assetPriceUsd,
      assetDecimals
    );
    
    // Central difference
    const derivative = Number(profitPlus.netProfit - profitMinus.netProfit) / Number(2n * h);
    
    return derivative;
  }
  
  /**
   * Calculate second derivative d²Π/dL² numerically
   * 
   * Formula: d²Π/dL² ≈ (Π(L + h) - 2Π(L) + Π(L - h)) / h²
   */
  async calculateSecondDerivative(
    loanAmount: bigint,
    path: ArbitragePath,
    assetPriceUsd: number,
    assetDecimals: number,
    h?: bigint
  ): Promise<number> {
    if (!h) {
      h = loanAmount / 1000000n;
      if (h < 1000n) h = 1000n;
    }
    
    // Calculate Π(L)
    const profitCenter = await this.calculateProfit(
      loanAmount,
      path,
      assetPriceUsd,
      assetDecimals
    );
    
    // Calculate Π(L + h)
    const profitPlus = await this.calculateProfit(
      loanAmount + h,
      path,
      assetPriceUsd,
      assetDecimals
    );
    
    // Calculate Π(L - h)
    const profitMinus = await this.calculateProfit(
      loanAmount - h,
      path,
      assetPriceUsd,
      assetDecimals
    );
    
    // Second difference
    const numerator = profitPlus.netProfit - 2n * profitCenter.netProfit + profitMinus.netProfit;
    const denominator = h * h;
    
    const secondDerivative = Number(numerator) / Number(denominator);
    
    return secondDerivative;
  }
  
  /**
   * Check if profit is above minimum threshold
   */
  isProfitable(
    result: ProfitResult,
    minProfitUsd: number = 5
  ): boolean {
    return result.profitable && result.netProfitUsd >= minProfitUsd;
  }
  
  /**
   * Calculate break-even loan size (approximate)
   * 
   * Find L where Π(L) ≈ 0
   */
  async estimateBreakEven(
    path: ArbitragePath,
    assetPriceUsd: number,
    assetDecimals: number,
    initialGuess: bigint = 1000000n
  ): Promise<bigint | null> {
    let L = initialGuess;
    const maxIterations = 20;
    
    for (let i = 0; i < maxIterations; i++) {
      const result = await this.calculateProfit(L, path, assetPriceUsd, assetDecimals);
      
      if (result.netProfit === 0n) {
        return L;
      }
      
      if (result.netProfit < 0n) {
        // Need larger loan
        L = (L * 110n) / 100n; // Increase 10%
      } else {
        // Can use smaller loan
        L = (L * 95n) / 100n; // Decrease 5%
      }
      
      // Check if converged
      if (result.netProfit > -1000n && result.netProfit < 1000n) {
        return L;
      }
    }
    
    return null; // Failed to converge
  }
  
  /**
   * Format profit result for display
   */
  formatProfit(result: ProfitResult, assetSymbol: string, assetDecimals: number): string {
    const loanFloat = Number(result.loanAmount) / (10 ** assetDecimals);
    const outputFloat = Number(result.finalOutput) / (10 ** assetDecimals);
    const debtFloat = Number(result.debt) / (10 ** assetDecimals);
    const gasFloat = Number(result.gasCost) / (10 ** assetDecimals);
    const profitFloat = Number(result.netProfit) / (10 ** assetDecimals);
    
    return `
Profit Calculation:
  Loan Amount (L): ${loanFloat.toFixed(4)} ${assetSymbol}
  Final Output F(L): ${outputFloat.toFixed(4)} ${assetSymbol}
  Debt (1.0009L): ${debtFloat.toFixed(4)} ${assetSymbol}
  Gas Cost: ${gasFloat.toFixed(4)} ${assetSymbol}
  Net Profit Π(L): ${profitFloat.toFixed(4)} ${assetSymbol} ($${result.netProfitUsd.toFixed(2)})
  Profitable: ${result.profitable ? '✓ YES' : '✗ NO'}
  Gas Estimate: ${result.gasEstimate.toLocaleString()} units
    `.trim();
  }
}
