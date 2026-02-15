import { ethers } from "hardhat";
import { AAVE_V3_BASE_CONFIG } from "../bot/config/aave.config";
import { BASE_CONFIG } from "../bot/config/base.config";

/**
 * Deploy FlashArbitrage Contract to Base Mainnet
 * 
 * Configuration:
 * - Aave V3 Pool
 * - Addresses Provider
 * - WETH address
 * - Owner address
 * - Minimum profit threshold
 * - Maximum slippage
 */
async function main() {
  console.log("🚀 Deploying FlashArbitrage to Base Mainnet...\n");

  // Get deployer
  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  console.log("Deployer balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // Configuration
  const config = {
    pool: AAVE_V3_BASE_CONFIG.POOL,
    addressesProvider: AAVE_V3_BASE_CONFIG.POOL_ADDRESSES_PROVIDER,
    weth: BASE_CONFIG.WETH,
    owner: deployer.address, // Owner receives profits
    minProfitThreshold: 5_000_000n, // 5 USDC (6 decimals)
    maxSlippageBps: 100n, // 1% (100 basis points)
  };

  console.log("Configuration:");
  console.log("  Aave V3 Pool:", config.pool);
  console.log("  Addresses Provider:", config.addressesProvider);
  console.log("  WETH:", config.weth);
  console.log("  Owner:", config.owner);
  console.log("  Min Profit Threshold:", config.minProfitThreshold.toString(), "(5 USDC)");
  console.log("  Max Slippage:", config.maxSlippageBps.toString(), "bps (1%)\n");

  // Estimate deployment gas
  const FlashArbitrage = await ethers.getContractFactory("FlashArbitrage");
  const deployTx = await FlashArbitrage.getDeployTransaction(
    config.pool,
    config.addressesProvider,
    config.weth,
    config.owner,
    config.minProfitThreshold,
    config.maxSlippageBps
  );
  
  const estimatedGas = await ethers.provider.estimateGas(deployTx);
  const gasPrice = (await ethers.provider.getFeeData()).gasPrice || 0n;
  const estimatedCost = estimatedGas * gasPrice;
  
  console.log("Deployment Estimates:");
  console.log("  Estimated Gas:", estimatedGas.toString());
  console.log("  Gas Price:", ethers.formatUnits(gasPrice, "gwei"), "gwei");
  console.log("  Estimated Cost:", ethers.formatEther(estimatedCost), "ETH\n");

  // Confirm deployment
  console.log("⚠️  Ready to deploy. Press Ctrl+C to cancel or wait 5 seconds...");
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Deploy contract
  console.log("\n📝 Deploying contract...");
  const flashArbitrage = await FlashArbitrage.deploy(
    config.pool,
    config.addressesProvider,
    config.weth,
    config.owner,
    config.minProfitThreshold,
    config.maxSlippageBps
  );

  console.log("⏳ Waiting for deployment transaction...");
  await flashArbitrage.waitForDeployment();

  const contractAddress = await flashArbitrage.getAddress();
  console.log("\n✅ FlashArbitrage deployed to:", contractAddress);

  // Get deployment transaction
  const deploymentTx = flashArbitrage.deploymentTransaction();
  if (deploymentTx) {
    console.log("  Transaction Hash:", deploymentTx.hash);
    console.log("  Block Number:", deploymentTx.blockNumber);
    
    const receipt = await deploymentTx.wait();
    if (receipt) {
      console.log("  Gas Used:", receipt.gasUsed.toString());
      console.log("  Gas Price:", ethers.formatUnits(receipt.gasPrice || 0n, "gwei"), "gwei");
      console.log("  Total Cost:", ethers.formatEther(receipt.gasUsed * (receipt.gasPrice || 0n)), "ETH");
    }
  }

  // Verify configuration
  console.log("\n🔍 Verifying deployed contract...");
  const poolAddress = await flashArbitrage.POOL();
  const providerAddress = await flashArbitrage.ADDRESSES_PROVIDER();
  const wethAddress = await flashArbitrage.WETH();
  const ownerAddress = await flashArbitrage.owner();
  const minProfit = await flashArbitrage.minProfitThreshold();
  const maxSlippage = await flashArbitrage.maxSlippageBps();
  const isPaused = await flashArbitrage.paused();

  console.log("  Pool:", poolAddress, poolAddress === config.pool ? "✅" : "❌");
  console.log("  Provider:", providerAddress, providerAddress === config.addressesProvider ? "✅" : "❌");
  console.log("  WETH:", wethAddress, wethAddress === config.weth ? "✅" : "❌");
  console.log("  Owner:", ownerAddress, ownerAddress === config.owner ? "✅" : "❌");
  console.log("  Min Profit:", minProfit.toString(), minProfit === config.minProfitThreshold ? "✅" : "❌");
  console.log("  Max Slippage:", maxSlippage.toString(), maxSlippage === config.maxSlippageBps ? "✅" : "❌");
  console.log("  Paused:", isPaused, isPaused === false ? "✅" : "❌");

  // Save deployment info
  const deploymentInfo = {
    network: "base-mainnet",
    contractAddress: contractAddress,
    deployer: deployer.address,
    deploymentTx: deploymentTx?.hash,
    blockNumber: deploymentTx?.blockNumber,
    timestamp: new Date().toISOString(),
    config: {
      pool: poolAddress,
      addressesProvider: providerAddress,
      weth: wethAddress,
      owner: ownerAddress,
      minProfitThreshold: minProfit.toString(),
      maxSlippageBps: maxSlippage.toString(),
    },
  };

  const fs = require("fs");
  const path = require("path");
  const deploymentPath = path.join(__dirname, "../deployments");
  
  if (!fs.existsSync(deploymentPath)) {
    fs.mkdirSync(deploymentPath, { recursive: true });
  }
  
  fs.writeFileSync(
    path.join(deploymentPath, "FlashArbitrage-base.json"),
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("\n💾 Deployment info saved to deployments/FlashArbitrage-base.json");

  // Next steps
  console.log("\n📋 Next Steps:");
  console.log("1. Verify contract on Basescan:");
  console.log(`   npx hardhat verify --network base ${contractAddress} "${config.pool}" "${config.addressesProvider}" "${config.weth}" "${config.owner}" ${config.minProfitThreshold} ${config.maxSlippageBps}`);
  console.log("\n2. Fund contract with ETH for gas:");
  console.log(`   Send ETH to: ${contractAddress}`);
  console.log("\n3. Test with small arbitrage:");
  console.log(`   npx ts-node scripts/execute.ts`);
  console.log("\n4. Monitor execution:");
  console.log(`   npx ts-node scripts/monitor.ts ${contractAddress}`);

  console.log("\n✨ Deployment complete!\n");
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });
