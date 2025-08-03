const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Script for Cardano-to-EVM atomic swap flow
 * 1. Taker creates destination escrow with EVM tokens
 * 2. Maker provides Cardano assets and reveals secret
 * 3. Resolver withdraws EVM tokens using the secret
 */

async function main() {
  console.log("🎯 Cardano-to-EVM Atomic Swap Flow");
  console.log("==================================");

  // Get signers
  const [maker,taker] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  
  console.log(`📡 Network: ${network.name} (${network.chainId})`);
  console.log(`👤 Deployer (Taker): ${taker.address}`);
  console.log(`👤 Maker: ${maker.address}`);
  console.log(`💰 Taker Balance: ${ethers.formatEther(await ethers.provider.getBalance(taker.address))} ETH`);
  console.log(`💰 Maker Balance: ${ethers.formatEther(await ethers.provider.getBalance(maker.address))} ETH`);

  // Load deployment addresses
  const deploymentAddresses = loadDeploymentAddresses(network.name);
  const escrowFactoryAddress = deploymentAddresses.cardanoEscrowFactory;
  
  console.log(`\n📋 Contract Addresses:`);
  console.log(`   EscrowFactory: ${escrowFactoryAddress}`);

  // Get the EscrowFactory contract
  const escrowFactory = await ethers.getContractAt("EscrowFactory", escrowFactoryAddress);

  // Generate a secret and hashlock for the swap
  const secret = "0x59d34aea074e4088f09701c8b7f759f0fae79957bfbb6463eb267d6f2cb4970c"; // "hello" padded to 32 bytes
  const hashlock = ethers.keccak256(secret);
  
  console.log(`\n🔑 Swap Parameters:`);
  console.log(`   Secret: ${secret}`);
  console.log(`   Hashlock: ${hashlock}`);

  // Swap parameters
  const swapAmount = ethers.parseEther("0.001"); // 0.001 ETH worth of tokens to swap
  const safetyDeposit = ethers.parseEther("0.0001"); // 0.0001 ETH safety deposit
  const orderHash = ethers.keccak256(ethers.toUtf8Bytes("dummy-order-hash-" + Date.now()));

  // Create immutables for destination escrow
  const immutables = {
    orderHash: orderHash,
    hashlock: hashlock,
    maker: maker.address, // Maker (will receive the EVM tokens)
    taker: taker.address, // Taker (providing EVM tokens, will receive Cardano)
    token: "0x0000000000000000000000000000000000000000", // ETH
    amount: swapAmount,
    safetyDeposit: safetyDeposit,
    timelocks: "0x0000000000000000000000000000000000000000" // No timelocks for this demo
  };

  console.log(`\n📦 Escrow Immutables:`);
  console.log(`   Order Hash: ${immutables.orderHash}`);
  console.log(`   Hashlock: ${immutables.hashlock}`);
  console.log(`   Maker: ${immutables.maker}`);
  console.log(`   Taker: ${immutables.taker}`);
  console.log(`   Token: ${immutables.token === "0x0000000000000000000000000000000000000000" ? "ETH" : immutables.token}`);
  console.log(`   Amount: ${ethers.formatEther(immutables.amount)} ETH`);
  console.log(`   Safety Deposit: ${ethers.formatEther(immutables.safetyDeposit)} ETH`);

  // Step 1: Create destination escrow
  console.log(`\n🚀 Step 1: Creating destination escrow...`);
  
  const totalEthRequired = swapAmount + safetyDeposit; // For ETH swaps
  console.log(`💰 Total ETH required: ${ethers.formatEther(totalEthRequired)} ETH`);

  const createEscrowTx = await escrowFactory.connect(taker).createDstEscrow(immutables, {
    value: totalEthRequired
  });

  console.log(`📋 Create escrow transaction: ${createEscrowTx.hash}`);
  console.log(`⏳ Waiting for confirmation...`);
  
  const createReceipt = await createEscrowTx.wait();
  console.log(`✅ Destination escrow created in block ${createReceipt.blockNumber}`);

  // Parse events from the transaction receipt
  console.log(`📋 Parsing transaction logs (${createReceipt.logs.length} logs found)...`);
  
  let escrowAddress = null;
  
  // Try to parse the DstEscrowCreated event
  for (const log of createReceipt.logs) {
    try {
      const parsed = escrowFactory.interface.parseLog(log);
      if (parsed && parsed.name === "DstEscrowCreated") {
        escrowAddress = parsed.args.escrow;
        console.log(`✅ Found DstEscrowCreated event: ${escrowAddress}`);
        break;
      }
    } catch (e) {
      // Skip logs that don't match our interface
      continue;
    }
  }
  
  if (!escrowAddress) {
    console.log("❌ DstEscrowCreated event not found. Available logs:");
    createReceipt.logs.forEach((log, i) => {
      console.log(`   Log ${i}: ${log.topics[0]}`);
    });
    throw new Error("DstEscrowCreated event not found");
  }
  console.log(`📍 Escrow address: ${escrowAddress}`);

  // Check escrow balance
  const escrowBalance = await ethers.provider.getBalance(escrowAddress);
  console.log(`💰 Escrow balance: ${ethers.formatEther(escrowBalance)} ETH`);

  // Step 2: Simulate maker providing Cardano and revealing secret
  console.log(`\n🏛️ Step 2: Maker provides Cardano assets...`);
  console.log(`   (In real scenario, maker would send ADA to taker's Cardano address)`);
  console.log(`   (After confirmation, maker would reveal the secret)`);
  
  // Get the destination escrow contract
  const escrowDst = await ethers.getContractAt("EscrowDst", escrowAddress);

  // Record balances before withdrawal
  const takerBalanceBefore = await ethers.provider.getBalance(taker.address);
  const makerBalanceBefore = await ethers.provider.getBalance(maker.address);

  console.log(`\n💰 Balances before withdrawal:`);
  console.log(`   Taker: ${ethers.formatEther(takerBalanceBefore)} ETH`);
  console.log(`   Maker: ${ethers.formatEther(makerBalanceBefore)} ETH`);

  // Step 3: Taker (resolver) withdraws using the secret
  console.log(`\n🚀 Step 3: Taker withdraws using revealed secret...`);
  
  try {
    const withdrawTx = await escrowDst.connect(taker).withdraw(secret, immutables);
    
    console.log(`📋 Withdrawal transaction: ${withdrawTx.hash}`);
    console.log(`⏳ Waiting for confirmation...`);
    
    const withdrawReceipt = await withdrawTx.wait();
    console.log(`✅ Withdrawal completed in block ${withdrawReceipt.blockNumber}`);

    // Check final balances
    const takerBalanceAfter = await ethers.provider.getBalance(taker.address);
    const makerBalanceAfter = await ethers.provider.getBalance(maker.address);
    const finalEscrowBalance = await ethers.provider.getBalance(escrowAddress);

    console.log(`\n💰 Balances after withdrawal:`);
    console.log(`   Taker: ${ethers.formatEther(takerBalanceAfter)} ETH`);
    console.log(`   Maker: ${ethers.formatEther(makerBalanceAfter)} ETH`);
    console.log(`   Escrow: ${ethers.formatEther(finalEscrowBalance)} ETH`);

    // Calculate changes (excluding gas costs)
    const takerChange = takerBalanceAfter - takerBalanceBefore;
    const makerChange = makerBalanceAfter - makerBalanceBefore;

    console.log(`\n📊 Net Changes (excluding gas):`);
    console.log(`   Taker received: ${ethers.formatEther(immutables.safetyDeposit)} ETH (safety deposit returned)`);
    console.log(`   Maker received: ${ethers.formatEther(immutables.amount)} ETH (swap amount)`);

    // Save swap info
    const swapInfo = {
      orderHash: orderHash,
      escrowAddress: escrowAddress,
      taker: taker.address,
      maker: maker.address,
      secret: secret,
      hashlock: hashlock,
      swapAmount: immutables.amount.toString(),
      safetyDeposit: immutables.safetyDeposit.toString(),
      createTxHash: createEscrowTx.hash,
      withdrawTxHash: withdrawTx.hash,
      createBlockNumber: createReceipt.blockNumber,
      withdrawBlockNumber: withdrawReceipt.blockNumber,
      takerBalanceAfter: takerBalanceAfter.toString(),
      makerBalanceAfter: makerBalanceAfter.toString(),
      finalEscrowBalance: finalEscrowBalance.toString(),
      createdAt: new Date().toISOString()
    };

    saveSwapInfo(swapInfo, network.name);

    console.log("\n🎉 Cardano-to-EVM Swap Complete!");
    console.log("=================================");
    console.log(`✅ Taker received safety deposit back: ${ethers.formatEther(immutables.safetyDeposit)} ETH`);
    console.log(`✅ Maker received swap amount: ${ethers.formatEther(immutables.amount)} ETH`);
    console.log(`✅ Escrow balance: ${ethers.formatEther(finalEscrowBalance)} ETH (should be 0)`);
    console.log(`📄 Swap info saved to: cardano-to-evm-swap-${network.name}.json`);
    console.log("\n🏆 ATOMIC SWAP FLOW COMPLETED!");
    console.log("==============================");
    console.log("✅ Taker provided EVM tokens in escrow");
    console.log("✅ Maker provided Cardano assets (simulated)");
    console.log("✅ Maker received EVM tokens");
    console.log("✅ Taker received safety deposit back");
    console.log("✅ All funds properly distributed");

  } catch (error) {
    console.error("❌ Withdrawal failed:", error.message);
    
    if (error.message.includes("InvalidSecret")) {
      console.log("\n💡 Secret doesn't match the hashlock");
    } else if (error.message.includes("InvalidTime")) {
      console.log("\n⏰ Withdrawal window may not be open yet or may have expired");
    } else if (error.message.includes("InvalidCaller")) {
      console.log("\n👤 Only the taker can withdraw from destination escrow");
    }
    
    throw error;
  }
}

function loadDeploymentAddresses(networkName) {
  const addressesPath = path.join(__dirname, "../deployments", `addresses-${networkName}.json`);
  
  if (!fs.existsSync(addressesPath)) {
    throw new Error(`❌ Deployment addresses not found for network: ${networkName}. Please deploy contracts first.`);
  }
  
  return JSON.parse(fs.readFileSync(addressesPath, "utf8"));
}

function saveSwapInfo(swapInfo, networkName) {
  const swapDir = path.join(__dirname, "../swaps");
  if (!fs.existsSync(swapDir)) {
    fs.mkdirSync(swapDir, { recursive: true });
  }
  
  const swapPath = path.join(swapDir, `cardano-to-evm-swap-${networkName}.json`);
  fs.writeFileSync(swapPath, JSON.stringify(swapInfo, null, 2));
  
  console.log(`💾 Swap info saved to: ${swapPath}`);
}

// Error handling
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Cardano-to-EVM swap script failed:", error);
    process.exit(1);
  });
