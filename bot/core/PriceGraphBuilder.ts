/**
 * Price Graph Builder
 * 
 * Constructs a directed weighted multigraph from DEX pairs
 * Graph structure: G = (V, E, w) where:
 * - V = set of tokens (vertices)
 * - E = set of trading pairs (directed edges)
 * - w = edge weights (prices, liquidity, fees)
 * 
 * Used by strategies for path finding and cycle detection
 */

import { BigNumber } from "ethers";

export interface TokenVertex {
  address: string;
  symbol: string;
  decimals: number;
  isBorrowable?: boolean;
}

export interface PairEdge {
  pair: string;
  dexType: "V2" | "V3";
  dexName: string;
  tokenIn: string;
  tokenOut: string;
  reserve0?: BigNumber;
  reserve1?: BigNumber;
  liquidity?: BigNumber;
  fee: number;
  token0: string;
  token1: string;
}

export class PriceGraphBuilder {
  private vertices: Map<string, TokenVertex> = new Map();
  private edges: Map<string, PairEdge[]> = new Map();
  private borrowableAssets: Set<string> = new Set();
  
  /**
   * Add a token vertex to the graph
   */
  addToken(token: TokenVertex): void {
    this.vertices.set(token.address.toLowerCase(), token);
    
    if (token.isBorrowable) {
      this.borrowableAssets.add(token.address.toLowerCase());
    }
  }
  
  /**
   * Add a pair edge (adds both directions for trading)
   */
  addPair(edge: PairEdge): void {
    const token0Lower = edge.token0.toLowerCase();
    const token1Lower = edge.token1.toLowerCase();
    
    // Add edge: token0 → token1
    this.addDirectedEdge({
      ...edge,
      tokenIn: token0Lower,
      tokenOut: token1Lower,
    });
    
    // Add reverse edge: token1 → token0
    this.addDirectedEdge({
      ...edge,
      tokenIn: token1Lower,
      tokenOut: token0Lower,
    });
  }
  
  /**
   * Add a directed edge to the graph
   */
  private addDirectedEdge(edge: PairEdge): void {
    const key = edge.tokenIn.toLowerCase();
    
    if (!this.edges.has(key)) {
      this.edges.set(key, []);
    }
    
    this.edges.get(key)!.push(edge);
  }
  
  /**
   * Get all neighbors of a token
   */
  getNeighbors(token: string): string[] {
    const edges = this.edges.get(token.toLowerCase()) || [];
    return edges.map(e => e.tokenOut);
  }
  
  /**
   * Get all edges from tokenIn to tokenOut
   */
  getEdges(tokenIn: string, tokenOut: string): PairEdge[] {
    const edges = this.edges.get(tokenIn.toLowerCase()) || [];
    return edges.filter(e => e.tokenOut.toLowerCase() === tokenOut.toLowerCase());
  }
  
  /**
   * Check if edge exists between two tokens
   */
  hasEdge(tokenIn: string, tokenOut: string): boolean {
    return this.getEdges(tokenIn, tokenOut).length > 0;
  }
  
  /**
   * Get best DEX for a token pair (highest liquidity)
   */
  getBestDexForPair(tokenIn: string, tokenOut: string): PairEdge | null {
    const edges = this.getEdges(tokenIn, tokenOut);
    
    if (edges.length === 0) return null;
    
    // Sort by liquidity (or reserve0 * reserve1 for V2)
    const sorted = edges.sort((a, b) => {
      const liquidityA = a.liquidity || 
        (a.reserve0 && a.reserve1 ? a.reserve0.mul(a.reserve1) : BigNumber.from(0));
      const liquidityB = b.liquidity || 
        (b.reserve0 && b.reserve1 ? b.reserve0.mul(b.reserve1) : BigNumber.from(0));
      
      return liquidityB.sub(liquidityA).gt(0) ? 1 : -1;
    });
    
    return sorted[0];
  }
  
  /**
   * Get all pairs for a token pair
   */
  getPairsForTokens(tokenA: string, tokenB: string): PairEdge[] {
    const edgesAB = this.getEdges(tokenA, tokenB);
    const edgesBA = this.getEdges(tokenB, tokenA);
    return [...edgesAB, ...edgesBA];
  }
  
  /**
   * Get borrowable assets
   */
  getBorrowableAssets(): string[] {
    return Array.from(this.borrowableAssets);
  }
  
  /**
   * Get all tokens in the graph
   */
  getAllTokens(): TokenVertex[] {
    return Array.from(this.vertices.values());
  }
  
  /**
   * Get token info
   */
  getTokenInfo(address: string): TokenVertex | undefined {
    return this.vertices.get(address.toLowerCase());
  }
  
  /**
   * Get all edges in the graph
   */
  getAllEdges(): PairEdge[] {
    const allEdges: PairEdge[] = [];
    
    for (const edges of this.edges.values()) {
      allEdges.push(...edges);
    }
    
    return allEdges;
  }
  
  /**
   * Get V2 pairs only
   */
  getV2Pairs(): PairEdge[] {
    return this.getAllEdges().filter(e => e.dexType === "V2");
  }
  
  /**
   * Get V3 pairs only
   */
  getV3Pairs(): PairEdge[] {
    return this.getAllEdges().filter(e => e.dexType === "V3");
  }
  
  /**
   * Get balanced pools (reserve ratio close to expected)
   * Simplified implementation
   */
  getBalancedPools(tokenIn: string, tokenOut: string): PairEdge[] {
    const edges = this.getEdges(tokenIn, tokenOut);
    
    // Filter for V2 pools with reasonable reserve ratios
    return edges.filter(edge => {
      if (edge.dexType !== "V2") return false;
      if (!edge.reserve0 || !edge.reserve1) return false;
      
      const ratio = edge.reserve0.mul(100).div(edge.reserve1);
      // Consider "balanced" if ratio is between 20:80 and 80:20
      return ratio.gte(20) && ratio.lte(500);
    });
  }
  
  /**
   * Get graph statistics
   */
  getStatistics(): {
    tokenCount: number;
    pairCount: number;
    v2PairCount: number;
    v3PairCount: number;
    borrowableAssetCount: number;
    averageDegree: number;
  } {
    const tokenCount = this.vertices.size;
    const allEdges = this.getAllEdges();
    const pairCount = allEdges.length / 2; // Divided by 2 because edges are bidirectional
    const v2PairCount = this.getV2Pairs().length / 2;
    const v3PairCount = this.getV3Pairs().length / 2;
    const borrowableAssetCount = this.borrowableAssets.size;
    
    // Average degree = average number of neighbors per token
    let totalDegree = 0;
    for (const token of this.vertices.keys()) {
      totalDegree += this.getNeighbors(token).length;
    }
    const averageDegree = tokenCount > 0 ? totalDegree / tokenCount : 0;
    
    return {
      tokenCount,
      pairCount,
      v2PairCount,
      v3PairCount,
      borrowableAssetCount,
      averageDegree,
    };
  }
  
  /**
   * Clear the graph
   */
  clear(): void {
    this.vertices.clear();
    this.edges.clear();
    this.borrowableAssets.clear();
  }
}
