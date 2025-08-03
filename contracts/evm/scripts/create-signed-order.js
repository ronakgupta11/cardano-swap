const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Script for maker to create and sign an order for ETH → Cardano ADA swap
 * The maker specifies the swap parameters and signs the order
 * For ETH swaps, no token approval is needed as ETH is sent directly
 */

async function main() {
  console.log("📝 Creating Signed Order for Token → Cardano ADA Swap");
  console.log("====================================================");

  // Get maker (the person who wants to swap tokens for ADA)
  const [maker] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  
  console.log(`📡 Network: ${network.name} (${network.chainId})`);
  console.log(`👤 Maker: ${maker.address}`);
  console.log(`💰 Balance: ${ethers.formatEther(await ethers.provider.getBalance(maker.address))} ETH`);

  // Load deployment addresses
  const addresses = loadDeploymentAddresses(network.name);
  console.log(`🏭 Factory: ${addresses.cardanoEscrowFactory}`);
  console.log(`🔧 Limit Order Protocol: ${addresses.limitOrderProtocol}`);
  console.log(`🪙 Access Token: ${addresses.accessToken}`);

  // Get swap parameters from user or use defaults
  const swapParams = getSwapParameters(addresses);
  console.log("\n📋 Swap Parameters:");
  console.log(`   ETH Amount: ${ethers.formatEther(swapParams.makingAmount)}`);
  console.log(`   Token Address: ${swapParams.makerAsset} (ETH)`);
  console.log(`   ADA Amount: ${swapParams.adaAmount} ADA`);
  console.log(`   Cardano Address: ${swapParams.cardanoAddress}`);
  console.log(`   Resolver: ${swapParams.receiver}`);
  console.log(`   Safety Deposit: ${ethers.formatEther(swapParams.safetyDeposit)} ETH`);

  // Check if this is an ETH or ERC20 token swap
  const isEthSwap = swapParams.makerAsset === "0x0000000000000000000000000000000000000000";
  
  if (isEthSwap) {
    // For ETH swaps, no token approval is needed since ETH is sent directly
    console.log(`\n💡 ETH swap detected - no token approval needed`);
    console.log(`   Maker will send ETH directly when resolver fills the order`);
  } else {
    // For ERC20 token swaps, approve the Limit Order Protocol to spend maker's tokens
    console.log(`\n💳 ERC20 token swap detected - approving token spending...`);
    await approveTokenSpending(maker, swapParams.makerAsset, addresses.limitOrderProtocol, BigInt(swapParams.makingAmount));
  }

  // Generate secret and hashlock
  const secret = ethers.randomBytes(32);
  const hashlock = ethers.keccak256(secret);
  
  console.log(`\n🔐 Generated secret: ${ethers.hexlify(secret)}`);
  console.log(`🔒 Hashlock: ${hashlock}`);

  // Create the order data structure matching IAtomicSwapLOP.Order
  const order = {
    maker: maker.address,
    makerAsset: swapParams.makerAsset,
    takerAsset: "0x0000000000000000000000000000000000000000", // ETH address for safety deposit
    makingAmount: BigInt(swapParams.makingAmount),
    takingAmount: BigInt(swapParams.safetyDeposit), // Safety deposit amount in ETH
    receiver: swapParams.receiver, // Cardano address as receiver field
    hashlock: hashlock,
    salt: swapParams.salt
  };

  // Create additional metadata for the order
  const orderMetadata = {
    adaAmount: swapParams.adaAmount,
    cardanoAddress: swapParams.cardanoAddress,
    safetyDeposit: swapParams.safetyDeposit,
    deadline: swapParams.deadline,
    createdAt: new Date().toISOString()
  };

  // Create order hash for EIP-712 signing
  const orderHash = await createOrderHash(order);
  console.log(`📋 Order hash: ${orderHash}`);

  // Combine order with metadata for final signed order
  const signedOrderData = {
    ...order,
    ...orderMetadata,
    orderHash: orderHash
  };

  // Sign the order
  console.log("\n✍️  Signing order...");
  const signature = await signOrder(maker, signedOrderData);
  
  const signedOrder = {
    ...signedOrderData,
    signature: signature
  };

  // Save the signed order
  saveSignedOrder(signedOrder, network.name);
  
  // Save the secret separately (maker keeps this safe)
  saveSecret(secret, orderHash, network.name);

  console.log("\n🎉 Signed Order Created Successfully!");
  console.log("====================================");
  console.log(`📄 Order file: signed-order-${network.name}.json`);
  console.log(`🔐 Secret file: secret-${orderHash.slice(0, 8)}-${network.name}.json`);
  console.log("\n⚠️  IMPORTANT - Two-Phase ETH Swap Process:");
  console.log("   1. ✅ Signed order created successfully");
  console.log("   2. 📤 Next: Call preInteraction() with ETH to validate your order");
  console.log("   3. 🤝 Share the signed-order file with the resolver");
  console.log("   4. 🔒 Keep the secret file PRIVATE until ADA is received on Cardano");
  console.log("   5. 🏆 Resolver calls postInteraction() to complete the swap");
  console.log("\n💡 New Flow: preInteraction (maker) → postInteraction (resolver)!");
}

