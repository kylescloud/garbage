/**
 * PathFinder
 * 
 * Depth-first search algorithm for finding arbitrage cycles in liquidity graph.
 * Implements complete cycle enumeration with pruning strategies.
 * 
 * Mathematical Foundation: See PHASE_5_MATHEMATICAL_FOUNDATION.md Section 3
 */

import { LiquidityGraph, type GraphEdge } from './LiquidityGraph';
import type { ArbitragePath, PathHop } from './ProfitCalculator';

/**
 * Path finding configuration
 */
export interface PathFinderConfig {
  maxDepth: number;           // Maximum path length (hops)
  minDepth: number;           // Minimum path length (typically 2)
  minLiquidity: bigint;       // Minimum edge liquidity
  maxGasEstimate: bigint;     // Maximum total gas
  maxPathsPerToken: number;   // Maximum paths to return per starting token
  enablePruning: boolean;     // Enable aggressive pruning
}

/**
 * Default path finding configuration
 */
export const DEFAULT_PATHFINDER_CONFIG: PathFinderConfig = {
  maxDepth: 6,
  minDepth: 2,
  minLiquidity: 10000n * 10n ** 6n, // $10k
  maxGasEstimate: 800000n,           // 800k gas max
  maxPathsPerToken: 100,
  enablePruning: true,
};

/**
 * Path finding statistics
 */
export interface PathFindingStats {
  tokensExplored: number;
  pathsFound: number;
  pathsPruned: number;
  nodesVisited: number;
  timeElapsed: number;
  avgPathLength: number;
}

export class PathFinder {
  private graph: LiquidityGraph;
  private config: PathFinderConfig;
  
  // Statistics
  private stats: PathFindingStats = {
    tokensExplored: 0,
    pathsFound: 0,
    pathsPruned: 0,
    nodesVisited: 0,
    timeElapsed: 0,
    avgPathLength: 0,
  };
  
  constructor(graph: LiquidityGraph, config: Partial<PathFinderConfig> = {}) {
    this.graph = graph;
    this.config = { ...DEFAULT_PATHFINDER_CONFIG, ...config };
  }
  
  /**
   * Find all cycles starting from a given token
   * 
   * Algorithm: Depth-first search with cycle detection
   * Time Complexity: O(m^d) where m = avg out-degree, d = max depth
   * Space Complexity: O(d) for recursion stack
   */
  findCycles(startToken: string): ArbitragePath[] {
    const start = startToken.toLowerCase();
    
    if (!this.graph.hasVertex(start)) {
      return [];
    }
    
    const cycles: ArbitragePath[] = [];
    const visited = new Set<string>();
    const currentPath: GraphEdge[] = [];
    
    // DFS from start
    this.dfs(
      start,
      start,
      visited,
      currentPath,
      cycles,
      0
    );
    
    return cycles;
  }
  
  /**
   * Find cycles from all tokens in graph
   */
  findAllCycles(): ArbitragePath[] {
    console.log('Finding all arbitrage cycles...');
    const startTime = Date.now();
    
    // Reset stats
    this.stats = {
      tokensExplored: 0,
      pathsFound: 0,
      pathsPruned: 0,
      nodesVisited: 0,
      timeElapsed: 0,
      avgPathLength: 0,
    };
    
    const allCycles: ArbitragePath[] = [];
    const tokens = this.graph.getTokenAddresses();
    
    for (const token of tokens) {
      const cycles = this.findCycles(token);
      allCycles.push(...cycles);
      this.stats.tokensExplored++;
      
      // Limit paths per token
      if (cycles.length > this.config.maxPathsPerToken) {
        allCycles.splice(
          allCycles.length - cycles.length + this.config.maxPathsPerToken
        );
      }
    }
    
    // Calculate statistics
    this.stats.timeElapsed = Date.now() - startTime;
    this.stats.pathsFound = allCycles.length;
    
    if (allCycles.length > 0) {
      const totalLength = allCycles.reduce((sum, path) => sum + path.hops.length, 0);
      this.stats.avgPathLength = totalLength / allCycles.length;
    }
    
    console.log(`Found ${allCycles.length} cycles in ${this.stats.timeElapsed}ms`);
    
    return allCycles;
  }
  
