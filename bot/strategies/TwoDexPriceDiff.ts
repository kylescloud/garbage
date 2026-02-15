/**
 * Two-DEX Price Difference Strategy
 * 
 * Pattern: Buy on DEX A, Sell on DEX B
 * Example: USDC → WETH on BaseSwap, WETH → USDC on Aerodrome
 * 
 * Profitability Condition:
 * Price_B > Price_A × (1 + fees + slippage)
 */

import { BigNumber, ethers } from "ethers";
import {
  IStrategy,
  ArbitrageOpportunity,
  SwapPath,
  SwapHop,
  StrategyConfig,
} from "../core/StrategyEngine";

export class TwoDexPriceDiff implements IStrategy {
  name = "TwoDexPriceDiff";
  description = "Simple price difference between two DEXes for same pair";

  private readonly FLASH_LOAN_FEE_BPS = 9; // 0.09%
  private readonly V2_FEE_BPS = 30; // 0.3%
  private readonly V3_FEE_BPS = 30; // 0.3% (can vary: 5, 30, 100 bps)
  
  private config: StrategyConfig;

  constructor(config: StrategyConfig) {
    this.config = config;
  }

  /**
   * Find 2-DEX arbitrage opportunities
   * Scans all token pairs across different DEXes
   */
  async findOpportunities(graph: any): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];

    // Get all unique token pairs
    const tokenPairs = this.extractTokenPairs(graph);

    for (const [tokenA, tokenB] of tokenPairs) {
      // Find all DEX pairs for this token combination
      const dexPairs = graph.getPairsForTokens(tokenA, tokenB);

      if (dexPairs.length < 2) continue; // Need at least 2 DEXes

      // Compare all pair combinations
      for (let i = 0; i < dexPairs.length; i++) {
        for (let j = i + 1; j < dexPairs.length; j++) {
          const buyDex = dexPairs[i];
          const sellDex = dexPairs[j];

          // Check both directions
          const opp1 = await this.evaluatePair(
            tokenA,
            tokenB,
            buyDex,
            sellDex,
            graph
          );
          const opp2 = await this.evaluatePair(
            tokenB,
            tokenA,
            sellDex,
            buyDex,
            graph
          );

          if (opp1) opportunities.push(opp1);
          if (opp2) opportunities.push(opp2);
        }
      }
    }

    // Sort by profit descending
    return opportunities.sort((a, b) =>
      b.estimatedProfit.sub(a.estimatedProfit).gt(0) ? 1 : -1
    );
  }

  /**
   * Evaluate a specific buy/sell pair combination
   */
  private async evaluatePair(
    tokenIn: string,
    tokenOut: string,
    buyDex: any,
    sellDex: any,
    graph: any
  ): Promise<ArbitrageOpportunity | null> {
    try {
      // Build 2-hop path: tokenIn → tokenOut → tokenIn
      const path: SwapPath = {
        hops: [
          {
            dexType: buyDex.dexType,
            dexName: buyDex.dexName,
            pair: buyDex.address,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: buyDex.fee,
          },
          {
            dexType: sellDex.dexType,
            dexName: sellDex.dexName,
            pair: sellDex.address,
            tokenIn: tokenOut,
            tokenOut: tokenIn,
            fee: sellDex.fee,
          },
        ],
        startToken: tokenIn,
        endToken: tokenIn,
      };

      // Use moderate flash loan size for initial estimation
      const flashAmount = this.estimateInitialAmount(buyDex, tokenIn);

      // Calculate profit
      const profit = await this.calculateProfit(path, flashAmount);

      // Check if profitable
      if (profit.lte(this.config.minProfitThreshold)) {
        return null;
      }

      // Create opportunity
      const opportunity: ArbitrageOpportunity = {
        id: `2dex-${Date.now()}-${Math.random()}`,
        strategy: this.name,
        path,
        flashToken: tokenIn,
        flashAmount,
        estimatedProfit: profit,
        estimatedGas: this.estimateGas(path),
        confidence: this.calculateConfidence(buyDex, sellDex),
        timestamp: Date.now(),
      };

      return opportunity;
    } catch (error) {
      console.error(`Error evaluating pair: ${error}`);
      return null;
    }
  }

  /**
   * Calculate net profit for a path
   */
  async calculateProfit(
    path: SwapPath,
    flashAmount: BigNumber
  ): Promise<BigNumber> {
    let amount = flashAmount;

    // Simulate each hop
    for (const hop of path.hops) {
      if (hop.dexType === "V2") {
        amount = this.simulateV2Swap(hop, amount);
      } else {
        amount = this.simulateV3Swap(hop, amount);
      }
    }

    // Calculate debt
    const debt = flashAmount.mul(10000 + this.FLASH_LOAN_FEE_BPS).div(10000);

    // Subtract debt and gas
    const gasEstimate = this.estimateGas(path);
    const gasCost = gasEstimate.mul(await this.getGasPrice());

    const netProfit = amount.sub(debt).sub(gasCost);

    return netProfit.gt(0) ? netProfit : BigNumber.from(0);
  }

  /**
   * Validate opportunity before execution
   */
  async validate(opportunity: ArbitrageOpportunity): Promise<boolean> {
    // Re-calculate profit with latest data
    const currentProfit = await this.calculateProfit(
      opportunity.path,
      opportunity.flashAmount
    );

    // Check if still profitable (with safety margin)
    const minAcceptable = opportunity.estimatedProfit.mul(95).div(100); // 95% of original

    if (currentProfit.lt(minAcceptable)) {
      console.log("Profit dropped below acceptable threshold");
      return false;
    }

    // Check gas price hasn't spiked
    const gasPrice = await this.getGasPrice();
    if (gasPrice.gt(this.config.maxGasPrice)) {
      console.log("Gas price too high");
      return false;
    }

    return true;
  }

  // ============ Helper Methods ============

  private extractTokenPairs(graph: any): [string, string][] {
    const pairs = new Set<string>();
    const edges = graph.getAllEdges();

    for (const edge of edges) {
      const [tokenA, tokenB] = [edge.tokenIn, edge.tokenOut].sort();
      pairs.add(`${tokenA}-${tokenB}`);
    }

    return Array.from(pairs).map((pair) => {
      const [a, b] = pair.split("-");
      return [a, b];
    });
  }

  private simulateV2Swap(hop: SwapHop, amountIn: BigNumber): BigNumber {
    // Simplified V2 calculation
    // Real implementation should call V2SwapSimulator
    const fee = BigNumber.from(997); // 0.3% fee
    const amountInWithFee = amountIn.mul(fee);

    // This is placeholder - real impl needs reserve data
    return amountInWithFee.mul(95).div(100); // Assume 5% price impact
  }

  private simulateV3Swap(hop: SwapHop, amountIn: BigNumber): BigNumber {
    // Simplified V3 calculation
    // Real implementation should call V3SwapSimulator
    const fee = hop.fee || 3000; // Default 0.3%
    const amountAfterFee = amountIn.mul(1000000 - fee).div(1000000);

    // Placeholder - real impl needs tick data
    return amountAfterFee.mul(95).div(100);
  }

  private estimateInitialAmount(dex: any, token: string): BigNumber {
    // Start with ~$10,000 worth
    // Adjust based on token decimals
    return ethers.utils.parseUnits("10000", 6); // Assume 6 decimals (USDC)
  }

  private estimateGas(path: SwapPath): BigNumber {
    let gasEstimate = 80000; // Flash loan base

    for (const hop of path.hops) {
      if (hop.dexType === "V2") {
        gasEstimate += 110000; // V2 swap
      } else {
        gasEstimate += 200000; // V3 swap (conservative)
      }
    }

    gasEstimate += 50000; // Overhead

    return BigNumber.from(gasEstimate);
  }

  private async getGasPrice(): Promise<BigNumber> {
    // Placeholder - should fetch from provider
    return ethers.utils.parseUnits("0.01", "gwei"); // Base is cheap!
  }

  private calculateConfidence(buyDex: any, sellDex: any): number {
    let confidence = 1.0;

    // Reduce confidence for low liquidity
    if (buyDex.liquidity < 100000) confidence *= 0.8;
    if (sellDex.liquidity < 100000) confidence *= 0.8;

    // Reduce confidence for V3 (more complex)
    if (buyDex.dexType === "V3") confidence *= 0.9;
    if (sellDex.dexType === "V3") confidence *= 0.9;

    return Math.max(0, Math.min(1, confidence));
  }
}