function loadDeploymentAddresses(networkName) {
  const addressesPath = path.join(__dirname, "../deployments", `addresses-${networkName}.json`);
  
  if (!fs.existsSync(addressesPath)) {
    throw new Error(`❌ Deployment addresses not found for network: ${networkName}. Please deploy first.`);
  }
  
  return JSON.parse(fs.readFileSync(addressesPath, "utf8"));
}

function getSwapParameters(addresses) {
  // These could be passed as command line arguments or loaded from a config file
  // For now, using defaults that can be modified
  
  const configPath = path.join(__dirname, "../swap-config.json");
  
  if (fs.existsSync(configPath)) {
    console.log("📋 Loading swap parameters from config...");
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  }
  
  // Default parameters for ETH → ADA swap
  const defaultParams = {
    makerAsset: "0x0000000000000000000000000000000000000000", // ETH (zero address)
    makingAmount: ethers.parseEther("0.001").toString(), // 0.001 ETH (convert to string)
    adaAmount: "100", // 100 ADA
    cardanoAddress: "addr1qxy2l9e7cr3a6jj4vkt5w2r87q0q0k7jk0xj2r3c9e6vp7z8s2v6p9h4k3j2l1m0n9o8p7q6r5s4t3u2v1w0x9y8z7a6b5c4d3e2f1",
    receiver: "0x0000000000000000000000000000000000000000", // Will be filled by resolver
    safetyDeposit: ethers.parseEther("0.0001").toString(), // 0.0001 ETH safety deposit (convert to string)
    salt: Math.floor(Math.random() * 1000000),
    deadline: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
  };
  
  // Save default config for future use
  fs.writeFileSync(configPath, JSON.stringify(defaultParams, null, 2));
  console.log(`💾 Default swap config saved to: ${configPath}`);
  console.log("📝 Please edit this file to customize your swap parameters");
  
  return defaultParams;
}

async function createOrderHash(order) {
  // Get the network to determine the correct chain ID
  const network = await ethers.provider.getNetwork();
  
  // Load deployment addresses to get the LOP contract address
  const addresses = loadDeploymentAddresses(network.name);
  
  // Load the limit order config to get the correct domain parameters
  const limitOrderConfig = JSON.parse(fs.readFileSync(path.join(__dirname, "../limit-order-config.json"), "utf8"));
  
  // Create EIP-712 domain matching the InteractionManager contract
  const domain = {
    name: limitOrderConfig.name,
    version: limitOrderConfig.version,
    chainId: network.chainId,
    verifyingContract: addresses.limitOrderProtocol
  };

  // Define the Order type structure matching the contract
  const types = {
    Order: [
      { name: "maker", type: "address" },
      { name: "makerAsset", type: "address" },
      { name: "takerAsset", type: "address" },
      { name: "makingAmount", type: "uint256" },
      { name: "takingAmount", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "hashlock", type: "bytes32" },
      { name: "salt", type: "uint256" }
    ]
  };

  // Create the order value object
  const orderValue = {
    maker: order.maker,
    makerAsset: order.makerAsset,
    takerAsset: order.takerAsset,
    makingAmount: order.makingAmount,
    takingAmount: order.takingAmount,
    receiver: order.receiver,
    hashlock: order.hashlock,
    salt: order.salt
  };

  // Calculate the EIP-712 hash
  const orderHash = ethers.TypedDataEncoder.hash(domain, types, orderValue);
  return orderHash;
}

