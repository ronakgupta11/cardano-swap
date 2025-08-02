
import Order from '../models/Order.js';
import { 
  validateRequiredFields, 
  validateOrderStatus, 
  validateOrderAcceptance,
  validatePaginationParams,
} from '../utils/validation.js';
import { ORDER_STATUSES, ERROR_MESSAGES } from '../utils/constants.js';



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
      hashlock,
      signature,
      expiresAt,
      salt,
      orderHash
    } = orderData;

    try {
      await this._validateOrderData(orderData);

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
      return { success: true,  data: newOrder };

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
      'makerDstAddress', 'hashlock',
      'signature', 'expiresAt', 'salt', 'orderHash'
    ];
    
    const validation = validateRequiredFields(orderData, requiredFields);
    if (!validation.isValid) {
      throw new Error(`${ERROR_MESSAGES.MISSING_REQUIRED_FIELD}: ${validation.missingField}`);
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

  async updateOrderEscrowAddresses(orderId, escrowAddresses) {
    const { escrowSrcAddress, escrowDstAddress } = escrowAddresses;
    const order = await Order.findByPk(orderId);
    if (!order) {
      throw new Error(ERROR_MESSAGES.ORDER_NOT_FOUND);
    }

    const updateData = {};
    if (escrowSrcAddress) {
      updateData.escrowSrcAddress = escrowSrcAddress;
    }
    if (escrowDstAddress) {
      updateData.escrowDstAddress = escrowDstAddress;
    }
  
    await order.update(updateData);
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
