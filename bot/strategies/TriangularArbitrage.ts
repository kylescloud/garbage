/**
 * Triangular Arbitrage Strategy
 * 
 * Pattern: A → B → C → A (3-hop cycle)
 * Example: USDC → WETH → DAI → USDC
 * 
 * Profitability Condition:
 * final_A > initial_A × (1 + flash_fee + total_swap_fees + slippage)
 * 
 * Mathematical Foundation:
 * Let P_AB = price of B in terms of A
 * Let P_BC = price of C in terms of B  
 * Let P_CA = price of A in terms of C
 * 
 * Arbitrage exists when: P_AB × P_BC × P_CA > 1
 * Accounting for fees: P_AB × P_BC × P_CA > (1 + φ) where φ = total fees
 */

import { BigNumber, ethers } from "ethers";
import {
  IStrategy,
  ArbitrageOpportunity,
  SwapPath,
  SwapHop,
  StrategyConfig,
} from "../core/StrategyEngine";

export class TriangularArbitrage implements IStrategy {
  name = "TriangularArbitrage";
  description = "3-hop triangular arbitrage cycles";

  private readonly FLASH_LOAN_FEE_BPS = 9;
  private readonly MIN_CYCLE_PROFIT_BPS = 50; // 0.5% minimum profit
  
  private config: StrategyConfig;

  constructor(config: StrategyConfig) {
    this.config = config;
  }

  /**
   * Find triangular arbitrage opportunities
   * Scans for 3-hop cycles starting from each borrowable asset
   */
  async findOpportunities(graph: any): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];
    
    // Get all borrowable assets (potential starting points)
    const borrowableAssets = graph.getBorrowableAssets();
    
    for (const startToken of borrowableAssets) {
      // Find all 3-hop cycles starting from this token
      const cycles = this.findThreeHopCycles(startToken, graph);
      
      for (const cycle of cycles) {
        const opportunity = await this.evaluateCycle(cycle, startToken, graph);
        if (opportunity) {
          opportunities.push(opportunity);
        }
      }
    }
    
    return opportunities.sort((a, b) => 
      b.estimatedProfit.sub(a.estimatedProfit).gt(0) ? 1 : -1
    );
  }

  /**
   * Find all 3-hop cycles starting from a token
   * Uses DFS with cycle detection
   */
  private findThreeHopCycles(startToken: string, graph: any): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    
    // DFS to find 3-hop paths back to start
    const dfs = (currentToken: string, path: string[], depth: number) => {
      if (depth === 3) {
        // Check if we can get back to start
        const edges = graph.getEdges(currentToken, startToken);
        if (edges.length > 0) {
          cycles.push([...path, startToken]);
        }
        return;
      }
      
      if (visited.has(currentToken)) return;
      visited.add(currentToken);
      
      // Explore neighbors
      const neighbors = graph.getNeighbors(currentToken);
      for (const neighbor of neighbors) {
        if (neighbor !== startToken || depth === 2) {
          dfs(neighbor, [...path, neighbor], depth + 1);
        }
      }
      
      visited.delete(currentToken);
    };
    
    dfs(startToken, [startToken], 0);
    
    return cycles;
  }

  /**
   * Evaluate a specific cycle for profitability
   */
  private async evaluateCycle(
    cycle: string[],
    flashToken: string,
    graph: any
  ): Promise<ArbitrageOpportunity | null> {
    try {
      // Build path
      const path: SwapPath = {
        hops: [],
        startToken: flashToken,
        endToken: flashToken,
      };
      
      for (let i = 0; i < cycle.length - 1; i++) {
        const tokenIn = cycle[i];
        const tokenOut = cycle[i + 1];
        
        // Find best DEX for this hop
        const bestDex = graph.getBestDexForPair(tokenIn, tokenOut);
        if (!bestDex) continue;
        
        path.hops.push({
          dexType: bestDex.dexType,
          dexName: bestDex.dexName,
          pair: bestDex.address,
          tokenIn,
          tokenOut,
          fee: bestDex.fee,
        });
      }
      
      if (path.hops.length !== 3) return null;
      
      // Estimate flash loan amount (moderate size)
      const flashAmount = this.estimateFlashAmount(flashToken, graph);
      
      // Calculate profit
      const profit = await this.calculateProfit(path, flashAmount);
      
      if (profit.lte(this.config.minProfitThreshold)) {
        return null;
      }
      
      // Create opportunity
      return {
        id: `triangular-${Date.now()}-${Math.random()}`,
        strategy: this.name,
        path,
        flashToken,
        flashAmount,
        estimatedProfit: profit,
        estimatedGas: this.estimateGas(path),
        confidence: this.calculateConfidence(path, graph),
        timestamp: Date.now(),
        metadata: {
          cycle: cycle.join(" → "),
        },
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Calculate net profit for triangular path
   */
  async calculateProfit(
    path: SwapPath,
    flashAmount: BigNumber
  ): Promise<BigNumber> {
    let amount = flashAmount;
    
    // Simulate each hop
    for (const hop of path.hops) {
      // Simplified simulation - production should use V2SwapSimulator/V3SwapSimulator
      const fee = hop.fee || 3000;
      amount = amount.mul(1000000 - fee).div(1000000);
      amount = amount.mul(98).div(100); // Assume 2% price impact
    }
    
    // Calculate debt
    const debt = flashAmount.mul(10000 + this.FLASH_LOAN_FEE_BPS).div(10000);
    
    // Calculate gas cost (placeholder)
    const gasCost = BigNumber.from(0); // Should fetch actual gas price
    
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
    
    // Check if still profitable (with 5% safety margin)
    const minAcceptable = opportunity.estimatedProfit.mul(95).div(100);
    
    return currentProfit.gte(minAcceptable);
  }

  // ============ Helper Methods ============

  private estimateFlashAmount(token: string, graph: any): BigNumber {
    // Start with $10,000 equivalent
    return ethers.utils.parseUnits("10000", 6);
  }

  private estimateGas(path: SwapPath): BigNumber {
    // Flash loan base + 3 swaps
    return BigNumber.from(80000 + 3 * 120000 + 50000);
  }

  private calculateConfidence(path: SwapPath, graph: any): number {
    let confidence = 1.0;
    
    // Reduce for V3 complexity
    for (const hop of path.hops) {
      if (hop.dexType === "V3") confidence *= 0.95;
    }
    
    return Math.max(0, Math.min(1, confidence));
  }
}
