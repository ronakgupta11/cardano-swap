const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Script to demonstrate secret generation and sharing mechanism
 * In production, this would be done by the maker after receiving ADA on Cardano
 */

async function main() {
  console.log("🔐 Secret Generation and Sharing Demo");
  console.log("====================================");

  const network = await ethers.provider.getNetwork();
  
  // Load the signed order to see the hashlock
  const signedOrder = loadSignedOrder(network.name);
  console.log(`\n📄 Order Details:`);
  console.log(`   Order Hash: ${signedOrder.orderHash}`);
  console.log(`   Hashlock: ${signedOrder.hashlock}`);
  console.log(`   Maker: ${signedOrder.maker}`);
  console.log(`   ADA Amount: ${signedOrder.adaAmount}`);

  console.log(`\n🔍 Analyzing the hashlock...`);
  
  // In production, the maker would have generated the secret beforehand
  // For this demo, let's try to find what secret would produce this hashlock
  
  // Common test secrets to try
  const testSecrets = [
    "hello",
    "secret",
    "password",
    "test123",
    "atomicswap",
    "cardano",
    "ethereum"
  ];

  console.log(`\n🧪 Testing common secrets...`);
  
  let foundSecret = null;
  
  for (const testSecret of testSecrets) {
    // Convert string to bytes32 (padded)
    const secretBytes = ethers.zeroPadValue(ethers.toUtf8Bytes(testSecret), 32);
    const hash = ethers.sha256(secretBytes); // Using SHA-256 as per contract
    
    console.log(`   Testing "${testSecret}": ${hash}`);
    
    if (hash === signedOrder.hashlock) {
      foundSecret = secretBytes;
      console.log(`   ✅ MATCH FOUND! Secret is: "${testSecret}"`);
      break;
    }
  }

  if (!foundSecret) {
    console.log(`\n⚠️  No common secret found. This is normal for production orders.`);
    console.log(`   In production, the maker knows the secret that created the hashlock.`);
    
    // Generate a new secret for demonstration
    const newSecret = ethers.randomBytes(32);
    const newHash = ethers.sha256(newSecret); // Using SHA-256 as per contract
    
    console.log(`\n🔄 Generating new secret for demonstration:`);
    console.log(`   Secret: ${newSecret}`);
    console.log(`   Hash (SHA-256): ${newHash}`);
    console.log(`   (This won't match the existing hashlock)`);
    
    foundSecret = newSecret;
  }

  // Demonstrate the complete flow
  console.log(`\n📋 Complete Cross-Chain Atomic Swap Flow:`);
  console.log(`=========================================`);
  console.log(`1. ✅ Maker creates order with hashlock (secret hash)`);
  console.log(`2. ✅ Maker calls preInteraction to validate order`);
  console.log(`3. ✅ Resolver calls postInteraction to create escrow`);
  console.log(`4. 🔄 Resolver sends ${signedOrder.adaAmount} ADA to maker's Cardano address:`);
  console.log(`      ${signedOrder.cardanoAddress}`);
  console.log(`5. 🔄 Maker verifies ADA receipt on Cardano`);
  console.log(`6. 🔄 Maker shares secret with resolver: ${foundSecret}`);
  console.log(`7. 🔄 Resolver uses secret to withdraw ETH from escrow`);

  // Save the secret for testing purposes
  const secretInfo = {
    orderHash: signedOrder.orderHash,
    secret: foundSecret,
    hashlock: signedOrder.hashlock,
    secretMatches: ethers.sha256(foundSecret) === signedOrder.hashlock,
    cardanoAddress: signedOrder.cardanoAddress,
    adaAmount: signedOrder.adaAmount,
    ethAmount: signedOrder.makingAmount,
    notes: "For testing purposes only. In production, maker generates and shares secret after receiving ADA.",
    createdAt: new Date().toISOString()
  };

  saveSecretInfo(secretInfo, network.name);

  console.log(`\n💾 Secret info saved for testing: secret-info-${network.name}.json`);
  console.log(`\n⏭️  NEXT STEPS:`);
  console.log(`   1. Use this secret in the resolver-withdraw.js script`);
  console.log(`   2. Or modify the script to use the correct secret for your order`);
  console.log(`   3. Run: npx hardhat run scripts/resolver-withdraw.js --network ${network.name}`);

  if (secretInfo.secretMatches) {
    console.log(`\n🎯 This secret will work for withdrawal!`);
  } else {
    console.log(`\n⚠️  This secret won't work for withdrawal - it's just for demonstration`);
    console.log(`   You'll need the actual secret that created the hashlock: ${signedOrder.hashlock}`);
  }
}

function loadSignedOrder(networkName) {
  const orderPath = path.join(__dirname, "../orders", `signed-order-${networkName}.json`);
  
  if (!fs.existsSync(orderPath)) {
    throw new Error(`❌ Signed order not found for network: ${networkName}. Please create an order first.`);
  }
  
  return JSON.parse(fs.readFileSync(orderPath, "utf8"));
}

function saveSecretInfo(secretInfo, networkName) {
  const secretDir = path.join(__dirname, "../secrets");
  if (!fs.existsSync(secretDir)) {
    fs.mkdirSync(secretDir, { recursive: true });
  }
  
  const secretPath = path.join(secretDir, `secret-info-${networkName}.json`);
  fs.writeFileSync(secretPath, JSON.stringify(secretInfo, null, 2));
  
  console.log(`💾 Secret info saved to: ${secretPath}`);
}

// Error handling
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Secret generation failed:", error);
    process.exit(1);
  });
