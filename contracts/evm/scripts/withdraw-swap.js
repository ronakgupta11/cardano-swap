const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Script for resolver to withdraw ETH from escrow after receiving the secret
 * The secret is revealed when the maker receives ADA on Cardano
 */

async function main() {
  console.log("💸 Withdrawing ETH from Cardano Swap");
  console.log("====================================");

  // Get resolver (the person withdrawing)
  const [resolver] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  
  console.log(`📡 Network: ${network.name} (${network.chainId})`);
  console.log(`👤 Resolver: ${resolver.address}`);

  // Load swap info
  const orderHashPrefix = process.argv[2];
  if (!orderHashPrefix) {
    console.log("❌ Please provide order hash prefix as argument:");
    console.log("   npx hardhat run scripts/withdraw-swap.js --network <network> <orderHashPrefix>");
    console.log("\nAvailable swaps:");
    listAvailableSwaps(network.name);
    process.exit(1);
  }

  const swapInfo = loadSwapInfo(orderHashPrefix, network.name);
  console.log(`\n🔄 Processing swap: ${swapInfo.orderHash}`);
  console.log(`📍 Escrow: ${swapInfo.escrowAddress}`);
  console.log(`💰 Amount: ${ethers.formatEther(swapInfo.ethAmount)} ETH`);
  console.log(`🏦 Safety Deposit: ${ethers.formatEther(swapInfo.safetyDeposit)} ETH`);

  // Check if resolver is authorized
  if (swapInfo.resolver.toLowerCase() !== resolver.address.toLowerCase()) {
    throw new Error("❌ Only the authorized resolver can withdraw from this swap");
  }

  // Check swap status
  if (swapInfo.status !== "active") {
    throw new Error(`❌ Swap is not active. Current status: ${swapInfo.status}`);
  }

  // Get escrow contract
  const escrow = await ethers.getContractAt("EscrowSrc", swapInfo.escrowAddress);

  // Load secret for withdrawal
  console.log("\n🔐 Loading secret...");
  const secret = loadSecret(orderHashPrefix, network.name);
  console.log(`✅ Secret loaded: ${secret.slice(0, 10)}...`);

  // Verify the secret matches the hashlock
  const computedHashlock = ethers.keccak256(secret);
  if (computedHashlock !== swapInfo.hashlock) {
    throw new Error("❌ Secret does not match the expected hashlock");
  }
  console.log(`✅ Secret verified against hashlock`);

  // Get balance before withdrawal
  const balanceBefore = await ethers.provider.getBalance(resolver.address);
  console.log(`💰 Resolver balance before: ${ethers.formatEther(balanceBefore)} ETH`);

  // Withdraw from escrow
  console.log("\n💸 Withdrawing ETH from escrow...");
  const tx = await escrow.connect(resolver).withdraw(secret, {
    gasLimit: 200000 // Set appropriate gas limit
  });

  console.log(`📝 Transaction hash: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`✅ Withdrawal successful!`);
  console.log(`⛽ Gas used: ${receipt.gasUsed.toString()}`);

  // Get balance after withdrawal
  const balanceAfter = await ethers.provider.getBalance(resolver.address);
  const gasUsed = receipt.gasUsed * receipt.gasPrice;
  const netGain = balanceAfter - balanceBefore + gasUsed;
  console.log(`💰 Resolver balance after: ${ethers.formatEther(balanceAfter)} ETH`);
  console.log(`📈 Net gain: ${ethers.formatEther(netGain)} ETH (before gas)`);

  // Parse withdrawal event
  for (const log of receipt.logs) {
    try {
      const parsed = escrow.interface.parseLog(log);
      if (parsed.name === 'EscrowWithdrawal') {
        console.log(`🎉 Withdrawal event confirmed with secret: ${parsed.args.secret}`);
        break;
      }
    } catch (e) {
      // Ignore parsing errors for other events
    }
  }

  // Update swap info
  swapInfo.withdrawnAt = new Date().toISOString();
  swapInfo.withdrawTxHash = tx.hash;
  swapInfo.status = "completed";
  swapInfo.finalGasUsed = receipt.gasUsed.toString();
  swapInfo.secretUsed = secret;
  
  saveSwapInfo(swapInfo, network.name);

  console.log("\n🎉 Swap Completed Successfully!");
  console.log("===============================");
  console.log(`📍 Escrow: ${swapInfo.escrowAddress}`);
  console.log(`💰 Withdrawn: ${ethers.formatEther(swapInfo.ethAmount)} ETH`);
  console.log(`🔒 Safety deposit returned: ${ethers.formatEther(swapInfo.safetyDeposit)} ETH`);
  console.log(`📈 Total received: ${ethers.formatEther(netGain)} ETH (before gas)`);
  console.log(`\n📄 Final swap info: swap-${swapInfo.orderHash.slice(0, 8)}-${network.name}.json`);
}

function listAvailableSwaps(networkName) {
  const swapsDir = path.join(__dirname, "../swaps");
  if (!fs.existsSync(swapsDir)) {
    console.log("   No swaps directory found");
    return;
  }
  
  const files = fs.readdirSync(swapsDir)
    .filter(file => file.includes(networkName) && file.endsWith('.json'))
    .map(file => {
      try {
        const orderHash = file.split('-')[1];
        const swapInfo = JSON.parse(fs.readFileSync(path.join(swapsDir, file), 'utf8'));
        return {
          prefix: orderHash,
          status: swapInfo.status || 'active',
          amount: ethers.formatEther(swapInfo.ethAmount || '0'),
          file
        };
      } catch (e) {
        return null;
      }
    })
    .filter(swap => swap !== null);
  
  if (files.length === 0) {
    console.log("   No swap files found");
    return;
  }
  
  console.log("   Available swaps:");
  files.forEach(swap => {
    console.log(`     ${swap.prefix} - ${swap.amount} ETH (${swap.status})`);
  });
}

function loadSwapInfo(orderHashPrefix, networkName) {
  const swapsDir = path.join(__dirname, "../swaps");
  if (!fs.existsSync(swapsDir)) {
    throw new Error("❌ No swaps directory found");
  }
  
  // Find swap file by prefix
  const files = fs.readdirSync(swapsDir)
    .filter(file => file.startsWith(`swap-${orderHashPrefix}`) && file.includes(networkName));
  
  if (files.length === 0) {
    throw new Error(`❌ No swap found with prefix: ${orderHashPrefix}`);
  }
  
  if (files.length > 1) {
    throw new Error(`❌ Multiple swaps found with prefix: ${orderHashPrefix}. Please be more specific.`);
  }
  
  const swapPath = path.join(swapsDir, files[0]);
  return JSON.parse(fs.readFileSync(swapPath, "utf8"));
}

function loadSecret(orderHashPrefix, networkName) {
  const secretsDir = path.join(__dirname, "../secrets");
  if (!fs.existsSync(secretsDir)) {
    throw new Error("❌ No secrets directory found");
  }
  
  // Find secret file by prefix
  const files = fs.readdirSync(secretsDir)
    .filter(file => file.startsWith(`secret-${orderHashPrefix}`) && file.includes(networkName));
  
  if (files.length === 0) {
    throw new Error(`❌ No secret found for swap: ${orderHashPrefix}. The maker must provide the secret after receiving ADA.`);
  }
  
  if (files.length > 1) {
    throw new Error(`❌ Multiple secrets found with prefix: ${orderHashPrefix}. Please be more specific.`);
  }
  
  const secretPath = path.join(secretsDir, files[0]);
  const secretData = JSON.parse(fs.readFileSync(secretPath, "utf8"));
  return secretData.secret;
}

function saveSwapInfo(swapInfo, networkName) {
  const swapsDir = path.join(__dirname, "../swaps");
  const swapPath = path.join(swapsDir, `swap-${swapInfo.orderHash.slice(0, 8)}-${networkName}.json`);
  fs.writeFileSync(swapPath, JSON.stringify(swapInfo, null, 2));
}

// Error handling
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Withdrawal failed:", error);
    process.exit(1);
  });