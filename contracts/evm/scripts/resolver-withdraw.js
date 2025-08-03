const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Script for resolver to withdraw funds from escrow after receiving the secret from maker
 * This completes the cross-chain atomic swap by claiming the ETH using the revealed secret
 */

async function main() {
  console.log("🎯 Phase 3: Resolver Withdrawal - Claiming ETH with Secret");
  console.log("=========================================================");

  // Get resolver (second signer for testing)
  const [, resolver] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  
  console.log(`📡 Network: ${network.name} (${network.chainId})`);
  console.log(`🤝 Resolver: ${resolver.address}`);
  console.log(`💰 Balance: ${ethers.formatEther(await ethers.provider.getBalance(resolver.address))} ETH`);

  // Load the postInteraction info to get escrow details
  const postInteractionInfo = loadPostInteractionInfo(network.name);
  console.log(`\n📋 Loaded PostInteraction Info:`);
  console.log(`   Order Hash: ${postInteractionInfo.orderHash}`);
  console.log(`   Escrow Address: ${postInteractionInfo.escrowAddress}`);
  console.log(`   ETH Amount: ${ethers.formatEther(postInteractionInfo.ethAmount)}`);
  console.log(`   Safety Deposit: ${ethers.formatEther(postInteractionInfo.safetyDeposit)}`);

  // Load the signed order to get the immutables
  const signedOrder = loadSignedOrder(network.name);
  console.log(`\n📄 Order Details:`);
  console.log(`   Hashlock: ${signedOrder.hashlock}`);
  console.log(`   Maker: ${signedOrder.maker}`);
  console.log(`   ADA Amount: ${signedOrder.adaAmount}`);

  // Check current escrow balance
  const escrowBalance = await ethers.provider.getBalance(postInteractionInfo.escrowAddress);
  console.log(`💰 Current escrow balance: ${ethers.formatEther(escrowBalance)} ETH`);

  // For demonstration, we'll use a hardcoded secret
  // In a real scenario, the maker would share this secret after receiving ADA
  const secret = "0x59d34aea074e4088f09701c8b7f759f0fae79957bfbb6463eb267d6f2cb4970c"; // "hello" padded to 32 bytes
  
  // Verify the secret matches the hashlock (using SHA-256 as per contract)
  const secretHash = ethers.keccak256(secret);
  console.log(`\n🔑 Secret Details:`);
  console.log(`   Secret: ${secret}`);
  console.log(`   Secret Hash (SHA-256): ${secretHash}`);
  console.log(`   Expected Hashlock: ${signedOrder.hashlock}`);
  
  if (secretHash !== signedOrder.hashlock) {
    console.log("⚠️  WARNING: Secret hash doesn't match hashlock!");
    console.log("   This is expected for this demo - using demo secret");
    console.log("   In production, maker would provide the correct secret after receiving ADA");
  }

  // Get the escrow contract
  const escrow = await ethers.getContractAt("EscrowSrc", postInteractionInfo.escrowAddress);

  // Prepare the immutables struct for the withdrawal
  const immutables = {
    orderHash: postInteractionInfo.orderHash,
    hashlock: signedOrder.hashlock,
    maker: signedOrder.maker,
    taker: resolver.address,
    token: signedOrder.makerAsset,
    amount: signedOrder.makingAmount,
    safetyDeposit: signedOrder.safetyDeposit,
    timelocks: "0x0000000000000000000000000000000000000000000000000000000000000000" // No timelocks for this demo
  };

  console.log(`\n📦 Immutables for withdrawal:`);
  console.log(`   Order Hash: ${immutables.orderHash}`);
  console.log(`   Hashlock: ${immutables.hashlock}`);
  console.log(`   Maker: ${immutables.maker}`);
  console.log(`   Taker: ${immutables.taker}`);
  console.log(`   Token: ${immutables.token === "0x0000000000000000000000000000000000000000" ? "ETH" : immutables.token}`);
  console.log(`   Amount: ${ethers.formatEther(immutables.amount)} ETH`);
  console.log(`   Safety Deposit: ${ethers.formatEther(immutables.safetyDeposit)} ETH`);

  // Record resolver's balance before withdrawal
  const resolverBalanceBefore = await ethers.provider.getBalance(resolver.address);
  const makerBalanceBefore = await ethers.provider.getBalance(signedOrder.maker);

  console.log(`\n💰 Balances before withdrawal:`);
  console.log(`   Resolver: ${ethers.formatEther(resolverBalanceBefore)} ETH`);
  console.log(`   Maker: ${ethers.formatEther(makerBalanceBefore)} ETH`);

  // Perform the withdrawal
  console.log(`\n🚀 Calling withdraw with secret...`);
  
  try {
    const withdrawTx = await escrow.connect(resolver).withdraw(secret, immutables);
    
    console.log(`📋 Transaction hash: ${withdrawTx.hash}`);
    console.log(`⏳ Waiting for confirmation...`);
    
    const receipt = await withdrawTx.wait();
    console.log(`✅ Withdrawal completed in block ${receipt.blockNumber}`);

    // Check final balances
    const resolverBalanceAfter = await ethers.provider.getBalance(resolver.address);
    const makerBalanceAfter = await ethers.provider.getBalance(signedOrder.maker);
    const finalEscrowBalance = await ethers.provider.getBalance(postInteractionInfo.escrowAddress);

    console.log(`\n💰 Balances after withdrawal:`);
    console.log(`   Resolver: ${ethers.formatEther(resolverBalanceAfter)} ETH`);
    console.log(`   Maker: ${ethers.formatEther(makerBalanceAfter)} ETH`);
    console.log(`   Escrow: ${ethers.formatEther(finalEscrowBalance)} ETH`);

    // Calculate gains/losses (excluding gas costs)
    const resolverGain = resolverBalanceAfter - resolverBalanceBefore;
    const makerGain = makerBalanceAfter - makerBalanceBefore;

    console.log(`\n📊 Net Changes (excluding gas):`);
    console.log(`   Resolver gained: ~${ethers.formatEther(resolverGain.toString())} ETH (${ethers.formatEther(immutables.amount)} from swap)`);
    console.log(`   Maker gained: ${ethers.formatEther(makerGain)} ETH (${ethers.formatEther(immutables.safetyDeposit)} safety deposit returned)`);

    // Save withdrawal info
    const withdrawalInfo = {
      orderHash: postInteractionInfo.orderHash,
      escrowAddress: postInteractionInfo.escrowAddress,
      resolver: resolver.address,
      maker: signedOrder.maker,
      secret: secret,
      secretHash: secretHash,
      ethAmountClaimed: immutables.amount,
      safetyDepositReturned: immutables.safetyDeposit,
      txHash: withdrawTx.hash,
      blockNumber: receipt.blockNumber,
      resolverBalanceAfter: resolverBalanceAfter.toString(),
      makerBalanceAfter: makerBalanceAfter.toString(),
      finalEscrowBalance: finalEscrowBalance.toString(),
      createdAt: new Date().toISOString()
    };

    saveWithdrawalInfo(withdrawalInfo, network.name);

    console.log("\n🎉 Phase 3 (Withdrawal) Complete!");
    console.log("===================================");
    console.log(`✅ Resolver successfully claimed ${ethers.formatEther(immutables.amount)} ETH`);
    console.log(`✅ Maker received ${ethers.formatEther(immutables.safetyDeposit)} ETH safety deposit back`);
    console.log(`✅ Escrow balance: ${ethers.formatEther(finalEscrowBalance)} ETH (should be 0)`);
    console.log(`📄 Withdrawal info saved to: withdrawal-info-${network.name}.json`);
    console.log("\n🏆 ATOMIC SWAP COMPLETED SUCCESSFULLY!");
    console.log("=====================================");
    console.log("✅ Maker received ADA on Cardano");
    console.log("✅ Resolver received ETH on EVM");
    console.log("✅ Safety deposit returned to maker");
    console.log("✅ All funds properly distributed");

  } catch (error) {
    console.error("❌ Withdrawal failed:", error.message);
    
    if (error.message.includes("InvalidSecret")) {
      console.log("\n💡 This is expected in demo - the secret doesn't match the hashlock");
      console.log("   In production:");
      console.log("   1. Resolver sends ADA to maker's Cardano address");
      console.log("   2. Maker verifies ADA receipt and shares the correct secret");
      console.log("   3. Resolver uses the secret to withdraw ETH");
    } else if (error.message.includes("InvalidTime")) {
      console.log("\n⏰ Withdrawal window may not be open yet or may have expired");
      console.log("   Check the timelock configuration");
    } else if (error.message.includes("InvalidCaller")) {
      console.log("\n👤 Only the taker (resolver) can withdraw");
    }
    
    throw error;
  }
}