  /**
   * Depth-first search recursive implementation
   * 
   * @param current - Current token address
   * @param start - Starting token address (for cycle detection)
   * @param visited - Set of visited tokens in current path
   * @param currentPath - Current path edges
   * @param cycles - Accumulated cycles
   * @param depth - Current depth
   */
  private dfs(
    current: string,
    start: string,
    visited: Set<string>,
    currentPath: GraphEdge[],
    cycles: ArbitragePath[],
    depth: number
  ): void {
    this.stats.nodesVisited++;
    
    // Check depth limit
    if (depth > this.config.maxDepth) {
      this.stats.pathsPruned++;
      return;
    }
    
    // Check if we found a cycle
    if (depth >= this.config.minDepth && current === start && currentPath.length > 0) {
      // Convert to ArbitragePath format
      const path = this.convertToArbitragePath(currentPath, start);
      cycles.push(path);
      return; // Don't continue past the cycle
    }
    
    // Avoid revisiting nodes (except start node for cycle)
    if (depth > 0 && current !== start && visited.has(current)) {
      this.stats.pathsPruned++;
      return;
    }
    
    // Mark as visited
    if (current !== start || depth > 0) {
      visited.add(current);
    }
    
    // Explore neighbors
    const edges = this.graph.getOutgoingEdges(current);
    
    for (const edge of edges) {
      // Pruning: Check liquidity
      if (this.config.enablePruning && edge.effectiveLiquidity < this.config.minLiquidity) {
        this.stats.pathsPruned++;
        continue;
      }
      
      // Pruning: Check gas estimate
      const currentGas = this.estimatePathGas(currentPath);
      if (this.config.enablePruning && currentGas + edge.gasEstimate > this.config.maxGasEstimate) {
        this.stats.pathsPruned++;
        continue;
      }
      
      // Add edge to path
      currentPath.push(edge);
      
      // Recurse
      this.dfs(
        edge.to,
        start,
        visited,
        currentPath,
        cycles,
        depth + 1
      );
      
      // Backtrack
      currentPath.pop();
    }
    
    // Unmark as visited
    if (current !== start || depth > 0) {
      visited.delete(current);
    }
  }
  
  /**
   * Convert graph edges to ArbitragePath format
   */
  private convertToArbitragePath(edges: GraphEdge[], startToken: string): ArbitragePath {
    const hops: PathHop[] = [];
    const tokenAddresses: string[] = [startToken];
    
    for (const edge of edges) {
      const hop: PathHop = {
        type: edge.type,
        tokenIn: edge.from,
        tokenOut: edge.to,
      };
      
      if (edge.type === 'v2' && edge.pair) {
        hop.pair = edge.pair;
      } else if (edge.type === 'v3' && edge.pool) {
        hop.pool = edge.pool;
        // Note: ticks would need to be fetched separately in production
        hop.ticks = new Map();
      }
      
      hops.push(hop);
      tokenAddresses.push(edge.to);
    }
    
    return {
      hops,
      tokenAddresses,
    };
  }
  
  /**
   * Estimate total gas for path
   */
  private estimatePathGas(edges: GraphEdge[]): bigint {
    let total = 200000n; // Flash loan base
    
    for (const edge of edges) {
      total += edge.gasEstimate;
    }
    
    total += 50000n; // Overhead
    
    return total;
  }
  
