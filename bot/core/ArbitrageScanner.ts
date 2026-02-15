/**
 * ArbitrageScanner
 * 
 * High-level orchestration of arbitrage discovery system.
 * Integrates Phases 1-5: Flash loans, V2/V3 simulation, optimization, and path finding.
 * 
 * Workflow:
 * 1. Fetch borrowable assets (Phase 1)
 * 2. Fetch V2 pairs and V3 pools (Phases 2-3)
 * 3. Build liquidity graph (Phase 5)
 * 4. Find arbitrage cycles (Phase 5)
 * 5. Optimize each path (Phase 4)
 * 6. Rank by profitability
 * 7. Return top opportunities
 */

import { ethers } from 'ethers';
import { BorrowableAssetFetcher } from './BorrowableAssetFetcher';
import { PairFetcher } from './PairFetcher';
import { V3PoolFetcher } from './V3PoolFetcher';
import { LiquidityGraph } from './LiquidityGraph';
import { PathFinder, DEFAULT_PATHFINDER_CONFIG, type PathFinderConfig } from './PathFinder';
import { GasEstimator } from './GasEstimator';
import { ProfitOptimizer, DEFAULT_OPTIMIZATION_CONFIG } from './ProfitOptimizer';
import type { ArbitragePath } from './ProfitCalculator';
import type { OptimizationResult } from './ProfitOptimizer';

/**
 * Arbitrage opportunity with full details
 */
export interface ArbitrageOpportunity {
  path: ArbitragePath;
  optimization: OptimizationResult;
  asset: {
    address: string;
    symbol: string;
    decimals: number;
    priceUsd: number;
  };
  rank: number;
}

/**
 * Scanner configuration
 */
export interface ScannerConfig {
  // Path finding
  pathFinder: Partial<PathFinderConfig>;
  
  // Asset filtering
  minAssetLiquidity: bigint;  // Minimum borrowable amount
  targetAssets: string[];      // Specific assets to scan (empty = all)
  
  // Profitability
  minProfitUsd: number;
  
  // Performance
  maxPathsToOptimize: number;  // Limit optimization to top N paths
  maxResultsToReturn: number;  // Return top N opportunities
  
  // Gas
  ethPriceUsd: number;
  
  // Enable/disable phases
  enableV2: boolean;
  enableV3: boolean;
}

/**
 * Default scanner configuration
 */
export const DEFAULT_SCANNER_CONFIG: ScannerConfig = {
  pathFinder: DEFAULT_PATHFINDER_CONFIG,
  minAssetLiquidity: 10000n * 10n ** 6n, // $10k
  targetAssets: [], // Scan all assets
  minProfitUsd: 5.0,
  maxPathsToOptimize: 100,
  maxResultsToReturn: 10,
  ethPriceUsd: 3000,
  enableV2: true,
  enableV3: true,
};

/**
 * Scan statistics
 */
export interface ScanStats {
  assetsScanned: number;
  v2PairsFetched: number;
  v3PoolsFetched: number;
  graphVertices: number;
  graphEdges: number;
  pathsFound: number;
  pathsOptimized: number;
  profitablePathsFound: number;
  totalTimeMs: number;
  timeBreakdown: {
    dataFetching: number;
    graphBuilding: number;
    pathFinding: number;
    optimization: number;
  };
}

export class ArbitrageScanner {
  private provider: ethers.JsonRpcProvider;
  private config: ScannerConfig;
  
  private assetFetcher: BorrowableAssetFetcher;
  private pairFetcher: PairFetcher;
  private poolFetcher: V3PoolFetcher;
  private gasEstimator: GasEstimator;
  
  private stats: ScanStats = {
    assetsScanned: 0,
    v2PairsFetched: 0,
    v3PoolsFetched: 0,
    graphVertices: 0,
    graphEdges: 0,
    pathsFound: 0,
    pathsOptimized: 0,
    profitablePathsFound: 0,
    totalTimeMs: 0,
    timeBreakdown: {
      dataFetching: 0,
      graphBuilding: 0,
      pathFinding: 0,
      optimization: 0,
    },
  };
  
