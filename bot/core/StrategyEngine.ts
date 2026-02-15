/**
 * Strategy Engine - Orchestrates Multiple Arbitrage Strategies
 * 
 * Responsibilities:
 * - Manage multiple strategy instances
 * - Run strategies in parallel
 * - Aggregate and rank opportunities
 * - Filter by profitability and confidence
 * - Deduplicate similar opportunities
 * - Provide unified interface for opportunity discovery
 */

import { BigNumber } from "ethers";

// ============ Type Definitions ============

/**
 * Arbitrage opportunity identified by a strategy
 */
export interface ArbitrageOpportunity {
  id: string;
  strategy: string;
  path: SwapPath;
  flashToken: string;
  flashAmount: BigNumber;
  estimatedProfit: BigNumber;
  estimatedGas: BigNumber;
  confidence: number; // 0-1 scale
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * Complete swap path from start to end
 */
export interface SwapPath {
  hops: SwapHop[];
  startToken: string;
  endToken: string;
}

/**
 * Single swap hop in a path
 */
export interface SwapHop {
  dexType: "V2" | "V3";
  dexName: string;
  pair: string;
  tokenIn: string;
  tokenOut: string;
  amountIn?: BigNumber;
  amountOut?: BigNumber;
  fee?: number; // For V3: 500, 3000, or 10000 (basis points)
}

/**
 * Strategy configuration
 */
export interface StrategyConfig {
  enabled: boolean;
  minProfitThreshold: BigNumber;
  maxGasPrice: BigNumber;
  maxSlippageBps: number;
  maxPathLength: number;
}

/**
 * Strategy interface that all strategies must implement
 */
export interface IStrategy {
  name: string;
  description: string;
  
  /**
   * Find arbitrage opportunities
   * @param graph Liquidity graph
   * @returns Array of opportunities
   */
  findOpportunities(graph: any): Promise<ArbitrageOpportunity[]>;
  
  /**
   * Validate an opportunity before execution
   * @param opportunity Opportunity to validate
   * @returns true if valid and profitable
   */
  validate(opportunity: ArbitrageOpportunity): Promise<boolean>;
  
  /**
   * Calculate expected profit
   * @param path Swap path
   * @param flashAmount Flash loan amount
   * @returns Estimated net profit
   */
  calculateProfit(path: SwapPath, flashAmount: BigNumber): Promise<BigNumber>;
}

/**
 * Engine configuration
 */
export interface EngineConfig {
  maxOpportunitiesPerCycle: number;
  minConfidence: number;
  deduplicationWindow: number; // milliseconds
  parallelExecution: boolean;
}

// ============ Strategy Engine Implementation ============

export class StrategyEngine {
  private strategies: Map<string, IStrategy> = new Map();
  private config: EngineConfig;
  private recentOpportunities: Map<string, number> = new Map(); // id -> timestamp
  
  constructor(config: EngineConfig) {
    this.config = config;
  }
  
  /**
   * Register a strategy with the engine
   * @param strategy Strategy instance
   */
  registerStrategy(strategy: IStrategy): void {
    if (this.strategies.has(strategy.name)) {
      throw new Error(`Strategy ${strategy.name} already registered`);
    }
    
    this.strategies.set(strategy.name, strategy);
    console.log(`Registered strategy: ${strategy.name}`);
  }
  
  /**
   * Unregister a strategy
   * @param strategyName Name of strategy to remove
   */
  unregisterStrategy(strategyName: string): void {
    this.strategies.delete(strategyName);
    console.log(`Unregistered strategy: ${strategyName}`);
  }
  
  /**
   * Get all registered strategies
   * @returns Array of strategy names
   */
  getRegisteredStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }
  
  /**
   * Find all arbitrage opportunities across all strategies
   * @param graph Liquidity graph
   * @returns Ranked opportunities
   */
  async findOpportunities(graph: any): Promise<ArbitrageOpportunity[]> {
    console.log(`Running ${this.strategies.size} strategies...`);
    
    // Run all strategies
    const opportunitiesPerStrategy = this.config.parallelExecution
      ? await this.runStrategiesParallel(graph)
      : await this.runStrategiesSequential(graph);
    
    // Flatten all opportunities
    const allOpportunities = opportunitiesPerStrategy.flat();
    
    console.log(`Found ${allOpportunities.length} total opportunities`);
    
    // Filter by confidence
    const filtered = allOpportunities.filter(
      opp => opp.confidence >= this.config.minConfidence
    );
    
    console.log(`${filtered.length} opportunities after confidence filter`);
    
    // Deduplicate
    const deduplicated = this.deduplicateOpportunities(filtered);
    
    console.log(`${deduplicated.length} opportunities after deduplication`);
    
    // Sort by profit descending
    const sorted = deduplicated.sort((a, b) => 
      b.estimatedProfit.sub(a.estimatedProfit).gt(0) ? 1 : -1
    );
    
    // Limit to max opportunities
    const limited = sorted.slice(0, this.config.maxOpportunitiesPerCycle);
    
    // Store for deduplication tracking
    this.trackOpportunities(limited);
    
    return limited;
  }
  
