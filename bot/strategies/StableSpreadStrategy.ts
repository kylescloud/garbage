/**
 * Stable Spread Strategy
 * 
 * Pattern: Exploit small spreads between stablecoins
 * Example: USDC → USDT → DAI → USDC
 * 
 * Characteristics:
 * - Small margins (0.1-0.5%)
 * - Low volatility risk
 * - High volume potential
 * - Sensitive to slippage
 * 
 * Mathematical Foundation:
 * Stablecoins should maintain 1:1 peg, but temporary deviations occur due to:
 * - Supply/demand imbalances
 * - Liquidity differences across DEXes
 * - Large trades causing temporary depegs
 * 
 * Profitability when: spread > fees + slippage
 */

import { BigNumber, ethers } from "ethers";
import {
  IStrategy,
  ArbitrageOpportunity,
  SwapPath,
  SwapHop,
  StrategyConfig,
} from "../core/StrategyEngine";

export class StableSpreadStrategy implements IStrategy {
  name = "StableSpreadStrategy";
  description = "Exploit spreads between stablecoins (USDC/USDT/DAI)";

  private readonly FLASH_LOAN_FEE_BPS = 9;
  private readonly MIN_SPREAD_BPS = 15; // 0.15% minimum spread
  private readonly MAX_PRICE_DEVIATION_BPS = 200; // 2% max from peg
  
  // Known stablecoins on Base
  private readonly STABLECOINS = new Set([
    "USDC",
    "USDbC", // Bridged USDC
    "USDT",
    "DAI",
  ]);
  
  private config: StrategyConfig;

  constructor(config: StrategyConfig) {
    this.config = config;
  }

