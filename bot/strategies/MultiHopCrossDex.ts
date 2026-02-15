/**
 * Multi-Hop Cross-DEX Strategy
 * 
 * Pattern: Complex paths across multiple DEXes (4-6 hops)
 * Example: USDC → WETH (BaseSwap) → DAI (Aerodrome) → USDC (Uniswap) → 
 *          WETH (SushiSwap) → USDC (BaseSwap)
 * 
 * Uses graph algorithms to find profitable multi-hop cycles
 * Filters by minimum profit per hop to avoid excessive gas costs
 */

import { BigNumber, ethers } from "ethers";
import {
  IStrategy,
  ArbitrageOpportunity,
  SwapPath,
  SwapHop,
  StrategyConfig,
} from "../core/StrategyEngine";

export class MultiHopCrossDex implements IStrategy {
  name = "MultiHopCrossDex";
  description = "Complex multi-hop paths (4-6 hops) across multiple DEXes";

  private readonly FLASH_LOAN_FEE_BPS = 9;
  private readonly MIN_HOPS = 4;
  private readonly MAX_HOPS = 6;
  private readonly MIN_PROFIT_PER_HOP_BPS = 10; // 0.1% per hop minimum
  
  private config: StrategyConfig;

  constructor(config: StrategyConfig) {
    this.config = config;
  }

  /**
   * Find multi-hop arbitrage opportunities
   * Uses DFS with profit-based pruning
   */
  async findOpportunities(graph: any): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];
    
    // Get borrowable assets
    const borrowableAssets = graph.getBorrowableAssets();
    
    for (const startToken of borrowableAssets) {
      // Find profitable cycles of length 4-6
      for (let hopCount = this.MIN_HOPS; hopCount <= this.MAX_HOPS; hopCount++) {
        const cycles = this.findCycles(startToken, hopCount, graph);
        
        for (const cycle of cycles) {
          const opportunity = await this.evaluateCycle(cycle, startToken, graph);
          if (opportunity) {
            opportunities.push(opportunity);
          }
        }
      }
    }
    
    return opportunities
      .sort((a, b) => b.estimatedProfit.sub(a.estimatedProfit).gt(0) ? 1 : -1)
      .slice(0, 20); // Top 20 multi-hop opportunities
  }

  /**
   * Find cycles of specific length using DFS with pruning
   */
  private findCycles(
    startToken: string,
    targetLength: number,
    graph: any
  ): string[][] {
    const cycles: string[][] = [];
    const maxCycles = 100; // Limit to prevent explosion
    
    const dfs = (
      current: string,
      path: string[],
      visited: Set<string>
    ) => {
      if (cycles.length >= maxCycles) return;
      
      const depth = path.length - 1;
      
      if (depth === targetLength) {
        // Check if can return to start
        if (graph.hasEdge(current, startToken)) {
          cycles.push([...path, startToken]);
        }
        return;
      }
      
      if (depth >= targetLength) return;
      
      const neighbors = graph.getNeighbors(current);
      
      for (const neighbor of neighbors) {
        // Prevent revisiting except for final return
        if (visited.has(neighbor) && neighbor !== startToken) continue;
        if (neighbor === startToken && depth < targetLength - 1) continue;
        
        visited.add(neighbor);
        dfs(neighbor, [...path, neighbor], visited);
        visited.delete(neighbor);
      }
    };
    
    const visited = new Set<string>();
    visited.add(startToken);
    dfs(startToken, [startToken], visited);
    
    return cycles;
  }

  /**
   * Evaluate a specific cycle
   */
  private async evaluateCycle(
    cycle: string[],
    flashToken: string,
    graph: any
  ): Promise<ArbitrageOpportunity | null> {
    try {
      const path: SwapPath = {
        hops: [],
        startToken: flashToken,
        endToken: flashToken,
      };
      
      // Build path selecting best DEX for each hop
      for (let i = 0; i < cycle.length - 1; i++) {
        const tokenIn = cycle[i];
        const tokenOut = cycle[i + 1];
        
        const bestDex = graph.getBestDexForPair(tokenIn, tokenOut);
        if (!bestDex) return null;
        
        path.hops.push({
          dexType: bestDex.dexType,
          dexName: bestDex.dexName,
          pair: bestDex.address,
          tokenIn,
          tokenOut,
          fee: bestDex.fee,
        });
      }
      
      const flashAmount = ethers.utils.parseUnits("10000", 6);
      const profit = await this.calculateProfit(path, flashAmount);
      
      // Check minimum profit per hop
      const profitPerHop = profit.mul(10000).div(flashAmount).div(path.hops.length);
      if (profitPerHop.lt(this.MIN_PROFIT_PER_HOP_BPS)) {
        return null;
      }
      
      if (profit.lte(this.config.minProfitThreshold)) {
        return null;
      }
      
      return {
        id: `multihop-${Date.now()}-${Math.random()}`,
        strategy: this.name,
        path,
        flashToken,
        flashAmount,
        estimatedProfit: profit,
        estimatedGas: this.estimateGas(path),
        confidence: this.calculateConfidence(path),
        timestamp: Date.now(),
        metadata: {
          hopCount: path.hops.length,
          cycle: cycle.join(" → "),
        },
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Calculate profit for path
   */
  async calculateProfit(
    path: SwapPath,
    flashAmount: BigNumber
  ): Promise<BigNumber> {
    let amount = flashAmount;
    
    for (const hop of path.hops) {
      const fee = hop.fee || 3000;
      amount = amount.mul(1000000 - fee).div(1000000);
      amount = amount.mul(97).div(100); // Assume 3% impact for longer paths
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
    
    const minAcceptable = opportunity.estimatedProfit.mul(90).div(100);
    return currentProfit.gte(minAcceptable);
  }

  private estimateGas(path: SwapPath): BigNumber {
    const gasPerHop = 120000;
    return BigNumber.from(80000 + path.hops.length * gasPerHop + 50000);
  }

  private calculateConfidence(path: SwapPath): number {
    // Longer paths = lower confidence
    const lengthPenalty = 1.0 - (path.hops.length - 4) * 0.05;
    return Math.max(0.5, Math.min(1, lengthPenalty));
  }
}
