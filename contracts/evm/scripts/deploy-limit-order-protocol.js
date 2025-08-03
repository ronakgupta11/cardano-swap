const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// interface LimitOrderDeploymentResult {
//   network: string;
//   chainId: number;
//   contracts: {
//     limitOrderProtocol: string;
//   };
//   config: {
//     name: string;
//     version: string;
//   };
//   deployedAt: string;
//   gasUsed: {
//     limitOrderProtocol: string;
//     total: string;
//   };
// }

async function main() {
  console.log("🚀 Deploying Limit Order Protocol");
  console.log("==================================");

  // Get deployer
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  
  console.log(`📡 Network: ${network.name} (${network.chainId})`);
  console.log(`👤 Deployer: ${deployer.address}`);
  console.log(`💰 Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);

  // Load deployment configuration
  const config = loadDeploymentConfig();
  console.log(`⚙️  Configuration loaded`);

  let totalGasUsed = 0n;
  const gasUsed = {};

  // Deploy LimitOrderProtocol
  console.log("\n📝 Deploying Limit Order Protocol...");
  const LimitOrderProtocol = await ethers.getContractFactory("LimitOrderProtocol");
  
  console.log("Constructor args:", {
    name: config.name,
    version: config.version,
  });
  
  const limitOrderProtocol = await LimitOrderProtocol.deploy(
    config.name,
    config.version
  );
  await limitOrderProtocol.waitForDeployment();
  
  const deployTx = limitOrderProtocol.deploymentTransaction();
  const receipt = await deployTx?.wait();
  gasUsed.limitOrderProtocol = receipt?.gasUsed?.toString() || "0";
  totalGasUsed += receipt?.gasUsed || 0n;
  
  const limitOrderProtocolAddress = await limitOrderProtocol.getAddress();
  console.log(`✅ Limit Order Protocol deployed: ${limitOrderProtocolAddress}`);

  // Prepare deployment result
  gasUsed.total = totalGasUsed.toString();
  
  const deploymentResult = {
    network: network.name,
    chainId: Number(network.chainId),
    contracts: {
      limitOrderProtocol: limitOrderProtocolAddress,
    },
    config,
    deployedAt: new Date().toISOString(),
    gasUsed
  };

  // Save deployment info
  await saveDeploymentInfo(deploymentResult);

  // Display summary
  console.log("\n🎉 Deployment Complete!");
  console.log("========================");
  console.log(`📝 Limit Order Protocol: ${limitOrderProtocolAddress}`);
  console.log(`⛽ Total Gas Used: ${ethers.formatUnits(totalGasUsed, "gwei")} Gwei`);

  console.log("\n📁 Files saved:");
  console.log(`   deployments/limit-order-${network.name}-${network.chainId}.json`);
}

function loadDeploymentConfig() {
  const configPath = path.join(__dirname, "../limit-order-config.json");
  
  let config;
  
  if (fs.existsSync(configPath)) {
    console.log(`📋 Loading config from: ${configPath}`);
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } else {
    console.log(`📋 Using default configuration`);
    config = {
      name: "Atomic Swap Limit Order Protocol",
      version: "1.0.0"
    };
    
    // Save default config for future use
    const deploymentsDir = path.join(__dirname, "../deployments");
    if (!fs.existsSync(deploymentsDir)) {
      fs.mkdirSync(deploymentsDir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`💾 Default config saved to: ${configPath}`);
  }
  
  return config;
}

async function saveDeploymentInfo(result) {
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  // Save detailed deployment info
  const detailedPath = path.join(deploymentsDir, `limit-order-${result.network}-${result.chainId}.json`);
  fs.writeFileSync(detailedPath, JSON.stringify(result, null, 2));

  // Save simple addresses file
  const addressesPath = path.join(deploymentsDir, `limit-order-addresses-${result.network}.json`);
  const addresses = {
    network: result.network,
    chainId: result.chainId,
    ...result.contracts,
    deployedAt: result.deployedAt
  };
  fs.writeFileSync(addressesPath, JSON.stringify(addresses, null, 2));

  console.log(`💾 Deployment info saved to: ${detailedPath}`);
  console.log(`💾 Addresses saved to: ${addressesPath}`);
}

// Error handling
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