  constructor(
    provider: ethers.JsonRpcProvider,
    config: Partial<ScannerConfig> = {}
  ) {
    this.provider = provider;
    this.config = { ...DEFAULT_SCANNER_CONFIG, ...config };
    
    this.assetFetcher = new BorrowableAssetFetcher(provider);
    this.pairFetcher = new PairFetcher(provider);
    this.poolFetcher = new V3PoolFetcher(provider);
    this.gasEstimator = new GasEstimator(provider);
    this.gasEstimator.setEthPrice(this.config.ethPriceUsd);
  }
  
  /**
   * Scan for arbitrage opportunities
   * 
   * Full workflow integrating all phases
   */
  async scan(): Promise<ArbitrageOpportunity[]> {
    console.log('\n' + '='.repeat(60));
    console.log('ARBITRAGE SCANNER - FULL SYSTEM SCAN');
    console.log('='.repeat(60) + '\n');
    
    const totalStartTime = Date.now();
    
    // Reset stats
    this.resetStats();
    
    // ========================================
    // PHASE 1: Fetch Borrowable Assets
    // ========================================
    console.log('Phase 1: Fetching borrowable assets from Aave V3...');
    const fetchStart = Date.now();
    
    const allAssets = await this.assetFetcher.fetchBorrowableAssets();
    
    // Filter assets
    let assets = allAssets.filter(
      a => a.availableToBorrow >= this.config.minAssetLiquidity
    );
    
    if (this.config.targetAssets.length > 0) {
      const targetSet = new Set(this.config.targetAssets.map(a => a.toLowerCase()));
      assets = assets.filter(a => targetSet.has(a.address.toLowerCase()));
    }
    
    console.log(`  Found ${assets.length} borrowable assets\n`);
    this.stats.assetsScanned = assets.length;
    
    // ========================================
    // PHASES 2-3: Fetch Pairs and Pools
    // ========================================
    console.log('Phase 2: Fetching V2 pairs...');
    let v2Pairs = [];
    if (this.config.enableV2) {
      v2Pairs = await this.pairFetcher.fetchAllPairs();
      console.log(`  Found ${v2Pairs.length} V2 pairs\n`);
      this.stats.v2PairsFetched = v2Pairs.length;
    } else {
      console.log(`  V2 disabled\n`);
    }
    
    console.log('Phase 3: Fetching V3 pools...');
    let v3Pools = [];
    if (this.config.enableV3) {
      v3Pools = await this.poolFetcher.fetchAllPools();
      console.log(`  Found ${v3Pools.length} V3 pools\n`);
      this.stats.v3PoolsFetched = v3Pools.length;
    } else {
      console.log(`  V3 disabled\n`);
    }
    
    this.stats.timeBreakdown.dataFetching = Date.now() - fetchStart;
    
    // ========================================
    // PHASE 5: Build Liquidity Graph
    // ========================================
    console.log('Phase 5: Building liquidity graph...');
    const graphStart = Date.now();
    
    const graph = new LiquidityGraph(this.config.pathFinder.minLiquidity);
    graph.buildFromPairsAndPools(v2Pairs, v3Pools);
    graph.removeIsolatedVertices();
    
    const graphStats = graph.getStatistics();
    this.stats.graphVertices = graphStats.vertexCount;
    this.stats.graphEdges = graphStats.edgeCount;
    
    graph.printSummary();
    
    this.stats.timeBreakdown.graphBuilding = Date.now() - graphStart;
    
    // ========================================
    // PHASE 5: Find Arbitrage Paths
    // ========================================
    console.log('Phase 5: Finding arbitrage cycles...');
    const pathStart = Date.now();
    
    const pathFinder = new PathFinder(graph, this.config.pathFinder);
    
    let allPaths: ArbitragePath[] = [];
    
    // Find paths from each borrowable asset
    for (const asset of assets) {
      const paths = pathFinder.findCycles(asset.address);
      allPaths.push(...paths);
    }
    
    // Remove duplicates
    allPaths = pathFinder.removeDuplicates(allPaths);
    
    console.log(`  Found ${allPaths.length} unique cycles\n`);
    this.stats.pathsFound = allPaths.length;
    
    pathFinder.printStatistics();
    
    this.stats.timeBreakdown.pathFinding = Date.now() - pathStart;
    
    // ========================================
    // PHASE 4: Optimize Paths
    // ========================================
    console.log('Phase 4: Optimizing profitable paths...');
    const optStart = Date.now();
    
    // Limit paths to optimize
    const pathsToOptimize = allPaths.slice(0, this.config.maxPathsToOptimize);
    console.log(`  Optimizing top ${pathsToOptimize.length} paths...\n`);
    
    const opportunities: ArbitrageOpportunity[] = [];
    
    for (const path of pathsToOptimize) {
      // Determine asset (first token in path)
      const assetAddress = path.tokenAddresses[0];
      const asset = assets.find(a => a.address.toLowerCase() === assetAddress.toLowerCase());
      
      if (!asset) continue;
      
      try {
        // Optimize path
        const optimizer = new ProfitOptimizer(this.gasEstimator, {
          ...DEFAULT_OPTIMIZATION_CONFIG,
          minProfitUsd: this.config.minProfitUsd,
          maxLoanAmount: asset.availableToBorrow,
        });
        
        const result = await optimizer.findOptimalLoanSize(
          path,
          1.0, // TODO: Fetch real asset price from oracle
          asset.decimals
        );
        
        this.stats.pathsOptimized++;
        
        // Check if profitable
        if (result.success && result.optimalProfit.netProfitUsd >= this.config.minProfitUsd) {
          opportunities.push({
            path,
            optimization: result,
            asset: {
              address: asset.address,
              symbol: asset.symbol,
              decimals: asset.decimals,
              priceUsd: 1.0, // TODO: Fetch real price
            },
            rank: 0, // Will be assigned after sorting
          });
          
          this.stats.profitablePathsFound++;
        }
      } catch (error) {
        console.error(`Error optimizing path:`, error);
      }
    }
    
    this.stats.timeBreakdown.optimization = Date.now() - optStart;
    
    // ========================================
    // Rank and Filter
    // ========================================
    console.log(`\nRanking opportunities...`);
    
    // Sort by profit descending
    opportunities.sort((a, b) =>
      b.optimization.optimalProfit.netProfitUsd - a.optimization.optimalProfit.netProfitUsd
    );
    
    // Assign ranks
    opportunities.forEach((opp, i) => {
      opp.rank = i + 1;
    });
    
    // Limit results
    const topOpportunities = opportunities.slice(0, this.config.maxResultsToReturn);
    
    // ========================================
    // Summary
    // ========================================
    this.stats.totalTimeMs = Date.now() - totalStartTime;
    
    console.log('\n' + '='.repeat(60));
    console.log('SCAN COMPLETE');
    console.log('='.repeat(60) + '\n');
    
    this.printStatistics();
    this.printTopOpportunities(topOpportunities);
    
    return topOpportunities;
  }
  