  /**
   * Find stablecoin spread opportunities
   * Only considers paths between stablecoins
   */
  async findOpportunities(graph: any): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];
    
    // Get stablecoin addresses
    const stableAddresses = this.getStablecoinAddresses(graph);
    
    if (stableAddresses.length < 2) {
      return opportunities;
    }
    
    // Check all stable-to-stable paths (2-hop and 3-hop)
    for (const startStable of stableAddresses) {
      // 2-hop: A → B → A
      for (const midStable of stableAddresses) {
        if (startStable === midStable) continue;
        
        const opp2Hop = await this.evaluateTwoHop(
          startStable,
          midStable,
          graph
        );
        if (opp2Hop) opportunities.push(opp2Hop);
      }
      
      // 3-hop: A → B → C → A
      for (const mid1 of stableAddresses) {
        if (startStable === mid1) continue;
        
        for (const mid2 of stableAddresses) {
          if (mid2 === startStable || mid2 === mid1) continue;
          
          const opp3Hop = await this.evaluateThreeHop(
            startStable,
            mid1,
            mid2,
            graph
          );
          if (opp3Hop) opportunities.push(opp3Hop);
        }
      }
    }
    
    return opportunities.sort((a, b) => 
      b.estimatedProfit.sub(a.estimatedProfit).gt(0) ? 1 : -1
    );
  }

  /**
   * Evaluate 2-hop stable arbitrage
   */
  private async evaluateTwoHop(
    stableA: string,
    stableB: string,
    graph: any
  ): Promise<ArbitrageOpportunity | null> {
    try {
      // Find best DEX for each direction
      const dexAtoB = graph.getBestDexForPair(stableA, stableB);
      const dexBtoA = graph.getBestDexForPair(stableB, stableA);
      
      if (!dexAtoB || !dexBtoA) return null;
      
      // Check if spread exists
      const spread = this.calculateSpread(dexAtoB, dexBtoA);
      if (spread < this.MIN_SPREAD_BPS) return null;
      
      const path: SwapPath = {
        hops: [
          {
            dexType: dexAtoB.dexType,
            dexName: dexAtoB.dexName,
            pair: dexAtoB.address,
            tokenIn: stableA,
            tokenOut: stableB,
            fee: dexAtoB.fee,
          },
          {
            dexType: dexBtoA.dexType,
            dexName: dexBtoA.dexName,
            pair: dexBtoA.address,
            tokenIn: stableB,
            tokenOut: stableA,
            fee: dexBtoA.fee,
          },
        ],
        startToken: stableA,
        endToken: stableA,
      };
      
      // Use larger amounts for stables (lower risk)
      const flashAmount = ethers.utils.parseUnits("50000", 6); // $50k
      
      const profit = await this.calculateProfit(path, flashAmount);
      
      if (profit.lte(this.config.minProfitThreshold)) return null;
      
      return {
        id: `stable-2hop-${Date.now()}-${Math.random()}`,
        strategy: this.name,
        path,
        flashToken: stableA,
        flashAmount,
        estimatedProfit: profit,
        estimatedGas: this.estimateGas(path),
        confidence: 0.9, // High confidence for stables
        timestamp: Date.now(),
        metadata: {
          spread: spread,
          type: "2-hop",
        },
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Evaluate 3-hop stable arbitrage
   */
  private async evaluateThreeHop(
    stableA: string,
    stableB: string,
    stableC: string,
    graph: any
  ): Promise<ArbitrageOpportunity | null> {
    try {
      const dexAtoB = graph.getBestDexForPair(stableA, stableB);
      const dexBtoC = graph.getBestDexForPair(stableB, stableC);
      const dexCtoA = graph.getBestDexForPair(stableC, stableA);
      
      if (!dexAtoB || !dexBtoC || !dexCtoA) return null;
      
      const path: SwapPath = {
        hops: [
          {
            dexType: dexAtoB.dexType,
            dexName: dexAtoB.dexName,
            pair: dexAtoB.address,
            tokenIn: stableA,
            tokenOut: stableB,
            fee: dexAtoB.fee,
          },
          {
            dexType: dexBtoC.dexType,
            dexName: dexBtoC.dexName,
            pair: dexBtoC.address,
            tokenIn: stableB,
            tokenOut: stableC,
            fee: dexBtoC.fee,
          },
          {
            dexType: dexCtoA.dexType,
            dexName: dexCtoA.dexName,
            pair: dexCtoA.address,
            tokenIn: stableC,
            tokenOut: stableA,
            fee: dexCtoA.fee,
          },
        ],
        startToken: stableA,
        endToken: stableA,
      };
      
      const flashAmount = ethers.utils.parseUnits("50000", 6);
      const profit = await this.calculateProfit(path, flashAmount);
      
      if (profit.lte(this.config.minProfitThreshold)) return null;
      
      return {
        id: `stable-3hop-${Date.now()}-${Math.random()}`,
        strategy: this.name,
        path,
        flashToken: stableA,
        flashAmount,
        estimatedProfit: profit,
        estimatedGas: this.estimateGas(path),
        confidence: 0.85,
        timestamp: Date.now(),
        metadata: {
          type: "3-hop",
        },
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Calculate profit for stable path
   */
  async calculateProfit(
    path: SwapPath,
    flashAmount: BigNumber
  ): Promise<BigNumber> {
    let amount = flashAmount;
    
    // Stables have minimal price impact (assume 0.1% per hop)
    for (const hop of path.hops) {
      const fee = hop.fee || 3000;
      amount = amount.mul(1000000 - fee).div(1000000);
      amount = amount.mul(999).div(1000); // 0.1% price impact
    }
    
    const debt = flashAmount.mul(10000 + this.FLASH_LOAN_FEE_BPS).div(10000);
    const netProfit = amount.sub(debt);
    
    return netProfit.gt(0) ? netProfit : BigNumber.from(0);
  }

  /**
   * Validate opportunity
   */
  async validate(opportunity: ArbitrageOpportunity): Promise<boolean> {
    const currentProfit = await this.calculateProfit(
      opportunity.path,
      opportunity.flashAmount
    );
    
    // Stricter validation for stables (98% of original)
    const minAcceptable = opportunity.estimatedProfit.mul(98).div(100);
    return currentProfit.gte(minAcceptable);
  }

  // ============ Helper Methods ============

  private getStablecoinAddresses(graph: any): string[] {
    const allTokens = graph.getAllTokens();
    return allTokens.filter((token: any) => 
      this.STABLECOINS.has(token.symbol)
    ).map((token: any) => token.address);
  }

  private calculateSpread(dexAtoB: any, dexBtoA: any): number {
    // Simplified spread calculation
    // Real implementation would check actual prices
    return 20; // Placeholder: 0.2% spread
  }

  private estimateGas(path: SwapPath): BigNumber {
    return BigNumber.from(80000 + path.hops.length * 110000 + 50000);
  }
}
