/**
 * Arbitrage Bot Main Entry Point
 * 
 * Orchestrates the entire arbitrage system:
 * 1. Load configuration
 * 2. Initialize components
 * 3. Fetch borrowable assets and pairs
 * 4. Build liquidity graph
 * 5. Run strategies to find opportunities
 * 6. Execute profitable opportunities
 * 7. Repeat
 */

import { ethers } from "ethers";
import { PriceGraphBuilder } from "./core/PriceGraphBuilder";
import { StrategyEngine, StrategyConfig } from "./core/StrategyEngine";
import { FlashExecutor, ExecutionConfig } from "./core/FlashExecutor";
import { TwoDexPriceDiff } from "./strategies/TwoDexPriceDiff";
import { TriangularArbitrage } from "./strategies/TriangularArbitrage";
import { MultiHopCrossDex } from "./strategies/MultiHopCrossDex";
import { StableSpreadStrategy } from "./strategies/StableSpreadStrategy";
import { LiquidityImbalanceStrategy } from "./strategies/LiquidityImbalanceStrategy";
import FlashArbitrageABI from "../artifacts/contracts/FlashArbitrage.sol/FlashArbitrage.json";

// ============ Configuration ============

const config = {
  rpcUrl: process.env.BASE_RPC_URL || "https://mainnet.base.org",
  privateKey: process.env.PRIVATE_KEY || "",
  contractAddress: process.env.CONTRACT_ADDRESS || "",
  
  // Strategy config
  strategyConfig: {
    enabled: true,
    minProfitThreshold: ethers.utils.parseUnits("10", 6), // $10 minimum
    maxGasPrice: ethers.utils.parseUnits("0.1", "gwei"), // 0.1 gwei max
    maxSlippageBps: 50, // 0.5%
    maxPathLength: 6,
  } as StrategyConfig,
  
  // Engine config
  engineConfig: {
    maxOpportunitiesPerCycle: 10,
    minConfidence: 0.7,
    deduplicationWindow: 60000, // 60 seconds
    parallelExecution: true,
  },
  
  // Execution config
  executionConfig: {
    contractAddress: process.env.CONTRACT_ADDRESS || "",
    maxGasPrice: ethers.utils.parseUnits("0.1", "gwei"),
    slippageBps: 50,
    simulateFirst: true,
    waitForConfirmation: true,
  } as ExecutionConfig,
  
  // Bot config
  scanInterval: 30000, // Scan every 30 seconds
  autoExecute: false, // Safety: manual execution by default
};

// ============ Main Bot Class ============

class ArbitrageBot {
  private provider: ethers.providers.Provider;
  private signer: ethers.Signer;
  private graph: PriceGraphBuilder;
  private engine: StrategyEngine;
  private executor: FlashExecutor;
  private running: boolean = false;
  
  constructor() {
    // Initialize provider
    this.provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    
    // Initialize signer
    if (!config.privateKey) {
      throw new Error("PRIVATE_KEY not set in environment");
    }
    this.signer = new ethers.Wallet(config.privateKey, this.provider);
    
    // Initialize components
    this.graph = new PriceGraphBuilder();
    this.engine = new StrategyEngine(config.engineConfig);
    this.executor = new FlashExecutor(
      this.provider,
      this.signer,
      FlashArbitrageABI.abi,
      config.executionConfig
    );
  }
  
  /**
   * Initialize the bot
   */
  async initialize(): Promise<void> {
    console.log("Initializing arbitrage bot...");
    
    // Verify contract deployment
    const isReady = await this.executor.isReady();
    if (!isReady) {
      throw new Error(`Contract not deployed at ${config.contractAddress}`);
    }
    
    // Register strategies
    this.registerStrategies();
    
    // Load initial data
    await this.loadData();
    
    console.log("Bot initialized successfully");
    this.printStatistics();
  }
  
  /**
   * Register all strategies with the engine
   */
  private registerStrategies(): void {
    console.log("Registering strategies...");
    
    this.engine.registerStrategy(new TwoDexPriceDiff(config.strategyConfig));
    this.engine.registerStrategy(new TriangularArbitrage(config.strategyConfig));
    this.engine.registerStrategy(new MultiHopCrossDex(config.strategyConfig));
    this.engine.registerStrategy(new StableSpreadStrategy(config.strategyConfig));
    this.engine.registerStrategy(new LiquidityImbalanceStrategy(config.strategyConfig));
    
    console.log(`Registered ${this.engine.getRegisteredStrategies().length} strategies`);
  }
  
