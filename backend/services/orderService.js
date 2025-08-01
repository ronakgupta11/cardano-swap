
import Order from '../models/Order.js';
import { 
  validateRequiredFields, 
  validateOrderStatus, 
  validateOrderAcceptance,
  validatePaginationParams,
} from '../utils/validation.js';
import { ORDER_STATUSES, ERROR_MESSAGES, ETHEREUM_PRIVATE_KEY } from '../utils/constants.js';
import { signOrder, createOrderHash, createProvider } from '../utils/ethUtils.js';
import UTxOUtils from '../utils/utxo.js';
import blockfrost from '../config/blockfrost.js';
import getTxBuilder from '../config/getTxBuilder.js';
import { loadValues } from "../utils/cardanoUtils.js";
import { ADDRESSES, SEPOLIA_RPC_URL } from '../utils/constants.js';

import { AuthVaultDatum } from "../contracts/cardano/Datum/index.js";
import { 
    Value, 
    pBSToData, 
    pByteString,
    pIntToData,
} from "@harmoniclabs/plu-ts";
import { ethers } from 'ethers';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the JSON file synchronously
const LimitOrderProtocolABI = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../utils/LimitOrderProtocol.json'), 'utf8')
);

/**
 * @description Service layer for order business logic
 */
class OrderService {
  