  /**
   * Filter paths by minimum liquidity across all hops
   */
  filterByMinLiquidity(paths: ArbitragePath[], minLiq: bigint): ArbitragePath[] {
    return paths.filter(path => {
      for (const hop of path.hops) {
        if (hop.type === 'v2' && hop.pair) {
          const minReserve = hop.pair.reserve0 < hop.pair.reserve1
            ? hop.pair.reserve0
            : hop.pair.reserve1;
          if (minReserve < minLiq) return false;
        } else if (hop.type === 'v3' && hop.pool) {
          if (hop.pool.liquidity < minLiq) return false;
        }
      }
      return true;
    });
  }
  
  /**
   * Filter paths by maximum gas estimate
   */
  filterByMaxGas(paths: ArbitragePath[], maxGas: bigint): ArbitragePath[] {
    return paths.filter(path => {
      let totalGas = 200000n; // Flash loan
      
      for (const hop of path.hops) {
        if (hop.type === 'v2') {
          totalGas += 110000n;
        } else {
          totalGas += 245000n; // V3 with average ticks
        }
      }
      
      totalGas += 50000n; // Overhead
      
      return totalGas <= maxGas;
    });
  }
  
  /**
   * Filter paths by depth range
   */
  filterByDepth(paths: ArbitragePath[], minDepth: number, maxDepth: number): ArbitragePath[] {
    return paths.filter(path =>
      path.hops.length >= minDepth && path.hops.length <= maxDepth
    );
  }
  
  /**
   * Remove duplicate paths
   */
  removeDuplicates(paths: ArbitragePath[]): ArbitragePath[] {
    const seen = new Set<string>();
    const unique: ArbitragePath[] = [];
    
    for (const path of paths) {
      const key = this.getPathKey(path);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(path);
      }
    }
    
    return unique;
  }
  
  /**
   * Generate unique key for path
   */
  private getPathKey(path: ArbitragePath): string {
    return path.tokenAddresses.join('->');
  }
  
  /**
   * Get path finding statistics
   */
  getStatistics(): PathFindingStats {
    return { ...this.stats };
  }
  
  /**
   * Print statistics
   */
  printStatistics(): void {
    console.log('\n=== PATH FINDING STATISTICS ===\n');
    console.log(`Tokens explored: ${this.stats.tokensExplored}`);
    console.log(`Paths found: ${this.stats.pathsFound}`);
    console.log(`Paths pruned: ${this.stats.pathsPruned}`);
    console.log(`Nodes visited: ${this.stats.nodesVisited}`);
    console.log(`Time elapsed: ${this.stats.timeElapsed}ms`);
    console.log(`Average path length: ${this.stats.avgPathLength.toFixed(2)} hops`);
    
    if (this.stats.nodesVisited > 0) {
      const efficiency = (this.stats.pathsFound / this.stats.nodesVisited) * 100;
      console.log(`Efficiency: ${efficiency.toFixed(4)}% (paths/nodes)`);
    }
    
    console.log();
  }
  
  /**
   * Find shortest path between two tokens (for debugging)
   */
  findShortestPath(from: string, to: string): ArbitragePath | null {
    const start = from.toLowerCase();
    const target = to.toLowerCase();
    
    if (!this.graph.hasVertex(start) || !this.graph.hasVertex(target)) {
      return null;
    }
    
    // BFS for shortest path
    const queue: Array<{ token: string; path: GraphEdge[] }> = [
      { token: start, path: [] }
    ];
    const visited = new Set<string>([start]);
    
    while (queue.length > 0) {
      const { token, path } = queue.shift()!;
      
      if (token === target && path.length > 0) {
        return this.convertToArbitragePath(path, start);
      }
      
      if (path.length >= this.config.maxDepth) {
        continue;
      }
      
      const edges = this.graph.getOutgoingEdges(token);
      
      for (const edge of edges) {
        if (!visited.has(edge.to) || edge.to === target) {
          visited.add(edge.to);
          queue.push({
            token: edge.to,
            path: [...path, edge],
          });
        }
      }
    }
    
    return null;
  }
}
