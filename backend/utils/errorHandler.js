/**
 * @description Error handling utilities
 */

/**
 * Custom error class for business logic errors
 */
class BusinessError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'BusinessError';
    this.statusCode = statusCode;
  }
}

/**
 * Custom error class for not found errors
 */
class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

/**
 * Custom error class for validation errors
 */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

/**
 * Custom error class for conflict errors
 */
class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
    this.statusCode = 409;
  }
}

/**
 * Handles service layer errors and converts them to appropriate HTTP responses
 * @param {Error} error - The error to handle
 * @param {Object} res - Express response object
 */
const handleServiceError = (error, res) => {
  console.error('Service error:', error);

  // Handle custom errors
  if (error.statusCode) {
    return res.status(error.statusCode).json({ error: error.message });
  }

  // Handle Sequelize errors
  if (error.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({ error: 'Resource already exists.' });
  }

  if (error.name === 'SequelizeValidationError') {
    return res.status(400).json({ error: error.message });
  }

  // Default to internal server error
  return res.status(500).json({ error: 'Internal server error' });
};

export  {
  BusinessError,
  NotFoundError,
  ValidationError,
  ConflictError,
  handleServiceError
};
