const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Script for resolver to call postInteraction - Phase 2 of the two-phase swap process
 * This transfers funds from LOP to escrow and completes the swap setup
 */

async function main() {
  console.log("🏆 Phase 2: Resolver PostInteraction - ETH → Cardano ADA Swap");
  console.log("==============================================================");

  // Get resolver (second signer for testing)
  const [, resolver] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  
  console.log(`📡 Network: ${network.name} (${network.chainId})`);
  console.log(`🤝 Resolver: ${resolver.address}`);
  console.log(`💰 Balance: ${ethers.formatEther(await ethers.provider.getBalance(resolver.address))} ETH`);

  // Load deployment addresses
  const addresses = loadDeploymentAddresses(network.name);
  console.log(`🔧 Limit Order Protocol: ${addresses.limitOrderProtocol}`);
  console.log(`🏭 Escrow Factory: ${addresses.cardanoEscrowFactory}`);

  // Load the signed order
  const signedOrder = loadSignedOrder(network.name);
  console.log(`\n📋 Loaded Order:`);
  console.log(`   Order Hash: ${signedOrder.orderHash}`);
  console.log(`   ETH Amount: ${ethers.formatEther(signedOrder.makingAmount)}`);
  console.log(`   Safety Deposit: ${ethers.formatEther(signedOrder.safetyDeposit)}`);
  console.log(`   ADA Amount: ${signedOrder.adaAmount}`);

  // Check if preInteraction was completed - Skip validation check due to interface issue
  const lop = await ethers.getContractAt("LimitOrderProtocol", addresses.limitOrderProtocol);
  const orderHash = signedOrder.orderHash;
  
  // Since we can't read validatedOrders due to interface issue, we'll assume it's validated
  // and let the postInteraction function handle the validation
  console.log(`📝 Skipping validation check - postInteraction will verify order state`);

  // Check LOP contract balance
  const lopBalance = await ethers.provider.getBalance(addresses.limitOrderProtocol);
  console.log(`💰 LOP contract balance: ${ethers.formatEther(lopBalance)} ETH`);

  // Safety deposit amount (this would be pre-funded by resolver to escrow address)
  const safetyDeposit = BigInt(signedOrder.safetyDeposit);
  
  // Calculate escrow address that will be created
  const factory = await ethers.getContractAt("EscrowFactory", addresses.cardanoEscrowFactory);
  
  // Create immutables for address calculation - matches postInteraction exactly
  const immutables = {
    orderHash: orderHash,
    hashlock: signedOrder.hashlock,
    maker: signedOrder.maker,
    taker: resolver.address, // Resolver becomes the taker
    token: signedOrder.makerAsset,
    amount: signedOrder.makingAmount,
    safetyDeposit: signedOrder.safetyDeposit,
    timelocks: "0x0000000000000000000000000000000000000000000000000000000000000000"
  };

  const escrowAddress = await factory.addressOfEscrowSrc(immutables);
  console.log(`🏠 Calculated escrow address: ${escrowAddress}`);

  // The prefunding logic:
  // - For ETH swaps: Resolver pre-funds ONLY the safety deposit
  //   The LOP will send the making amount during postInteraction
  // - For ERC20 swaps: Resolver pre-funds ONLY the safety deposit
  //   The maker's tokens are transferred separately
  const prefundAmount = BigInt(signedOrder.safetyDeposit);

  // Resolver needs to pre-fund safety deposit to escrow address
  console.log(`\n💰 Pre-funding safety deposit to escrow...`);
  console.log(`   Safety Deposit: ${ethers.formatEther(signedOrder.safetyDeposit)} ETH`);
  
  const fundTx = await resolver.sendTransaction({
    to: escrowAddress,
    value: prefundAmount
  });
  
  console.log(`📋 Funding tx hash: ${fundTx.hash}`);
  await fundTx.wait();
  
  const escrowBalance = await ethers.provider.getBalance(escrowAddress);
  console.log(`✅ Escrow pre-funded with ${ethers.formatEther(escrowBalance)} ETH safety deposit`);

  // Call postInteraction
  console.log(`\n🚀 Calling postInteraction...`);
  const postInteractionTx = await lop.connect(resolver).postInteraction(
    orderHash,
    addresses.cardanoEscrowFactory,
    safetyDeposit
  );
  
  console.log(`📋 Transaction hash: ${postInteractionTx.hash}`);
  console.log(`⏳ Waiting for confirmation...`);
  
  const receipt = await postInteractionTx.wait();
  console.log(`✅ PostInteraction completed in block ${receipt.blockNumber}`);

  // Check if order was filled - Skip validation check due to interface issue
  console.log(`📝 PostInteraction completed - order should be removed from validation mapping`);

  // Check final escrow balance
  const finalEscrowBalance = await ethers.provider.getBalance(escrowAddress);
  console.log(`💰 Final escrow balance: ${ethers.formatEther(finalEscrowBalance)} ETH`);

  // Save the postInteraction info
  const postInteractionInfo = {
    orderHash: orderHash,
    escrowAddress: escrowAddress,
    resolver: resolver.address,
    ethAmount: signedOrder.makingAmount,
    safetyDeposit: signedOrder.safetyDeposit,
    txHash: postInteractionTx.hash,
    blockNumber: receipt.blockNumber,
    finalEscrowBalance: finalEscrowBalance.toString(),
    createdAt: new Date().toISOString()
  };

  savePostInteractionInfo(postInteractionInfo, network.name);

  console.log("\n🎉 Phase 2 (PostInteraction) Complete!");
  console.log("======================================");
  console.log(`🏠 Escrow Address: ${escrowAddress}`);
  console.log(`💰 Total Escrow Balance: ${ethers.formatEther(finalEscrowBalance)} ETH`);
  console.log(`   - Swap Amount: ${ethers.formatEther(signedOrder.makingAmount)} ETH`);
  console.log(`   - Safety Deposit: ${ethers.formatEther(signedOrder.safetyDeposit)} ETH`);
  console.log(`📄 PostInteraction info saved to: postinteraction-info-${network.name}.json`);
  console.log("\n⏭️  NEXT STEPS:");
  console.log("   🟢 Escrow is now active and ready for Cardano side");
  console.log("   📤 Resolver can now send ADA to maker's Cardano address");
  console.log("   🔑 Maker reveals secret once ADA is received");
  console.log("   🎯 Resolver uses secret to claim ETH from escrow");
}

