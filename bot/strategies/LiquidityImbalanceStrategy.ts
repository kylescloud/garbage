/**
 * Liquidity Imbalance Strategy
 * 
 * Pattern: Exploit temporary liquidity imbalances in pools
 * Example: Pool has 90% USDC / 10% WETH (should be ~50/50)
 * 
 * Mathematical Foundation:
 * For Uniswap V2: Price = reserveOut / reserveIn
 * 
 * Normal ratio: ~1:1 value (adjusting for prices)
 * Imbalanced: ratio deviates significantly
 * 
 * Arbitrage restores balance by:
 * - Buying underpriced asset
 * - Selling on balanced pool
 * 
 * Detection:
 * - Calculate expected reserve ratio from oracle prices
 * - Compare to actual reserve ratio
 * - Imbalance > threshold → opportunity
 */

import { BigNumber, ethers } from "ethers";
import {
  IStrategy,
  ArbitrageOpportunity,
  SwapPath,
  SwapHop,
  StrategyConfig,
} from "../core/StrategyEngine";

export class LiquidityImbalanceStrategy implements IStrategy {
  name = "LiquidityImbalanceStrategy";
  description = "Exploit temporary liquidity imbalances in pools";

  private readonly FLASH_LOAN_FEE_BPS = 9;
  private readonly MIN_IMBALANCE_PERCENT = 5; // 5% deviation from expected
  private readonly MAX_IMBALANCE_PERCENT = 30; // 30% max (safety)
  
  private config: StrategyConfig;

  constructor(config: StrategyConfig) {
    this.config = config;
  }