  /**
   * Scan for specific asset only
   */
  async scanAsset(assetAddress: string): Promise<ArbitrageOpportunity[]> {
    const previousTargets = this.config.targetAssets;
    this.config.targetAssets = [assetAddress];
    
    const results = await this.scan();
    
    this.config.targetAssets = previousTargets;
    return results;
  }
  
  /**
   * Print scan statistics
   */
  printStatistics(): void {
    console.log('Scan Statistics:');
    console.log(`  Assets scanned: ${this.stats.assetsScanned}`);
    console.log(`  V2 pairs: ${this.stats.v2PairsFetched}`);
    console.log(`  V3 pools: ${this.stats.v3PoolsFetched}`);
    console.log(`  Graph vertices: ${this.stats.graphVertices}`);
    console.log(`  Graph edges: ${this.stats.graphEdges}`);
    console.log(`  Paths found: ${this.stats.pathsFound}`);
    console.log(`  Paths optimized: ${this.stats.pathsOptimized}`);
    console.log(`  Profitable paths: ${this.stats.profitablePathsFound}`);
    console.log();
    
    console.log('Time Breakdown:');
    console.log(`  Data fetching: ${this.stats.timeBreakdown.dataFetching}ms`);
    console.log(`  Graph building: ${this.stats.timeBreakdown.graphBuilding}ms`);
    console.log(`  Path finding: ${this.stats.timeBreakdown.pathFinding}ms`);
    console.log(`  Optimization: ${this.stats.timeBreakdown.optimization}ms`);
    console.log(`  Total: ${this.stats.totalTimeMs}ms`);
    console.log();
  }
  
