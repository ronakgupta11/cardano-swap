const crypto = require('crypto');

/**
 * @description Utility functions for secret management in cross-chain atomic swaps
 * This includes generating secrets, creating hashes, and localStorage operations
 */

/**
 * Generates a cryptographically secure random secret
 * @param {number} length - Length of the secret in bytes (default: 32)
 * @returns {string} - Hex-encoded random secret
 */
const generateRandomSecret = (length = 32) => {
  try {
    const secret = crypto.randomBytes(length);
    return secret.toString('hex');
  } catch (error) {
    throw new Error(`Failed to generate random secret: ${error.message}`);
  }
};

/**
 * Creates a SHA256 hash of the provided secret
 * @param {string} secret - The secret to hash (hex string)
 * @returns {string} - SHA256 hash of the secret (hex string)
 */
const createSecretHash = (secret) => {
  if (!secret || typeof secret !== 'string') {
    throw new Error('Secret must be a non-empty string');
  }
  
  try {
    // Convert hex string to buffer if needed
    const secretBuffer = Buffer.isBuffer(secret) ? secret : Buffer.from(secret, 'hex');
    const hash = crypto.createHash('sha256');
    hash.update(secretBuffer);
    return hash.digest('hex');
  } catch (error) {
    throw new Error(`Failed to create hash: ${error.message}`);
  }
};

/**
 * Creates a hashlock (hash of secret) - alias for createSecretHash for clarity
 * @param {string} secret - The secret to create hashlock from
 * @returns {string} - Hashlock (SHA256 hash)
 */
const createHashlock = (secret) => {
  return createSecretHash(secret);
};

/**
 * Stores secret in localStorage (browser environment)
 * @param {string} key - Storage key (e.g., order ID or transaction ID)
 * @param {string} secret - The secret to store
 * @returns {boolean} - True if successful
 */
const storeSecretToLocalStorage = (key, secret) => {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('localStorage is not available in this environment');
  }
  
  if (!key || !secret) {
    throw new Error('Both key and secret are required');
  }
  
  try {
    const secretData = {
      secret: secret,
      timestamp: Date.now(),
      createdAt: new Date().toISOString()
    };
    
    localStorage.setItem(`swap_secret_${key}`, JSON.stringify(secretData));
    return true;
  } catch (error) {
    throw new Error(`Failed to store secret: ${error.message}`);
  }
};

/**
 * Retrieves secret from localStorage
 * @param {string} key - Storage key
 * @returns {Object|null} - Secret data object or null if not found
 */
const getSecretFromLocalStorage = (key) => {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('localStorage is not available in this environment');
  }
  
  if (!key) {
    throw new Error('Key is required');
  }
  
  try {
    const storedData = localStorage.getItem(`swap_secret_${key}`);
    if (!storedData) {
      return null;
    }
    
    const secretData = JSON.parse(storedData);
    return {
      secret: secretData.secret,
      timestamp: secretData.timestamp,
      createdAt: secretData.createdAt
    };
  } catch (error) {
    throw new Error(`Failed to retrieve secret: ${error.message}`);
  }
};

/**
 * Removes secret from localStorage
 * @param {string} key - Storage key
 * @returns {boolean} - True if successful
 */
const removeSecretFromLocalStorage = (key) => {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('localStorage is not available in this environment');
  }
  
  if (!key) {
    throw new Error('Key is required');
  }
  
  try {
    localStorage.removeItem(`swap_secret_${key}`);
    return true;
  } catch (error) {
    throw new Error(`Failed to remove secret: ${error.message}`);
  }
};

/**
 * Lists all stored secrets (keys only for security)
 * @returns {Array} - Array of storage keys
 */
const listStoredSecretKeys = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('localStorage is not available in this environment');
  }
  
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('swap_secret_')) {
        keys.push(key.replace('swap_secret_', ''));
      }
    }
    return keys;
  } catch (error) {
    throw new Error(`Failed to list secret keys: ${error.message}`);
  }
};

/**
 * Clears all stored secrets
 * @returns {number} - Number of secrets cleared
 */
const clearAllStoredSecrets = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('localStorage is not available in this environment');
  }
  
  try {
    const keys = listStoredSecretKeys();
    keys.forEach(key => {
      localStorage.removeItem(`swap_secret_${key}`);
    });
    return keys.length;
  } catch (error) {
    throw new Error(`Failed to clear secrets: ${error.message}`);
  }
};

/**
 * Validates if a secret matches a given hashlock
 * @param {string} secret - The secret to validate
 * @param {string} hashlock - The expected hashlock
 * @returns {boolean} - True if secret matches hashlock
 */
const validateSecretAgainstHashlock = (secret, hashlock) => {
  if (!secret || !hashlock) {
    return false;
  }
  
  try {
    const computedHash = createSecretHash(secret);
    return computedHash === hashlock;
  } catch (error) {
    return false;
  }
};

/**
 * Generates a complete secret package for atomic swap
 * @param {string} orderId - Order ID to associate with the secret
 * @returns {Object} - Complete secret package
 */
const generateSecretPackage = (orderId) => {
  if (!orderId) {
    throw new Error('Order ID is required');
  }
  
  try {
    const secret = generateRandomSecret();
    const hashlock = createHashlock(secret);
    
    // Store in localStorage if available
    if (typeof window !== 'undefined' && window.localStorage) {
      storeSecretToLocalStorage(orderId, secret);
    }
    
    return {
      orderId,
      secret,
      hashlock,
      timestamp: Date.now(),
      createdAt: new Date().toISOString()
    };
  } catch (error) {
    throw new Error(`Failed to generate secret package: ${error.message}`);
  }
};


module.exports = {
  generateRandomSecret,
  createSecretHash,
  createHashlock,
  storeSecretToLocalStorage,
  getSecretFromLocalStorage,
  removeSecretFromLocalStorage,
  listStoredSecretKeys,
  clearAllStoredSecrets,
  validateSecretAgainstHashlock,
  generateSecretPackage
};