  /**
   * Load borrowable assets and pairs
   */
  private async loadData(): Promise<void> {
    console.log("Loading market data...");
    
    // Load from cache files or fetch fresh
    // For now, this is placeholder - production would call:
    // - BorrowableAssetFetcher.fetchAssets()
    // - PairFetcher.fetchPairs()
    
    // Add example tokens (placeholder)
    this.graph.addToken({
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      symbol: "USDC",
      decimals: 6,
      isBorrowable: true,
    });
    
    this.graph.addToken({
      address: "0x4200000000000000000000000000000000000006",
      symbol: "WETH",
      decimals: 18,
      isBorrowable: true,
    });
    
    console.log("Market data loaded");
  }
  
  /**
   * Start the bot main loop
   */
  async start(): Promise<void> {
    if (this.running) {
      console.log("Bot is already running");
      return;
    }
    
    console.log("Starting arbitrage bot...");
    this.running = true;
    
    // Main loop
    while (this.running) {
      try {
        await this.scanCycle();
        
        // Wait before next scan
        await this.sleep(config.scanInterval);
      } catch (error) {
        console.error("Error in scan cycle:", error);
        // Continue running even if one cycle fails
      }
    }
  }
  
  /**
   * Stop the bot
   */
  stop(): void {
    console.log("Stopping arbitrage bot...");
    this.running = false;
  }
  
  /**
   * Single scan cycle
   */
  private async scanCycle(): Promise<void> {
    console.log("\n=== Starting Scan Cycle ===");
    const startTime = Date.now();
    
    // Find opportunities
    const opportunities = await this.engine.findOpportunities(this.graph);
    
    console.log(`Found ${opportunities.length} opportunities`);
    
    if (opportunities.length === 0) {
      console.log("No opportunities found");
      return;
    }
    
    // Display top opportunities
    console.log("\nTop Opportunities:");
    for (let i = 0; i < Math.min(5, opportunities.length); i++) {
      const opp = opportunities[i];
      console.log(`${i + 1}. ${opp.strategy}`);
      console.log(`   Profit: $${ethers.utils.formatUnits(opp.estimatedProfit, 6)}`);
      console.log(`   Confidence: ${(opp.confidence * 100).toFixed(1)}%`);
      console.log(`   Path: ${opp.path.hops.length} hops`);
    }
    
    // Execute if auto-execute enabled
    if (config.autoExecute && opportunities.length > 0) {
      const best = opportunities[0];
      
      // Validate before execution
      const isValid = await this.engine.validateOpportunity(best);
      
      if (isValid) {
        console.log(`\nExecuting opportunity: ${best.id}`);
        const result = await this.executor.execute(best);
        
        if (result.success) {
          console.log(`✅ Execution successful! TX: ${result.txHash}`);
        } else {
          console.log(`❌ Execution failed: ${result.error}`);
        }
      } else {
        console.log("Opportunity validation failed, skipping execution");
      }
    } else if (!config.autoExecute) {
      console.log("\n⚠️  Auto-execution disabled. Set autoExecute=true to execute automatically");
    }
    
    const elapsed = Date.now() - startTime;
    console.log(`\nScan cycle completed in ${elapsed}ms`);
  }
  
  /**
   * Print bot statistics
   */
  private printStatistics(): void {
    const graphStats = this.graph.getStatistics();
    const engineStats = this.engine.getStatistics();
    
    console.log("\n=== Bot Statistics ===");
    console.log(`Tokens: ${graphStats.tokenCount}`);
    console.log(`Pairs: ${graphStats.pairCount} (V2: ${graphStats.v2PairCount}, V3: ${graphStats.v3PairCount})`);
    console.log(`Borrowable Assets: ${graphStats.borrowableAssetCount}`);
    console.log(`Average Degree: ${graphStats.averageDegree.toFixed(2)}`);
    console.log(`Strategies: ${engineStats.strategiesRegistered}`);
    console.log(`Opportunities Tracked: ${engineStats.opportunitiesTracked}`);
    console.log("======================\n");
  }
  
  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============ Main Execution ============

async function main() {
  console.log("Base Chain Multi-DEX Arbitrage Bot");
  console.log("====================================\n");
  
  // Create bot instance
  const bot = new ArbitrageBot();
  
  try {
    // Initialize
    await bot.initialize();
    
    // Start main loop
    await bot.start();
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

// Handle shutdown gracefully
process.on("SIGINT", () => {
  console.log("\nReceived SIGINT, shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\nReceived SIGTERM, shutting down...");
  process.exit(0);
});

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}

export { ArbitrageBot };
