import { signTypedData } from '@wagmi/core';
import { config } from './wagmi'; // Ensure this is correctly set up
import { ADDRESSES } from './constants';
import { hashTypedData } from 'viem'
const DEFAULT_EIP712_DOMAIN = {
  name: 'Atomic Swap Limit Order Protocol',
  version: '1.0.0',
  chainId: 11155111, // Sepolia Testnet
  verifyingContract: ADDRESSES.limitOrderProtocol as `0x${string}`,
};

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

// ethUtils.tsC

export async function createOrderHash(orderValue: any) {
    try {
      console.log(`\n✍️  Creating order hash with EIP-712...`);
      console.log('Order value:', orderValue);
  
      // Create EIP-712 domain
      const domain = DEFAULT_EIP712_DOMAIN;
  
      // Use TypedDataEncoder from viem to hash the order
      const orderHash = hashTypedData({
        domain,
        types: ORDER_TYPES,
        primaryType: "Order",
        message: orderValue,
      });
  
      console.log('Order hash:', orderHash);
      return orderHash;
    } catch (error) {
      console.error('Failed to create order hash:', error);
      throw new Error(`Order hash creation failed: ${error as any}`);
    }
  }
  
  export async function signOrder(orderValue: any) {
    try {
      console.log(`\n✍️  Signing order with EIP-712...`);
      console.log('Order value:', orderValue);
  
      // Sign using EIP-712
      const signature = await signTypedData(config, {
        domain: DEFAULT_EIP712_DOMAIN,
        types: ORDER_TYPES,
        primaryType: 'Order',
        message: orderValue,
      });
  
      console.log(`✅ Order signed: ${signature.slice(0, 20)}...`);
      return signature;
    } catch (error) {
      console.error('Failed to sign order:', error);
      throw new Error(`Order signing failed: ${error as any}`);
    }
  }