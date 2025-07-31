const { Order } = require('../models');
const { Op } = require('sequelize');
const { 
  validateRequiredFields, 
  validateOrderStatus, 
  validateOrderAcceptance,
  validatePaginationParams 
} = require('../utils/validation');
const { ORDER_STATUSES, ERROR_MESSAGES } = require('../utils/constants');
const { generateRandomSecret } = require('../utils/secretManager');
const { signOrder,createOrderHash } = require('../utils/ethUtils');
const { createHashlock,storeSecretToLocalStorage } = require('../utils/secretManager');
const { FileUtils } = require('../utils/fileUtils');
const {UTxOUtils} = require('../utils/utxo');
const blockfrost = require('../config/blockfrost');
const getTxBuilder = require('../config/getTxBuilder');
import { 
    Address, 
    Credential, 
    PrivateKey, 
    Value, 
    pBSToData, 
    pByteString, 
    pIntToData,
    CredentialType,
    PublicKey,
    Script,
    ScriptType
} from "@harmoniclabs/plu-ts";
/**
 * @description Service layer for order business logic
 * All database operations and business rules are handled here
 */
class OrderService {
  
  /**
   * Creates a new order with validation
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
    } = orderData;

    // Validate required fields
    const requiredFields = [
      'fromChain', 'toChain', 'fromToken', 'toToken', 
      'fromAmount', 'toAmount', 'makerSrcAddress', 
      'makerDstAddress'
    ];
    
    const validation = validateRequiredFields(orderData, requiredFields);
    if (!validation.isValid) {
      throw new Error(`${ERROR_MESSAGES.MISSING_REQUIRED_FIELD}: ${validation.missingField}`);
    }

    //business logic
    if(fromChain === "EVM" && toChain === "Cardano") {

        const secret = generateRandomSecret();
        const hashlock = createHashlock(secret);
        const salt = Math.floor(Math.random() * 1000000); // Random salt for order signing
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

        const order = {
            maker: makerSrcAddress,
            makerAsset: fromToken, // Assuming fromToken is the EVM asset address
            takerAsset: toToken,
            makingAmount: fromAmount,
            takingAmount: toAmount,
            receiver: 0x0000000000000000000000000000000000000000, // Placeholder for resolver address
            hashlock: hashlock,
            salt: salt
        };

        const orderMetadata = {
            adaAmount: toAmount,
            cardanoAddress: makerDstAddress,
            safetyDeposit: 0.01, // Example safety deposit
            deadline:expiresAt,
            createdAt: new Date().toISOString()
        };

          // Create order hash for EIP-712 signing
        const orderHash = await createOrderHash(order);
        

        // Combine order with metadata for final signed order
        const signedOrderData = {
            ...order,
            ...orderMetadata,
            orderHash: orderHash
        };

        const signature = await signOrder(makerSrcAddress, signedOrderData);

        storeSecretToLocalStorage(orderHash,secret);
        // Create the order in the database
        const newOrder = await Order.create({
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
          expiresAt,
          status: ORDER_STATUSES.PENDING,
          orderHash,
        });


        return { success: true, data: newOrder };


    }
    else{

        const Blockfrost = blockfrost();
        const txBuilder = await getTxBuilder(Blockfrost);

        const script = await FileUtils.loadScript("../testnet/atomic-swap.plutus.json", ScriptType.PlutusV3);
        const scriptAddr = new Address("testnet", new Credential(CredentialType.Script, script.hash));

        const makerPrivateKey = await FileUtils.loadPrivateKey("./testnet/payment1.skey");
        const makerAddress = await FileUtils.loadAddress("./testnet/address1.addr");
        
        const takerPublicKey = await FileUtils.loadPublicKey("./testnet/payment2.vkey");
        const takerPkh = takerPublicKey.hash;

        const secret = generateRandomSecret();

        const hashlock = createHashlock(secret);
        const salt = Math.floor(Math.random() * 1000000); // Random salt for order signing
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

        const utxos = await Blockfrost.addressUtxos(makerAddress.toString());
        if (utxos.length === 0) {
                    throw new Error("No UTXOs found at the maker address. Ensure the address has funds.");
                }

        const requiredAmount = finalConfig.escrowAmount + finalConfig.safetyDeposit + BigInt(5_000_000); // Add buffer for fees
        const selectedUtxo = UTxOUtils.findUtxoWithFunds(utxos, requiredAmount);

        const now = Date.now();
        const resolverDeadline = now + (finalConfig.deadlineOffset * 3600000);
        const cancelDeadline = now + (finalConfig.cancelOffset * 3600000);
        const publicDeadline = now + (finalConfig.publicOffset * 3600000);


        const tx = txBuilder.buildSync({
            inputs: [{ 
                utxo: UTxOUtils.convertUtxo(selectedUtxo)
            }],
            collaterals: [UTxOUtils.convertUtxo(selectedUtxo)],
            outputs: [{
                address: scriptAddr.toString(),
                value: Value.lovelaces(finalConfig.escrowAmount + finalConfig.safetyDeposit),
                datum: EscrowDatum.EscrowDatum({
                    hashlock: pBSToData.$(pByteString(hashlock)),
                    maker_pkh: pBSToData.$(pByteString(makerAddress.paymentCreds.hash.toBuffer())),
                    resolver_pkh: pBSToData.$(pByteString(takerPkh.toBuffer())),
                    resolver_unlock_deadline: pIntToData.$(resolverDeadline),
                    resolver_cancel_deadline: pIntToData.$(cancelDeadline),
                    public_cancel_deadline: pIntToData.$(publicDeadline),
                    safety_deposit: pIntToData.$(Number(0.01* 1_000_000)), // Convert ADA to lovelaces
                })
            }],
            changeAddress: makerAddress.toString()
        });

         await tx.signWith(makerPrivateKey);

        const submittedTx = await Blockfrost.submitTx(tx.toCbor().toString());

        // Store the secret in localStorage for later retrieval
        storeSecretToLocalStorage(newOrder.id, secret);

        // Create the order in the database
   
        const newOrder = await Order.create({
                fromChain,
                toChain,
                fromToken,
                toToken,
                fromAmount,
                toAmount,
                makerSrcAddress,
                makerDstAddress,
                hashlock,
                signature: tx.toCbor().toString(),
                expiresAt: new Date(expiresAt),
                relayerFee,
                status: ORDER_STATUSES.PENDING
            });

        return { success: true, data: newOrder };

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

module.exports = new OrderService();