function loadDeploymentAddresses(networkName) {
  const addressesPath = path.join(__dirname, "../deployments", `addresses-${networkName}.json`);
  
  if (!fs.existsSync(addressesPath)) {
    throw new Error(`❌ Deployment addresses not found for network: ${networkName}. Please deploy first.`);
  }
  
  return JSON.parse(fs.readFileSync(addressesPath, "utf8"));
}

function loadSignedOrder(networkName) {
  const orderPath = path.join(__dirname, "../orders", `signed-order-${networkName}.json`);
  
  if (!fs.existsSync(orderPath)) {
    throw new Error(`❌ Signed order not found for network: ${networkName}. Please create an order first.`);
  }
  
  return JSON.parse(fs.readFileSync(orderPath, "utf8"));
}

function savePostInteractionInfo(postInteractionInfo, networkName) {
  const postinteractionDir = path.join(__dirname, "../postinteractions");
  if (!fs.existsSync(postinteractionDir)) {
    fs.mkdirSync(postinteractionDir, { recursive: true });
  }
  
  const postinteractionPath = path.join(postinteractionDir, `postinteraction-info-${networkName}.json`);
  fs.writeFileSync(postinteractionPath, JSON.stringify(postInteractionInfo, null, 2));
  
  console.log(`💾 PostInteraction info saved to: ${postinteractionPath}`);
}

// Error handling
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ PostInteraction failed:", error);
    process.exit(1);
  });
