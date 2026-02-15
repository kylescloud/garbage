/**
 * Flash Executor
 * 
 * Executes flash loan arbitrage opportunities
 * Handles:
 * - Transaction building
 * - Gas estimation
 * - Simulation
 * - Submission
 * - Status monitoring
 */

import { ethers, Contract, BigNumber } from "ethers";
import { ArbitrageOpportunity, SwapPath } from "./StrategyEngine";

export interface ExecutionConfig {
  contractAddress: string;
  maxGasPrice: BigNumber;
  slippageBps: number;
  simulateFirst: boolean;
  waitForConfirmation: boolean;
}

export interface ExecutionResult {
  success: boolean;
  txHash?: string;
  profit?: BigNumber;
  gasUsed?: BigNumber;
  error?: string;
}

export class FlashExecutor {
  private provider: ethers.providers.Provider;
  private signer: ethers.Signer;
  private contract: Contract;
  private config: ExecutionConfig;
  
  constructor(
    provider: ethers.providers.Provider,
    signer: ethers.Signer,
    contractABI: any[],
    config: ExecutionConfig
  ) {
    this.provider = provider;
    this.signer = signer;
    this.contract = new Contract(config.contractAddress, contractABI, signer);
    this.config = config;
  }
  
  /**
   * Execute an arbitrage opportunity
   */
  async execute(opportunity: ArbitrageOpportunity): Promise<ExecutionResult> {
    try {
      console.log(`Executing opportunity: ${opportunity.id}`);
      
      // Check gas price
      const gasPrice = await this.provider.getGasPrice();
      if (gasPrice.gt(this.config.maxGasPrice)) {
        return {
          success: false,
          error: `Gas price too high: ${ethers.utils.formatUnits(gasPrice, "gwei")} gwei`,
        };
      }
      
      // Build transaction data
      const txData = this.buildTransactionData(opportunity);
      
      // Simulate if enabled
      if (this.config.simulateFirst) {
        const simResult = await this.simulate(txData);
        if (!simResult.success) {
          return {
            success: false,
            error: `Simulation failed: ${simResult.error}`,
          };
        }
      }
      
      // Estimate gas
      const gasEstimate = await this.estimateGas(txData);
      const gasLimit = gasEstimate.mul(120).div(100); // 20% buffer
      
      // Calculate min output with slippage
      const minOutput = this.calculateMinOutput(
        opportunity.flashAmount,
        opportunity.path,
        this.config.slippageBps
      );
      
      // Submit transaction
      console.log(`Submitting transaction...`);
      const tx = await this.contract.executeArbitrage(
        opportunity.flashToken,
        opportunity.flashAmount,
        this.encodePath(opportunity.path),
        minOutput,
        {
          gasLimit,
          gasPrice,
        }
      );
      
      console.log(`Transaction submitted: ${tx.hash}`);
      
      // Wait for confirmation if enabled
      if (this.config.waitForConfirmation) {
        const receipt = await tx.wait();
        
        return {
          success: receipt.status === 1,
          txHash: tx.hash,
          gasUsed: receipt.gasUsed,
          error: receipt.status === 1 ? undefined : "Transaction reverted",
        };
      }
      
      return {
        success: true,
        txHash: tx.hash,
      };
      
    } catch (error: any) {
      console.error(`Execution error:`, error);
      
      return {
        success: false,
        error: error.message || "Unknown error",
      };
    }
  }
  
  /**
   * Simulate transaction execution
   */
  private async simulate(txData: any): Promise<{success: boolean; error?: string}> {
    try {
      await this.contract.callStatic.executeArbitrage(...txData);
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Simulation failed",
      };
    }
  }
  
  /**
   * Estimate gas for transaction
   */
  private async estimateGas(txData: any): Promise<BigNumber> {
    try {
      return await this.contract.estimateGas.executeArbitrage(...txData);
    } catch (error) {
      // Return conservative estimate if estimation fails
      return BigNumber.from(500000);
    }
  }
  
  /**
   * Build transaction data from opportunity
   */
  private buildTransactionData(opportunity: ArbitrageOpportunity): any[] {
    const minOutput = this.calculateMinOutput(
      opportunity.flashAmount,
      opportunity.path,
      this.config.slippageBps
    );
    
    return [
      opportunity.flashToken,
      opportunity.flashAmount,
      this.encodePath(opportunity.path),
      minOutput,
    ];
  }
  
  /**
   * Encode swap path for contract
   */
  private encodePath(path: SwapPath): any {
    return {
      hops: path.hops.map(hop => ({
        pair: hop.pair,
        tokenIn: hop.tokenIn,
        tokenOut: hop.tokenOut,
        dexType: hop.dexType === "V2" ? 0 : 1,
      })),
    };
  }
  
  /**
   * Calculate minimum output with slippage
   */
  private calculateMinOutput(
    flashAmount: BigNumber,
    path: SwapPath,
    slippageBps: number
  ): BigNumber {
    // Simplified - should simulate full path
    const expectedOutput = flashAmount.mul(101).div(100); // Assume 1% profit
    return expectedOutput.mul(10000 - slippageBps).div(10000);
  }
  
  /**
   * Get transaction status
   */
  async getTransactionStatus(txHash: string): Promise<{
    confirmed: boolean;
    success?: boolean;
    blockNumber?: number;
  }> {
    try {
      const receipt = await this.provider.getTransactionReceipt(txHash);
      
      if (!receipt) {
        return { confirmed: false };
      }
      
      return {
        confirmed: true,
        success: receipt.status === 1,
        blockNumber: receipt.blockNumber,
      };
    } catch (error) {
      return { confirmed: false };
    }
  }
  
  /**
   * Check if contract is ready
   */
  async isReady(): Promise<boolean> {
    try {
      const code = await this.provider.getCode(this.config.contractAddress);
      return code !== "0x";
    } catch (error) {
      return false;
    }
  }
}