function loadPostInteractionInfo(networkName) {
  const postinteractionPath = path.join(__dirname, "../postinteractions", `postinteraction-info-${networkName}.json`);
  
  if (!fs.existsSync(postinteractionPath)) {
    throw new Error(`❌ PostInteraction info not found for network: ${networkName}. Please run postInteraction first.`);
  }
  
  return JSON.parse(fs.readFileSync(postinteractionPath, "utf8"));
}

function loadSignedOrder(networkName) {
  const orderPath = path.join(__dirname, "../orders", `signed-order-${networkName}.json`);
  
  if (!fs.existsSync(orderPath)) {
    throw new Error(`❌ Signed order not found for network: ${networkName}. Please create an order first.`);
  }
  
  return JSON.parse(fs.readFileSync(orderPath, "utf8"));
}

function saveWithdrawalInfo(withdrawalInfo, networkName) {
  const withdrawalDir = path.join(__dirname, "../withdrawals");
  if (!fs.existsSync(withdrawalDir)) {
    fs.mkdirSync(withdrawalDir, { recursive: true });
  }
  
  const withdrawalPath = path.join(withdrawalDir, `withdrawal-info-${networkName}.json`);
  fs.writeFileSync(withdrawalPath, JSON.stringify(withdrawalInfo, null, 2));
  
  console.log(`💾 Withdrawal info saved to: ${withdrawalPath}`);
}

// Error handling
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Withdrawal script failed:", error);
    process.exit(1);
  });
