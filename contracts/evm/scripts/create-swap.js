const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Script for resolver to create a swap using the maker's signed order
 * Resolver pays safety deposit + gas fees and calls createSrcEscrow
 */

async function main() {
  console.log("🔄 Creating ETH → Cardano ADA Swap");
  console.log("=================================");

  // Get resolver (the person facilitating the swap)
  const [resolver] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  
  console.log(`📡 Network: ${network.name} (${network.chainId})`);
  console.log(`👤 Resolver: ${resolver.address}`);
  console.log(`💰 Balance: ${ethers.formatEther(await ethers.provider.getBalance(resolver.address))} ETH`);

  // Load deployment addresses
  const addresses = loadDeploymentAddresses(network.name);
  console.log(`🏭 Factory: ${addresses.cardanoEscrowFactory}`);

  // Load signed order from maker
  const signedOrder = loadSignedOrder(network.name);
  console.log(`\n📋 Processing order from maker: ${signedOrder.maker}`);
  console.log(`💱 Swap: ${ethers.formatEther(signedOrder.ethAmount)} ETH → ${signedOrder.adaAmount} ADA`);
  console.log(`🏦 Safety Deposit: ${ethers.formatEther(signedOrder.safetyDeposit)} ETH`);
  console.log(`📍 Cardano Address: ${signedOrder.cardanoAddress}`);

  // Update resolver address in the order (if not set)
  if (signedOrder.resolver === "0x0000000000000000000000000000000000000000") {
    signedOrder.resolver = resolver.address;
    console.log(`🔄 Updated resolver to: ${resolver.address}`);
  } else if (signedOrder.resolver.toLowerCase() !== resolver.address.toLowerCase()) {
    throw new Error(`❌ This order is designated for resolver: ${signedOrder.resolver}`);
  }

  // Verify order signature
  console.log("\n🔐 Verifying maker signature...");
  const isValidSignature = await verifyOrderSignature(signedOrder);
  if (!isValidSignature) {
    throw new Error("❌ Invalid signature from maker");
  }
  console.log("✅ Signature verified");

  // Check order deadline
  if (signedOrder.deadline < Math.floor(Date.now() / 1000)) {
    throw new Error("❌ Order has expired");
  }

  // Get factory contract
  const factory = await ethers.getContractAt("EscrowFactory", addresses.cardanoEscrowFactory);

  // Check maker's ETH balance
  console.log("\n� Checking maker's ETH balance...");
  const makerBalance = await ethers.provider.getBalance(signedOrder.maker);
  console.log(`   Maker Balance: ${ethers.formatEther(makerBalance)} ETH`);
  
  if (makerBalance < BigInt(signedOrder.ethAmount)) {
    throw new Error("❌ Insufficient maker ETH balance");
  }

  // Prepare escrow immutables
  const immutables = {
    orderHash: signedOrder.orderHash,
    hashlock: signedOrder.hashlock,
    maker: { // Address struct
      addr: signedOrder.maker,
      chainId: network.chainId
    },
    taker: { // Address struct - resolver acts as taker
      addr: resolver.address,
      chainId: network.chainId
    },
    token: { // Address struct - ETH (zero address)
      addr: "0x0000000000000000000000000000000000000000",
      chainId: network.chainId
    },
    amount: signedOrder.ethAmount,
    safetyDeposit: signedOrder.safetyDeposit,
    timelocks: signedOrder.timelocks
  };

  console.log("\n📋 Escrow Parameters:");
  console.log(`   Order Hash: ${immutables.orderHash}`);
  console.log(`   Hashlock: ${immutables.hashlock}`);
  console.log(`   Maker: ${immutables.maker.addr}`);
  console.log(`   Taker (Resolver): ${immutables.taker.addr}`);
  console.log(`   Token: ETH (${immutables.token.addr})`);
  console.log(`   Amount: ${ethers.formatEther(immutables.amount)} ETH`);
  console.log(`   Safety Deposit: ${ethers.formatEther(immutables.safetyDeposit)} ETH`);

  // Calculate total ETH needed (amount + safety deposit)
  const totalEthNeeded = BigInt(signedOrder.ethAmount) + BigInt(signedOrder.safetyDeposit);
  console.log(`\n💰 Total ETH needed: ${ethers.formatEther(totalEthNeeded)} ETH`);

  // Check resolver balance for safety deposit
  const resolverBalance = await ethers.provider.getBalance(resolver.address);
  const estimatedGas = ethers.parseEther("0.01"); // Estimate 0.01 ETH for gas
  const requiredBalance = BigInt(signedOrder.safetyDeposit) + estimatedGas;
  
  if (resolverBalance < requiredBalance) {
    throw new Error(`❌ Insufficient resolver balance. Need ${ethers.formatEther(requiredBalance)} ETH for safety deposit + gas`);
  }

  // Get predicted escrow address
  const escrowAddress = await factory.addressOfEscrowSrc(immutables);
  console.log(`📍 Predicted escrow address: ${escrowAddress}`);

  // Create the swap
  console.log("\n🚀 Creating source escrow...");
  const tx = await factory.connect(resolver).createSrcEscrow(
    immutables,
    {
      value: totalEthNeeded, // ETH amount + safety deposit
      gasLimit: 2000000 // Set appropriate gas limit
    }
  );

  console.log(`📝 Transaction hash: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`✅ Transaction confirmed in block: ${receipt.blockNumber}`);
  console.log(`⛽ Gas used: ${receipt.gasUsed.toString()}`);

  // Parse events to get swap details
  let actualEscrowAddress = null;
  for (const log of receipt.logs) {
    try {
      const parsed = factory.interface.parseLog(log);
      if (parsed.name === 'SrcEscrowCreated') {
        actualEscrowAddress = parsed.args.escrow;
        console.log(`🆔 Escrow created: ${actualEscrowAddress}`);
        break;
      }
    } catch (e) {
      // Ignore parsing errors for other events
    }
  }

  if (!actualEscrowAddress) {
    actualEscrowAddress = escrowAddress; // Use predicted address
  }

  // Save swap info for later withdrawal
  const swapInfo = {
    orderHash: signedOrder.orderHash,
    escrowAddress: actualEscrowAddress,
    maker: signedOrder.maker,
    resolver: resolver.address,
    ethAmount: signedOrder.ethAmount,
    adaAmount: signedOrder.adaAmount,
    cardanoAddress: signedOrder.cardanoAddress,
    safetyDeposit: signedOrder.safetyDeposit,
    hashlock: signedOrder.hashlock,
    timelocks: signedOrder.timelocks,
    createdAt: new Date().toISOString(),
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
    status: "active",
    network: network.name,
    chainId: network.chainId
  };
  
  saveSwapInfo(swapInfo, network.name);

  console.log("\n🎉 Swap Created Successfully!");
  console.log("=============================");
  console.log(`📍 Escrow Address: ${actualEscrowAddress}`);
  console.log(`💰 ${ethers.formatEther(signedOrder.ethAmount)} ETH locked in escrow`);
  console.log(`🔒 Safety deposit: ${ethers.formatEther(signedOrder.safetyDeposit)} ETH`);
  console.log("\n📋 Next Steps:");
  console.log("1. Maker should now send ADA to Cardano HTLC");
  console.log("2. Once ADA transfer is complete, maker reveals the secret");
  console.log("3. Resolver can then withdraw ETH using the secret");
  console.log(`\n📄 Swap info saved for withdrawal: swap-${signedOrder.orderHash.slice(0, 8)}-${network.name}.json`);
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
    throw new Error(`❌ No signed order found at: ${orderPath}. Please create a signed order first.`);
  }
  
  return JSON.parse(fs.readFileSync(orderPath, "utf8"));
}

async function verifyOrderSignature(signedOrder) {
  try {
    // Recreate the message hash that was signed
    const messageHash = ethers.keccak256(
      ethers.solidityPacked(
        ["bytes32", "address", "address", "uint256", "string", "string", "uint256", "bytes32", "uint256", "uint256", "uint256"],
        [
          signedOrder.orderHash,
          signedOrder.maker,
          signedOrder.resolver,
          signedOrder.ethAmount,
          signedOrder.adaAmount,
          signedOrder.cardanoAddress,
          signedOrder.safetyDeposit,
          signedOrder.hashlock,
          signedOrder.timelocks,
          signedOrder.nonce,
          signedOrder.deadline
        ]
      )
    );
    
    // Verify signature
    const recoveredAddress = ethers.verifyMessage(ethers.getBytes(messageHash), signedOrder.signature);
    return recoveredAddress.toLowerCase() === signedOrder.maker.toLowerCase();
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
}

function saveSwapInfo(swapInfo, networkName) {
  const swapsDir = path.join(__dirname, "../swaps");
  if (!fs.existsSync(swapsDir)) {
    fs.mkdirSync(swapsDir, { recursive: true });
  }
  
  const swapPath = path.join(swapsDir, `swap-${swapInfo.orderHash.slice(0, 8)}-${networkName}.json`);
  fs.writeFileSync(swapPath, JSON.stringify(swapInfo, null, 2));
  
  console.log(`💾 Swap info saved to: ${swapPath}`);
}

// Error handling
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Swap creation failed:", error);
    process.exit(1);
  });