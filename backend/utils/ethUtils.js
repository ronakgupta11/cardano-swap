const { ethers } = require('ethers');
const { ADDRESSES } = require('./constants');
/**
 * @description Ethereum blockchain utilities for cross-chain atomic swaps
 * This file contains utilities for interacting with Ethereum and EVM-compatible chains
 */

/**
 * Default EIP-712 domain configuration
 */
const DEFAULT_EIP712_DOMAIN = {
  name: 'Atomic Swap Limit Order Protocol',
  version: '1.0.0',
  chainId: 1, // Will be overridden based on network
  verifyingContract: '0x0000000000000000000000000000000000000000' // Will be overridden
};

/**
 * EIP-712 type definitions for order signing
 */
const ORDER_TYPES = {
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

/**
 * Common EVM network configurations
 */
const NETWORK_CONFIGS = {
  mainnet: {
    chainId: 1,
    name: 'Ethereum Mainnet',
    rpcUrl: 'https://mainnet.infura.io/v3/',
    blockExplorer: 'https://etherscan.io'
  },
  sepolia: {
    chainId: 11155111,
    name: 'Sepolia Testnet',
    rpcUrl: 'https://sepolia.infura.io/v3/',
    blockExplorer: 'https://sepolia.etherscan.io'
  },
};

/**
 * Loads deployment addresses from configuration
 * @param {string} networkName - Name of the network
 * @returns {Object} - Contract addresses
 */
const loadDeploymentAddresses = (networkName) => {
    if(networkName === 'sepolia') {
      return {
        limitOrderProtocol: ADDRESSES.limitOrderProtocol,
        escrowContract: ADDRESSES.cardanoEscrowFactory
      };
    }
    else{
        return {
            limitOrderProtocol: '0x0000000000000000000000000000000000000000',
            escrowContract: '0x0000000000000000000000000000000000000000'
        };
    }


};



/**
 * Signs an order using EIP-712 standard
 * @param {ethers.Signer} maker - The signer (wallet) creating the order
 * @param {Object} orderData - Order data to sign
 * @param {ethers.providers.Provider} provider - Ethereum provider
 * @returns {Promise<string>} - EIP-712 signature
 */
async function signOrder(maker, orderValue, provider = null) {
  try {
    console.log(`\n✍️  Signing order with EIP-712...`);
    
    // Use provided provider or get from maker
    const ethProvider = provider || maker.provider;
    if (!ethProvider) {
      throw new Error('No provider available for network detection');
    }
    
    // Get the network to determine the correct chain ID
    const network = await ethProvider.getNetwork();
    
    // Load deployment addresses and config
    const addresses = loadDeploymentAddresses(network.name);
    
    // Create EIP-712 domain
    const domain = {
      name: DEFAULT_EIP712_DOMAIN.name,
      version:  DEFAULT_EIP712_DOMAIN.version,
      chainId: network.chainId,
      verifyingContract: addresses.limitOrderProtocol 
    };

    // Sign using EIP-712
    const signature = await maker.signTypedData(domain, ORDER_TYPES, orderValue);
    console.log(`✅ Order signed: ${signature.slice(0, 20)}...`);
    
    return signature;
  } catch (error) {
    console.error('Failed to sign order:', error);
    throw new Error(`Order signing failed: ${error.message}`);
  }
}

async function createOrderHash(maker, orderValue, provider = null) {
  try {
    console.log(`\n✍️  Creating order hash with EIP-712...`);

    // Use provided provider or get from maker
    const ethProvider = provider || maker.provider;
    if (!ethProvider) {
      throw new Error('No provider available for network detection');
    }
    
    // Get the network to determine the correct chain ID
    const network = await ethProvider.getNetwork();
    
    // Load deployment addresses and config
    const addresses = loadDeploymentAddresses(network.name);
    
    // Create EIP-712 domain
    const domain = {
      name: DEFAULT_EIP712_DOMAIN.name,
      version:  DEFAULT_EIP712_DOMAIN.version,
      chainId: network.chainId,
      verifyingContract: addresses.limitOrderProtocol 
    };

    const orderHash = ethers.TypedDataEncoder.hash(domain, ORDER_TYPES, orderValue);
    return orderHash;
  } catch (error) {
    console.error('Failed to create order hash:', error);
    throw new Error(`Order hash creation failed: ${error.message}`);
  }
}

/**
 * Creates a provider for the specified network
 * @param {string} networkName - Network name
 * @param {string} rpcUrl - Optional custom RPC URL
 * @returns {ethers.providers.Provider} - Ethereum provider
 */
const createProvider = (networkName, rpcUrl = null) => {
  try {
    const network = NETWORK_CONFIGS[networkName];
    if (!network && !rpcUrl) {
      throw new Error(`Unknown network: ${networkName}`);
    }
    
    const url = rpcUrl || network.rpcUrl;
    return new ethers.providers.JsonRpcProvider(url);
  } catch (error) {
    throw new Error(`Failed to create provider: ${error.message}`);
  }
};

/**
 * Creates a wallet from private key
 * @param {string} privateKey - Private key (with or without 0x prefix)
 * @param {ethers.providers.Provider} provider - Ethereum provider
 * @returns {ethers.Wallet} - Wallet instance
 */
const createWallet = (privateKey, provider) => {
  try {
    const key = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    return new ethers.Wallet(key, provider);
  } catch (error) {
    throw new Error(`Failed to create wallet: ${error.message}`);
  }
};




/**
 * Gets network information
 * @param {ethers.providers.Provider} provider - Ethereum provider
 * @returns {Promise<Object>} - Network information
 */
const getNetworkInfo = async (provider) => {
  try {
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    const gasPrice = await provider.getGasPrice();
    
    return {
      chainId: network.chainId,
      name: network.name,
      blockNumber,
      gasPrice: gasPrice.toString()
    };
  } catch (error) {
    throw new Error(`Failed to get network info: ${error.message}`);
  }
};

/**
 * Estimates gas for a transaction
 * @param {ethers.Contract} contract - Contract instance
 * @param {string} methodName - Method name to call
 * @param {Array} params - Method parameters
 * @returns {Promise<ethers.BigNumber>} - Estimated gas
 */
const estimateGas = async (contract, methodName, params = []) => {
  try {
    return await contract.estimateGas[methodName](...params);
  } catch (error) {
    throw new Error(`Gas estimation failed: ${error.message}`);
  }
};

/**
 * Waits for transaction confirmation
 * @param {ethers.providers.Provider} provider - Ethereum provider
 * @param {string} txHash - Transaction hash
 * @param {number} confirmations - Number of confirmations to wait for
 * @returns {Promise<ethers.providers.TransactionReceipt>} - Transaction receipt
 */
const waitForTransaction = async (provider, txHash, confirmations = 1) => {
  try {
    console.log(`⏳ Waiting for transaction ${txHash} (${confirmations} confirmations)...`);
    const receipt = await provider.waitForTransaction(txHash, confirmations);
    console.log(`✅ Transaction confirmed: ${txHash}`);
    return receipt;
  } catch (error) {
    throw new Error(`Transaction wait failed: ${error.message}`);
  }
};

module.exports = {
  // Core functions
  signOrder,
  createOrderHash,

  
  // Provider and wallet utilities
  createProvider,
  createWallet,
  
  // Network utilities
  getNetworkInfo,
  loadDeploymentAddresses,

  
  // Transaction utilities
  estimateGas,
  waitForTransaction,
  
  // Constants
  DEFAULT_EIP712_DOMAIN,
  ORDER_TYPES,
  NETWORK_CONFIGS
};