  /**
   * Print top opportunities
   */
  printTopOpportunities(opportunities: ArbitrageOpportunity[]): void {
    if (opportunities.length === 0) {
      console.log('No profitable opportunities found.');
      return;
    }
    
    console.log(`Top ${opportunities.length} Arbitrage Opportunities:\n`);
    
    for (const opp of opportunities) {
      const path = opp.path;
      const opt = opp.optimization;
      const asset = opp.asset;
      
      console.log(`${opp.rank}. ${asset.symbol} (${path.hops.length}-hop)`);
      console.log(`   Path: ${path.tokenAddresses.map(t => t.slice(0, 6)).join(' → ')}`);
      console.log(`   Optimal Loan: ${(Number(opt.optimalLoanSize) / 10 ** asset.decimals).toFixed(2)} ${asset.symbol}`);
      console.log(`   Net Profit: $${opt.optimalProfit.netProfitUsd.toFixed(2)}`);
      console.log(`   Gas: ${opt.optimalProfit.gasEstimate.toLocaleString()} units`);
      console.log(`   Iterations: ${opt.iterations}`);
      console.log();
    }
  }
  
  /**
   * Export opportunities to JSON
   */
  async exportOpportunities(opportunities: ArbitrageOpportunity[], filePath: string): Promise<void> {
    const data = {
      timestamp: Date.now(),
      scanStats: this.stats,
      opportunities: opportunities.map(opp => ({
        rank: opp.rank,
        asset: opp.asset,
        path: {
          tokenAddresses: opp.path.tokenAddresses,
          hopCount: opp.path.hops.length,
          hops: opp.path.hops.map(h => ({
            type: h.type,
            tokenIn: h.tokenIn,
            tokenOut: h.tokenOut,
            dex: h.pair?.dex || h.pool?.dex,
          })),
        },
        optimization: {
          success: opp.optimization.success,
          optimalLoanSize: opp.optimization.optimalLoanSize.toString(),
          netProfit: opp.optimization.optimalProfit.netProfit.toString(),
          netProfitUsd: opp.optimization.optimalProfit.netProfitUsd,
          gasEstimate: opp.optimization.optimalProfit.gasEstimate.toString(),
          iterations: opp.optimization.iterations,
        },
      })),
    };
    
    const fs = await import('fs/promises');
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    console.log(`Opportunities exported to ${filePath}`);
  }
  
  /**
   * Get scan statistics
   */
  getStatistics(): ScanStats {
    return { ...this.stats };
  }
  
  /**
   * Reset statistics
   */
  private resetStats(): void {
    this.stats = {
      assetsScanned: 0,
      v2PairsFetched: 0,
      v3PoolsFetched: 0,
      graphVertices: 0,
      graphEdges: 0,
      pathsFound: 0,
      pathsOptimized: 0,
      profitablePathsFound: 0,
      totalTimeMs: 0,
      timeBreakdown: {
        dataFetching: 0,
        graphBuilding: 0,
        pathFinding: 0,
        optimization: 0,
      },
    };
  }
}