  /**
   * Find liquidity imbalance opportunities
   * Scans all pools for reserve ratio deviations
   */
  async findOpportunities(graph: any): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];
    
    // Get all V2 pairs (easier to detect imbalance than V3)
    const v2Pairs = graph.getV2Pairs();
    
    for (const pair of v2Pairs) {
      // Check if pair is imbalanced
      const imbalance = await this.detectImbalance(pair, graph);
      
      if (!imbalance) continue;
      
      // Find arbitrage path to exploit imbalance
      const opportunity = await this.buildArbitragePath(
        pair,
        imbalance,
        graph
      );
      
      if (opportunity) {
        opportunities.push(opportunity);
      }
    }
    
    return opportunities.sort((a, b) => 
      b.estimatedProfit.sub(a.estimatedProfit).gt(0) ? 1 : -1
    );
  }

  /**
   * Detect if a pair has liquidity imbalance
   * Returns imbalance info if detected, null otherwise
   */
  private async detectImbalance(
    pair: any,
    graph: any
  ): Promise<ImbalanceInfo | null> {
    try {
      const { token0, token1, reserve0, reserve1 } = pair;
      
      // Get oracle prices (simplified - should use Chainlink/Pyth)
      const price0USD = await this.getTokenPriceUSD(token0, graph);
      const price1USD = await this.getTokenPriceUSD(token1, graph);
      
      if (!price0USD || !price1USD) return null;
      
      // Calculate expected reserve ratio
      const expectedRatio = price1USD / price0USD;
      
      // Calculate actual reserve ratio
      const actualRatio = Number(reserve1.toString()) / Number(reserve0.toString());
      
      // Calculate deviation percentage
      const deviation = Math.abs((actualRatio / expectedRatio - 1) * 100);
      
      if (deviation < this.MIN_IMBALANCE_PERCENT) return null;
      if (deviation > this.MAX_IMBALANCE_PERCENT) return null; // Too risky
      
      // Determine which token is underpriced
      const token0Underpriced = actualRatio > expectedRatio;
      
      return {
        pair: pair.address,
        token0,
        token1,
        reserve0,
        reserve1,
        deviation,
        underpricedToken: token0Underpriced ? token0 : token1,
        overpricedToken: token0Underpriced ? token1 : token0,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Build arbitrage path to exploit imbalance
   */
  private async buildArbitragePath(
    imbalancedPair: any,
    imbalance: ImbalanceInfo,
    graph: any
  ): Promise<ArbitrageOpportunity | null> {
    try {
      // Strategy:
      // 1. Buy underpriced token from imbalanced pool
      // 2. Sell on a balanced pool
      // 3. Return to starting token
      
      const startToken = imbalance.underpricedToken;
      const midToken = imbalance.overpricedToken;
      
      // Find balanced pool for reverse trade
      const balancedPools = graph.getBalancedPools(midToken, startToken);
      if (balancedPools.length === 0) return null;
      
      const balancedPool = balancedPools[0];
      
      const path: SwapPath = {
        hops: [
          {
            dexType: imbalancedPair.dexType,
            dexName: imbalancedPair.dexName,
            pair: imbalancedPair.address,
            tokenIn: startToken,
            tokenOut: midToken,
            fee: imbalancedPair.fee,
          },
          {
            dexType: balancedPool.dexType,
            dexName: balancedPool.dexName,
            pair: balancedPool.address,
            tokenIn: midToken,
            tokenOut: startToken,
            fee: balancedPool.fee,
          },
        ],
        startToken,
        endToken: startToken,
      };
      
      // Flash amount should be proportional to imbalance
      const flashAmount = this.calculateOptimalAmount(imbalance, graph);
      
      const profit = await this.calculateProfit(path, flashAmount);
      
      if (profit.lte(this.config.minProfitThreshold)) return null;
      
      return {
        id: `imbalance-${Date.now()}-${Math.random()}`,
        strategy: this.name,
        path,
        flashToken: startToken,
        flashAmount,
        estimatedProfit: profit,
        estimatedGas: this.estimateGas(path),
        confidence: this.calculateConfidence(imbalance),
        timestamp: Date.now(),
        metadata: {
          deviation: imbalance.deviation,
          imbalancedPair: imbalance.pair,
        },
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Calculate profit
   */
  async calculateProfit(
    path: SwapPath,
    flashAmount: BigNumber
  ): Promise<BigNumber> {
    let amount = flashAmount;
    
    for (const hop of path.hops) {
      const fee = hop.fee || 3000;
      amount = amount.mul(1000000 - fee).div(1000000);
      
      // First hop benefits from imbalance, second hop is normal
      const priceImpact = path.hops.indexOf(hop) === 0 ? 99 : 98;
      amount = amount.mul(priceImpact).div(100);
    }
    
    const debt = flashAmount.mul(10000 + this.FLASH_LOAN_FEE_BPS).div(10000);
    const netProfit = amount.sub(debt);
    
    return netProfit.gt(0) ? netProfit : BigNumber.from(0);
  }

  /**
   * Validate opportunity
   */
  async validate(opportunity: ArbitrageOpportunity): Promise<boolean> {
    // Imbalances can correct quickly, so be conservative
    const currentProfit = await this.calculateProfit(
      opportunity.path,
      opportunity.flashAmount
    );
    
    const minAcceptable = opportunity.estimatedProfit.mul(85).div(100);
    return currentProfit.gte(minAcceptable);
  }

  // ============ Helper Methods ============

  private async getTokenPriceUSD(token: string, graph: any): Promise<number | null> {
    // Simplified - should use Chainlink oracle
    // For now, return mock prices
    const mockPrices: Record<string, number> = {
      "USDC": 1.0,
      "WETH": 2000.0,
      "DAI": 1.0,
    };
    
    const tokenInfo = graph.getTokenInfo(token);
    return mockPrices[tokenInfo?.symbol] || null;
  }

  private calculateOptimalAmount(
    imbalance: ImbalanceInfo,
    graph: any
  ): BigNumber {
    // Larger imbalance = larger opportunity
    // Scale flash amount by deviation percentage
    const baseAmount = 10000; // $10k
    const scaledAmount = baseAmount * (1 + imbalance.deviation / 100);
    
    return ethers.utils.parseUnits(scaledAmount.toString(), 6);
  }

  private calculateConfidence(imbalance: ImbalanceInfo): number {
    // Higher deviation = higher confidence (up to a point)
    const confidence = Math.min(imbalance.deviation / 20, 0.95);
    return Math.max(0.6, confidence);
  }

  private estimateGas(path: SwapPath): BigNumber {
    return BigNumber.from(80000 + 2 * 110000 + 50000);
  }
}

// ============ Types ============

interface ImbalanceInfo {
  pair: string;
  token0: string;
  token1: string;
  reserve0: BigNumber;
  reserve1: BigNumber;
  deviation: number; // percentage
  underpricedToken: string;
  overpricedToken: string;
}