async function approveTokenSpending(maker, tokenAddress, spenderAddress, amount) {
  console.log(`   Token: ${tokenAddress}`);
  console.log(`   Spender: ${spenderAddress}`);
  console.log(`   Amount: ${ethers.formatEther(amount)}`);

  // Get token contract using IERC20 interface
  const tokenContract = await ethers.getContractAt("IERC20", tokenAddress);
  
  // Check current allowance
  const currentAllowance = await tokenContract.allowance(maker.address, spenderAddress);
  console.log(`   Current allowance: ${ethers.formatEther(currentAllowance)}`);
  
  if (currentAllowance >= amount) {
    console.log(`✅ Sufficient allowance already exists`);
    return;
  }
  
  // Check maker's token balance
  const balance = await tokenContract.balanceOf(maker.address);
  console.log(`   Maker balance: ${ethers.formatEther(balance)}`);
  
  if (balance < amount) {
    throw new Error(`❌ Insufficient token balance. Need ${ethers.formatEther(amount)}, have ${ethers.formatEther(balance)}`);
  }
  
  // Approve spending
  console.log(`🔄 Sending approval transaction...`);
  const approveTx = await tokenContract.connect(maker).approve(spenderAddress, amount);
  console.log(`📋 Approval tx hash: ${approveTx.hash}`);
  
  const receipt = await approveTx.wait();
  console.log(`✅ Approval confirmed in block ${receipt.blockNumber}`);
}

async function signOrder(maker, orderData) {
  console.log(`\n✍️  Signing order with EIP-712...`);
  
  // Get the network to determine the correct chain ID
  const network = await ethers.provider.getNetwork();
  
  // Load deployment addresses to get the LOP contract address
  const addresses = loadDeploymentAddresses(network.name);
  
  // Load the limit order config to get the correct domain parameters
  const limitOrderConfig = JSON.parse(fs.readFileSync(path.join(__dirname, "../limit-order-config.json"), "utf8"));
  
  // Create EIP-712 domain matching the InteractionManager contract
  const domain = {
    name: limitOrderConfig.name,
    version: limitOrderConfig.version,
    chainId: network.chainId,
    verifyingContract: addresses.limitOrderProtocol
  };

  // Define the Order type structure matching the contract
  const types = {
    Order: [
      { name: "maker", type: "address" },
      { name: "makerAsset", type: "address" },
      { name: "takerAsset", type: "address" },
      { name: "makingAmount", type: "uint256" },
      { name: "takingAmount", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "hashlock", type: "bytes32" },
      { name: "salt", type: "uint256" }
    ]
  };

  // Create the order value object
  const orderValue = {
    maker: orderData.maker,
    makerAsset: orderData.makerAsset,
    takerAsset: orderData.takerAsset,
    makingAmount: orderData.makingAmount,
    takingAmount: orderData.takingAmount,
    receiver: orderData.receiver,
    hashlock: orderData.hashlock,
    salt: orderData.salt
  };

  // Sign using EIP-712
  const signature = await maker.signTypedData(domain, types, orderValue);
  console.log(`✅ Order signed: ${signature.slice(0, 20)}...`);
  
  return signature;
}

function saveSignedOrder(signedOrder, networkName) {
  const ordersDir = path.join(__dirname, "../orders");
  if (!fs.existsSync(ordersDir)) {
    fs.mkdirSync(ordersDir, { recursive: true });
  }
  
  // Convert BigInt values to strings for JSON serialization
  const serializedOrder = {
    ...signedOrder,
    makingAmount: signedOrder.makingAmount.toString(),
    takingAmount: signedOrder.takingAmount.toString()
  };
  
  const orderPath = path.join(ordersDir, `signed-order-${networkName}.json`);
  fs.writeFileSync(orderPath, JSON.stringify(serializedOrder, null, 2));
  
  console.log(`💾 Signed order saved to: ${orderPath}`);
}

function saveSecret(secret, orderHash, networkName) {
  const secretsDir = path.join(__dirname, "../secrets");
  if (!fs.existsSync(secretsDir)) {
    fs.mkdirSync(secretsDir, { recursive: true });
  }
  
  const secretData = {
    secret: ethers.hexlify(secret),
    orderHash: orderHash,
    createdAt: new Date().toISOString(),
    warning: "Keep this secret safe! Do not share until ADA is received on Cardano"
  };
  
  const secretPath = path.join(secretsDir, `secret-${orderHash.slice(0, 8)}-${networkName}.json`);
  fs.writeFileSync(secretPath, JSON.stringify(secretData, null, 2));
  
  console.log(`🔐 Secret saved to: ${secretPath}`);
}

// Error handling
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Order creation failed:", error);
    process.exit(1);
  });