  /**
   * Run all strategies in parallel
   * @param graph Liquidity graph
   * @returns Array of opportunity arrays
   */
  private async runStrategiesParallel(graph: any): Promise<ArbitrageOpportunity[][]> {
    const promises = Array.from(this.strategies.values()).map(
      async (strategy) => {
        try {
          console.log(`Running strategy: ${strategy.name}`);
          const opportunities = await strategy.findOpportunities(graph);
          console.log(`${strategy.name} found ${opportunities.length} opportunities`);
          return opportunities;
        } catch (error) {
          console.error(`Error in strategy ${strategy.name}:`, error);
          return [];
        }
      }
    );
    
    return Promise.all(promises);
  }
  
  /**
   * Run all strategies sequentially
   * @param graph Liquidity graph
   * @returns Array of opportunity arrays
   */
  private async runStrategiesSequential(graph: any): Promise<ArbitrageOpportunity[][]> {
    const results: ArbitrageOpportunity[][] = [];
    
    for (const strategy of this.strategies.values()) {
      try {
        console.log(`Running strategy: ${strategy.name}`);
        const opportunities = await strategy.findOpportunities(graph);
        console.log(`${strategy.name} found ${opportunities.length} opportunities`);
        results.push(opportunities);
      } catch (error) {
        console.error(`Error in strategy ${strategy.name}:`, error);
        results.push([]);
      }
    }
    
    return results;
  }
  
  /**
   * Deduplicate similar opportunities
   * Removes opportunities that are too similar or recently seen
   * @param opportunities Array to deduplicate
   * @returns Deduplicated array
   */
  private deduplicateOpportunities(
    opportunities: ArbitrageOpportunity[]
  ): ArbitrageOpportunity[] {
    const uniqueOpps: ArbitrageOpportunity[] = [];
    const seenPaths = new Set<string>();
    
    for (const opp of opportunities) {
      // Create path signature for comparison
      const pathSignature = this.createPathSignature(opp.path);
      
      // Check if we've seen this path recently
      const recentTimestamp = this.recentOpportunities.get(pathSignature);
      if (recentTimestamp) {
        const age = Date.now() - recentTimestamp;
        if (age < this.config.deduplicationWindow) {
          continue; // Skip recently seen opportunity
        }
      }
      
      // Check if we've seen this path in current batch
      if (seenPaths.has(pathSignature)) {
        continue; // Skip duplicate in current batch
      }
      
      seenPaths.add(pathSignature);
      uniqueOpps.push(opp);
    }
    
    return uniqueOpps;
  }
  
  /**
   * Create a signature for a path for deduplication
   * @param path Swap path
   * @returns Path signature string
   */
  private createPathSignature(path: SwapPath): string {
    const hops = path.hops.map(hop => 
      `${hop.dexName}:${hop.tokenIn}:${hop.tokenOut}`
    ).join('-');
    
    return `${path.startToken}:${hops}:${path.endToken}`;
  }
  
  /**
   * Track opportunities for deduplication
   * @param opportunities Opportunities to track
   */
  private trackOpportunities(opportunities: ArbitrageOpportunity[]): void {
    const now = Date.now();
    
    for (const opp of opportunities) {
      const signature = this.createPathSignature(opp.path);
      this.recentOpportunities.set(signature, now);
    }
    
    // Clean up old entries
    this.cleanupTracking();
  }
  
  /**
   * Remove old tracking entries
   */
  private cleanupTracking(): void {
    const now = Date.now();
    const cutoff = now - (this.config.deduplicationWindow * 2);
    
    for (const [signature, timestamp] of this.recentOpportunities.entries()) {
      if (timestamp < cutoff) {
        this.recentOpportunities.delete(signature);
      }
    }
  }
  
  /**
   * Validate an opportunity across all registered strategies
   * @param opportunity Opportunity to validate
   * @returns true if valid according to its strategy
   */
  async validateOpportunity(opportunity: ArbitrageOpportunity): Promise<boolean> {
    const strategy = this.strategies.get(opportunity.strategy);
    
    if (!strategy) {
      console.error(`Strategy ${opportunity.strategy} not found`);
      return false;
    }
    
    try {
      return await strategy.validate(opportunity);
    } catch (error) {
      console.error(`Error validating opportunity:`, error);
      return false;
    }
  }
  
  /**
   * Get statistics about the engine
   * @returns Engine statistics
   */
  getStatistics(): {
    strategiesRegistered: number;
    opportunitiesTracked: number;
    strategies: Record<string, string>;
  } {
    const strategies: Record<string, string> = {};
    
    for (const [name, strategy] of this.strategies.entries()) {
      strategies[name] = strategy.description;
    }
    
    return {
      strategiesRegistered: this.strategies.size,
      opportunitiesTracked: this.recentOpportunities.size,
      strategies,
    };
  }
  
  /**
   * Clear all tracking data (useful for testing)
   */
  clearTracking(): void {
    this.recentOpportunities.clear();
    console.log("Cleared opportunity tracking");
  }
}