  /**
   * Creates a new order with comprehensive validation and error handling
   * @param {Object} orderData - Order creation data
   * @returns {Promise<Object>} - Created order or error
   */
  async createOrder(orderData) {
    const {
      fromChain,
      toChain,
      fromToken,
      toToken,
      fromAmount,
      toAmount,
      makerSrcAddress,
      makerDstAddress,
      hashlock
    } = orderData;

    try {
      const { makerAddress, authVaultAddr, makerPkh, makerPrivateKey, script } = await loadValues();
      await this._validateOrderData(orderData);
      
      const salt = Math.floor(Math.random() * 1000000);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      let signature;
      let orderHash;


    //   Logger.info('Creating order', { fromChain, toChain, fromAmount, toAmount });

      if (fromChain === "EVM" && toChain === "Cardano") {
        // Convert fromAmount to wei (assuming ETH or 18-decimal tokens)
        const fromAmountWei = ethers.parseEther(fromAmount.toString());
        
        const result = await this._handleEvmToCardanoOrder({
          makerSrcAddress,
          fromToken,
          toToken,
          fromAmount: fromAmountWei,
          toAmount,
          makerDstAddress,
          hashlock,
          salt,
          expiresAt
        });
        signature = result.signature;
        orderHash = result.orderHash;
        
      } else if (fromChain === "Cardano" && toChain === "EVM") {
        const result = await this._handleCardanoToEvmOrder({
          fromAmount,
          makerDstAddress,
          hashlock,
          makerAddress,
          authVaultAddr,
          makerPkh,
          makerPrivateKey,
          script
        });
        signature = result.signature;
        orderHash = result.orderHash;

      } else {
        throw new Error(`Unsupported chain combination: ${fromChain} -> ${toChain}`);
      }

      // Create order in database with transaction for atomicity
      const newOrder = await this._createOrderInDatabase({
        fromChain,
        toChain,
        fromToken,
        toToken,
        fromAmount,
        toAmount,
        makerSrcAddress,
        makerDstAddress,
        hashlock,
        salt,
        signature,
        orderHash,
        expiresAt
      });

    //   Logger.info('Order created successfully', { orderId: newOrder.id });
      return { success: true,  newOrder };

    } catch (error) {
    //   Logger.error('Order creation failed', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Enhanced validation for order data
   * @private
   */
  async _validateOrderData(orderData) {
    // Basic required fields validation
    const requiredFields = [
      'fromChain', 'toChain', 'fromToken', 'toToken', 
      'fromAmount', 'toAmount', 'makerSrcAddress', 
      'makerDstAddress', 'hashlock'
    ];
    
    const validation = validateRequiredFields(orderData, requiredFields);
    if (!validation.isValid) {
      throw new Error(`${ERROR_MESSAGES.MISSING_REQUIRED_FIELD}: ${validation.missingField}`);
    }

    // // Validate amounts
    // if (!validateAmount(fromAmount) || !validateAmount(toAmount)) {
    //   throw new Error(ERROR_MESSAGES.INVALID_AMOUNT);
    // }

    // // Validate addresses based on chain
    // if (fromChain === "EVM" && !validateAddress(makerSrcAddress, "EVM")) {
    //   throw new Error(ERROR_MESSAGES.INVALID_EVM_ADDRESS);
    // }
    
    // if (toChain === "Cardano" && !validateAddress(makerDstAddress, "Cardano")) {
    //   throw new Error(ERROR_MESSAGES.INVALID_CARDANO_ADDRESS);
    // }

    // // Validate minimum amounts
    // if (fromAmount < NETWORK_CONFIG.MIN_ORDER_AMOUNT) {
    //   throw new Error(`Minimum order amount is ${NETWORK_CONFIG.MIN_ORDER_AMOUNT}`);
    // }
  }

  /**
   * Handle EVM to Cardano order creation
   * @private
   */
  async _handleEvmToCardanoOrder({
    makerSrcAddress,
    fromToken,
    toToken,
    fromAmount,
    toAmount,
    makerDstAddress,
    hashlock,
    salt,
    expiresAt
  }) {
    const order = {
      maker: makerSrcAddress,
      makerAsset: fromToken,
      takerAsset: toToken,
      makingAmount: fromAmount,
      takingAmount: toAmount,
      receiver: '0x0000000000000000000000000000000000000000',
      hashlock: hashlock,
      salt: salt
    };

    const orderMetadata = {
      adaAmount: toAmount,
      cardanoAddress: makerDstAddress,
      safetyDeposit: 0.01, // Default safety deposit
      deadline: expiresAt,
      createdAt: new Date().toISOString()
    };

    // Create order hash for EIP-712 signing
    const orderHash = await createOrderHash(order);
    
    const signedOrderData = {
      ...order,
      ...orderMetadata,
      orderHash: orderHash
    };

    const signature = await signOrder(ETHEREUM_PRIVATE_KEY, signedOrderData);

    // Create provider and signer
    const provider = createProvider("sepolia", SEPOLIA_RPC_URL);
    const signer = new ethers.Wallet(ETHEREUM_PRIVATE_KEY, provider);

    // Get the LOP contract using ABI
    const lop = new ethers.Contract(ADDRESSES.limitOrderProtocol, LimitOrderProtocolABI.abi, signer);
    
    if(fromToken === "0x0000000000000000000000000000000000000000") {
      const preInteractionTx = await lop.preInteraction(order, signature, {
        value: fromAmount
      });
      
      console.log(`📋 Transaction hash: ${preInteractionTx.hash}`);
      console.log(`⏳ Waiting for confirmation...`);
      
      const receipt = await preInteractionTx.wait();
      console.log(`✅ PreInteraction completed in block ${receipt.blockNumber}`);

      }
    else {
      // approve token to lop
      const tokenContract = new ethers.Contract(fromToken, [
        "function approve(address spender, uint256 amount) external returns (bool)"
      ], signer);
      
      const approveTx = await tokenContract.approve(ADDRESSES.limitOrderProtocol, fromAmount);
      
      console.log(`📋 Approve transaction hash: ${approveTx.hash}`);
      console.log(`⏳ Waiting for approval confirmation...`);
      
      const receipt = await approveTx.wait();
      console.log(`✅ Token approved in block ${receipt.blockNumber}`);

      // Now call preInteraction
      const preInteractionTx = await lop.preInteraction(order, signature);
      
      console.log(`📋 Transaction hash: ${preInteractionTx.hash}`);
      console.log(`⏳ Waiting for confirmation...`);
      
      const preReceipt = await preInteractionTx.wait();
      console.log(`✅ PreInteraction completed in block ${preReceipt.blockNumber}`);
    }
      return { signature, orderHash };
}
  /**
   * Handle Cardano to EVM order creation
   * @private
   */
  async _handleCardanoToEvmOrder({ fromAmount, makerDstAddress, hashlock, makerAddress, authVaultAddr, makerPkh, makerPrivateKey, script }) {
    try {
      const Blockfrost = blockfrost();
      const txBuilder = await getTxBuilder(Blockfrost);
      
      // Get UTXOs with proper error handling
      const utxos = await Blockfrost.addressUtxos(makerAddress.toString());
      if (utxos.length === 0) {
        throw new Error("No UTXOs found at maker address. Please ensure the address has sufficient funds.");
      }

      // Calculate required amount including fees and buffer
      // Convert ADA to lovelaces (1 ADA = 1,000,000 lovelaces)
      const feeBuffer = BigInt(2_000_000); // 2 ADA fee buffer in lovelaces
      const fromAmountLovelaces = BigInt(Math.floor(parseFloat(fromAmount) * 1_000_000)); // Convert ADA to lovelaces
      const requiredAmount = Value.lovelaces(fromAmountLovelaces + feeBuffer);
       
      const selectedUtxo = UTxOUtils.findUtxoWithFunds(utxos, requiredAmount);
      if (!selectedUtxo) {
        throw new Error(`Insufficient funds. Required: ${requiredAmount}, but no suitable UTXO found.`);
      }

      // Build transaction
      const tx = txBuilder.buildSync({
        inputs: [{ 
          utxo: UTxOUtils.convertUtxo(selectedUtxo)
        }],
        collaterals: [UTxOUtils.convertUtxo(selectedUtxo)],
        outputs: [{
          address: authVaultAddr.toString(),
          value: Value.lovelaces(fromAmountLovelaces), // Use the converted lovelaces amount
          datum: AuthVaultDatum.AuthVaultDatum({
            maker_pkh: pBSToData.$(pByteString(makerPkh.toBuffer())),
            expected_escrow_script_hash: pBSToData.$(pByteString(script.hash.toBuffer())),
            maker_input_value: pIntToData.$(Number(fromAmountLovelaces)) // Use lovelaces in datum
          })
        }],
        changeAddress: makerAddress.toString()
      });

      // Sign transaction
    //   Logger.info("Signing Cardano transaction...");
      await tx.signWith(makerPrivateKey);
      
      // Submit transaction
    //   Logger.info("Submitting transaction to Cardano network...");
      const txHash = await Blockfrost.submitTx(tx.toCbor().toString());
      
      if (!txHash) {
        throw new Error("Failed to submit transaction to Cardano network");
      }

    //   Logger.info("Cardano transaction submitted successfully", { txHash });
      
      // For Cardano orders, create a unique order hash by combining tx hash with timestamp
      // This ensures uniqueness even if multiple orders use the same transaction
      const orderHash = txHash
      
      return { 
        signature: txHash, // Use txHash as signature for Cardano orders
        orderHash: orderHash // Use combined hash for uniqueness
      };

    } catch (error) {
    //   Logger.error("Cardano transaction failed", { error: error.message });
      throw new Error(`Cardano transaction failed: ${error.message}`);
    }
  }



  /**
   * Create order in database with transaction
   * @private
   */
  async _createOrderInDatabase(orderData) {
    const transaction = await Order.sequelize.transaction();
    
    try {
      const newOrder = await Order.create({
        ...orderData,
        status: ORDER_STATUSES.PENDING,
      }, { transaction });

      await transaction.commit();
      return newOrder;
      
    } catch (error) {
      await transaction.rollback();
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  /**
   * Retrieves orders with pagination and filtering
   * @param {Object} queryParams - Query parameters for filtering and pagination
   * @returns {Promise<Object>} - Paginated orders
   */
  async getAllOrders(queryParams) {
    const { page, limit } = validatePaginationParams(queryParams);
    const { status, makerAddress, resolverAddress } = queryParams;
    
    const offset = (page - 1) * limit;
    
    const whereClause = {};
    if (status) whereClause.status = status;
    if (makerAddress) whereClause.makerAddress = makerAddress;
    if (resolverAddress) whereClause.resolverAddress = resolverAddress;

    const orders = await Order.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    return {
      success: true,
      data: {
        orders: orders.rows,
        totalCount: orders.count,
        currentPage: page,
        totalPages: Math.ceil(orders.count / limit)
      }
    };
  }

  /**
   * Retrieves a single order by ID
   * @param {string} orderId - Order UUID
   * @returns {Promise<Object>} - Order or null
   */
  async getOrderById(orderId) {
    const order = await Order.findByPk(orderId);
    
    if (!order) {
      throw new Error(ERROR_MESSAGES.ORDER_NOT_FOUND);
    }
    
    return { success: true, data: order };
  }

  /**
   * Accepts an order by a resolver
   * @param {string} orderId - Order UUID
   * @param {string} resolverAddress - Resolver's address
   * @returns {Promise<Object>} - Updated order
   */
  async acceptOrder(orderId, resolverAddress) {
    if (!resolverAddress) {
      throw new Error(`${ERROR_MESSAGES.MISSING_REQUIRED_FIELD}: resolverAddress`);
    }

    const order = await Order.findByPk(orderId);
    const validation = validateOrderAcceptance(order);
    
    if (!validation.canAccept) {
      throw new Error(validation.reason);
    }

    order.resolverAddress = resolverAddress;
    order.status = ORDER_STATUSES.DEPOSITING;
    await order.save();

    return { success: true, data: order };
  }

  /**
   * Updates transaction hashes for an order
   * @param {string} orderId - Order UUID
   * @param {Object} txHashes - Transaction hash updates
   * @returns {Promise<Object>} - Updated order
   */
  async updateOrderTxHashes(orderId, txHashes) {
    const { srcEscrowTxHash, dstEscrowTxHash, srcWithdrawTxHash, dstWithdrawTxHash } = txHashes;

    const order = await Order.findByPk(orderId);
    if (!order) {
      throw new Error(ERROR_MESSAGES.ORDER_NOT_FOUND);
    }

    const updates = {};
    if (srcEscrowTxHash) updates.srcEscrowTxHash = srcEscrowTxHash;
    if (dstEscrowTxHash) updates.dstEscrowTxHash = dstEscrowTxHash;
    if (srcWithdrawTxHash) updates.srcWithdrawTxHash = srcWithdrawTxHash;
    if (dstWithdrawTxHash) updates.dstWithdrawTxHash = dstWithdrawTxHash;
    
    if (Object.keys(updates).length === 0) {
      throw new Error(ERROR_MESSAGES.NO_TX_HASH_PROVIDED);
    }

    await order.update(updates);
    return { success: true, data: order };
  }

  /**
   * Updates the status of an order
   * @param {string} orderId - Order UUID
   * @param {string} newStatus - New status
   * @returns {Promise<Object>} - Updated order
   */
  async updateOrderStatus(orderId, newStatus) {
    if (!validateOrderStatus(newStatus)) {
      throw new Error('Invalid or missing status field.');
    }

    const order = await Order.findByPk(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    await order.update({ status: newStatus });
    return { success: true, data: order };
  }
}

export default new OrderService();
