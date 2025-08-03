const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// interface DeploymentConfig {
//   accessTokenAddress?: string;
//   owner?: string;
//   rescueDelaySrc: number;
//   rescueDelayDst: number;
//   limitOrderProtocolAddress?: string;
// }

// interface DeploymentResult {
//   network: string;
//   chainId: number;
//   contracts: {
//     accessToken: string;
//     cardanoEscrowFactory: string;
//     cardanoEscrowSrcImplementation: string;
//     cardanoEscrowDstImplementation: string;
//   };
//   config: DeploymentConfig;
//   deployedAt: string;
//   gasUsed: {
//     accessToken: string;
//     cardanoEscrowFactory: string;
//     total: string;
//   };
// }

async function main() {
  console.log("🚀 Deploying Cardano Atomic Swap System");
  console.log("===================================");

  // Get deployer
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  
  console.log(`📡 Network: ${network.name} (${network.chainId})`);
  console.log(`👤 Deployer: ${deployer.address}`);
  console.log(`💰 Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);

  // Load deployment configuration
  const config = loadDeploymentConfig();
  console.log(`⚙️  Configuration loaded`);

  // Load or prompt for Limit Order Protocol address
  let limitOrderProtocolAddress = config.limitOrderProtocolAddress;
  if (!limitOrderProtocolAddress) {
    limitOrderProtocolAddress = await loadLimitOrderProtocolAddress(network.name, network.chainId);
    if (!limitOrderProtocolAddress) {
      console.error("❌ Limit Order Protocol address not found. Please deploy it first using deploy-limit-order-protocol.js");
      process.exit(1);
    }
  }
  console.log(`🔗 Using Limit Order Protocol: ${limitOrderProtocolAddress}`);

  let totalGasUsed = 0n;
  const gasUsed = {};

  // Deploy Access Token (if not provided)
  let accessTokenAddress = config.accessTokenAddress;
  if (!accessTokenAddress) {
    console.log("\n📝 Deploying Access Token...");
    const AccessToken = await ethers.getContractFactory("MockERC20");
    const accessToken = await AccessToken.deploy("Access Token", "ACCESS");
    await accessToken.waitForDeployment();
    
    const deployTx = accessToken.deploymentTransaction();
    const receipt = await deployTx?.wait();
    gasUsed.accessToken = receipt?.gasUsed?.toString() || "0";
    totalGasUsed += receipt?.gasUsed || 0n;
    
    accessTokenAddress = await accessToken.getAddress();
    console.log(`✅ Access Token deployed: ${accessTokenAddress}`);
  } else {
    console.log(`🔗 Using existing Access Token: ${accessTokenAddress}`);
    gasUsed.accessToken = "0";
  }

  // Deploy Cardano Escrow Factory
  console.log("\n🏭 Deploying Cardano Escrow Factory...");
  const CardanoEscrowFactory = await ethers.getContractFactory("EscrowFactory");
  
  console.log("Constructor args:", {
    owner: config.owner || deployer.address,
    rescueDelaySrc: config.rescueDelaySrc,
    rescueDelayDst: config.rescueDelayDst,
    accessToken: accessTokenAddress,
  });
  
  const cardanoEscrowFactory = await CardanoEscrowFactory.deploy(
    config.owner || deployer.address,
    config.rescueDelaySrc,
    config.rescueDelayDst,
    accessTokenAddress,
  );
  await cardanoEscrowFactory.waitForDeployment();
  
  const factoryDeployTx = cardanoEscrowFactory.deploymentTransaction();
  const factoryReceipt = await factoryDeployTx?.wait();
  gasUsed.cardanoEscrowFactory = factoryReceipt?.gasUsed?.toString() || "0";
  totalGasUsed += factoryReceipt?.gasUsed || 0n;

  const factoryAddress = await cardanoEscrowFactory.getAddress();
  console.log(`✅ Cardano Escrow Factory deployed: ${factoryAddress}`);

  // Set Limit Order Protocol address in Escrow Factory
  console.log("\n🔗 Setting Limit Order Protocol address in Escrow Factory...");
  const setLimitOrderTx = await cardanoEscrowFactory.setLimitOrderProtocol(limitOrderProtocolAddress);
  await setLimitOrderTx.wait();
  console.log(`✅ Limit Order Protocol address set in Escrow Factory`);

  // Get implementation addresses
  const srcImplementation = await cardanoEscrowFactory.getEscrowSrcImplementation();
  const dstImplementation = await cardanoEscrowFactory.getEscrowDstImplementation();
  
  console.log(`📋 Source Implementation: ${srcImplementation}`);
  console.log(`📋 Destination Implementation: ${dstImplementation}`);

  // Prepare deployment result
  gasUsed.total = totalGasUsed.toString();
  
  const deploymentResult= {
    network: network.name,
    chainId: Number(network.chainId),
    contracts: {
      accessToken: accessTokenAddress,
      cardanoEscrowFactory: factoryAddress,
      limitOrderProtocol: limitOrderProtocolAddress,
      cardanoEscrowSrcImplementation: srcImplementation,
      cardanoEscrowDstImplementation: dstImplementation
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
  console.log(`🏭 Cardano Escrow Factory: ${factoryAddress}`);    
  console.log(` Limit Order Protocol: ${limitOrderProtocolAddress}`);
  console.log(`🔑 Access Token: ${accessTokenAddress}`);
  console.log(`⛽ Total Gas Used: ${ethers.formatUnits(totalGasUsed, "gwei")} Gwei`);

  console.log("\n📁 Files saved:");
  console.log(`   deployments/cardano-${network.name}-${network.chainId}.json`);
}

async function loadLimitOrderProtocolAddress(networkName, chainId) {
  const limitOrderDeploymentPath = path.join(__dirname, "../deployments", `limit-order-${networkName}-${chainId}.json`);
  
  if (fs.existsSync(limitOrderDeploymentPath)) {
    console.log(`📋 Loading Limit Order Protocol address from: ${limitOrderDeploymentPath}`);
    const deploymentData = JSON.parse(fs.readFileSync(limitOrderDeploymentPath, "utf8"));
    return deploymentData.contracts.limitOrderProtocol;
  }
  
  // Fallback: check simple addresses file
  const addressesPath = path.join(__dirname, "../deployments", `limit-order-addresses-${networkName}.json`);
  if (fs.existsSync(addressesPath)) {
    console.log(`📋 Loading Limit Order Protocol address from: ${addressesPath}`);
    const addressesData = JSON.parse(fs.readFileSync(addressesPath, "utf8"));
    return addressesData.limitOrderProtocol;
  }
  
  return null;
}

function loadDeploymentConfig() {
  const configPath = path.join(__dirname, "../deploy-config.json");
  
  let config;
  
  if (fs.existsSync(configPath)) {
    console.log(`📋 Loading config from: ${configPath}`);
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } else {
    console.log(`📋 Using default configuration`);
    config = {
      rescueDelaySrc: 7 * 24 * 3600, // 7 days
      rescueDelayDst: 7 * 24 * 3600, // 7 days  
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

async function saveDeploymentInfo(result){
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  // Save detailed deployment info
  const detailedPath = path.join(deploymentsDir, `cardano-${result.network}-${result.chainId}.json`);
  fs.writeFileSync(detailedPath, JSON.stringify(result, null, 2));

  // Save simple addresses file
  const addressesPath = path.join(deploymentsDir, `addresses-${result.network}.json`);
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