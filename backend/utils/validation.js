/**
 * @description Validation utilities for order processing
 */
const { VALID_ORDER_STATUSES, PAGINATION } = require('./constants');

/**
 * Validates required fields for order creation
 * @param {Object} data - The data object to validate
 * @param {Array} requiredFields - Array of required field names
 * @returns {Object} - { isValid: boolean, missingField: string|null }
 */
const validateRequiredFields = (data, requiredFields) => {
  for (const field of requiredFields) {
    if (!data[field]) {
      return { isValid: false, missingField: field };
    }
  }
  return { isValid: true, missingField: null };
};

/**
 * Validates order status
 * @param {string} status - The status to validate
 * @returns {boolean} - True if status is valid
 */
const validateOrderStatus = (status) => {
  return VALID_ORDER_STATUSES.includes(status);
};

/**
 * Validates if an order can be accepted
 * @param {Object} order - The order object
 * @returns {Object} - { canAccept: boolean, reason: string|null }
 */
const validateOrderAcceptance = (order) => {
  if (!order) {
    return { canAccept: false, reason: 'Order not found' };
  }
  
  if (order.status !== 'pending') {
    return { canAccept: false, reason: `Order cannot be accepted. Current status: ${order.status}` };
  }
  
  return { canAccept: true, reason: null };
};

/**
 * Validates pagination parameters
 * @param {Object} params - Query parameters
 * @returns {Object} - { page: number, limit: number }
 */
const validatePaginationParams = (params) => {
  const page = Math.max(PAGINATION.DEFAULT_PAGE, parseInt(params.page) || PAGINATION.DEFAULT_PAGE);
  const limit = Math.min(PAGINATION.MAX_LIMIT, Math.max(PAGINATION.MIN_LIMIT, parseInt(params.limit) || PAGINATION.DEFAULT_LIMIT));
  
  return { page, limit };
};

module.exports = {
  validateRequiredFields,
  validateOrderStatus,
  validateOrderAcceptance,
  validatePaginationParams
};
