/**
 * @description Client-side secret management utilities for browser environments
 * This file is designed to be used in frontend applications
 */

/**
 * Generates a cryptographically secure random secret using Web Crypto API
 * @param {number} length - Length of the secret in bytes (default: 32)
 * @returns {Promise<string>} - Hex-encoded random secret
 */
const generateRandomSecret = async (length = 32) => {
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.getRandomValues) {
    throw new Error('Web Crypto API is not available in this environment');
  }
  
  try {
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    throw new Error(`Failed to generate random secret: ${error.message}`);
  }
};

/**
 * Creates a SHA256 hash of the provided secret using Web Crypto API
 * @param {string} secret - The secret to hash (hex string)
 * @returns {Promise<string>} - SHA256 hash of the secret (hex string)
 */
const createSecretHash = async (secret) => {
  if (!secret || typeof secret !== 'string') {
    throw new Error('Secret must be a non-empty string');
  }
  
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    throw new Error('Web Crypto API SubtleCrypto is not available');
  }
  
  try {
    // Convert hex string to Uint8Array
    const secretBytes = new Uint8Array(secret.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    
    // Create hash
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', secretBytes);
    const hashArray = new Uint8Array(hashBuffer);
    
    // Convert to hex string
    return Array.from(hashArray, byte => byte.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    throw new Error(`Failed to create hash: ${error.message}`);
  }
};

/**
 * Creates a hashlock (hash of secret) - alias for createSecretHash for clarity
 * @param {string} secret - The secret to create hashlock from
 * @returns {Promise<string>} - Hashlock (SHA256 hash)
 */
const createHashlock = async (secret) => {
  return await createSecretHash(secret);
};

/**
 * Stores secret in localStorage with metadata
 * @param {string} key - Storage key (e.g., order ID or transaction ID)
 * @param {string} secret - The secret to store
 * @param {Object} metadata - Additional metadata to store
 * @returns {boolean} - True if successful
 */
const storeSecretToLocalStorage = (key, secret, metadata = {}) => {
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
      createdAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      ...metadata
    };
    
    localStorage.setItem(`cardano_swap_secret_${key}`, JSON.stringify(secretData));
    
    // Also store an index for easier management
    const existingIndex = JSON.parse(localStorage.getItem('cardano_swap_secret_index') || '[]');
    if (!existingIndex.includes(key)) {
      existingIndex.push(key);
      localStorage.setItem('cardano_swap_secret_index', JSON.stringify(existingIndex));
    }
    
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
    const storedData = localStorage.getItem(`cardano_swap_secret_${key}`);
    if (!storedData) {
      return null;
    }
    
    const secretData = JSON.parse(storedData);
    return {
      secret: secretData.secret,
      timestamp: secretData.timestamp,
      createdAt: secretData.createdAt,
      userAgent: secretData.userAgent,
      url: secretData.url,
      metadata: secretData.metadata || {}
    };
  } catch (error) {
    throw new Error(`Failed to retrieve secret: ${error.message}`);
  }
};

/**
 * Removes secret from localStorage and updates index
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
    localStorage.removeItem(`cardano_swap_secret_${key}`);
    
    // Update index
    const existingIndex = JSON.parse(localStorage.getItem('cardano_swap_secret_index') || '[]');
    const updatedIndex = existingIndex.filter(k => k !== key);
    localStorage.setItem('cardano_swap_secret_index', JSON.stringify(updatedIndex));
    
    return true;
  } catch (error) {
    throw new Error(`Failed to remove secret: ${error.message}`);
  }
};

/**
 * Lists all stored secrets with metadata (excludes actual secret values)
 * @returns {Array} - Array of secret metadata
 */
const listStoredSecrets = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('localStorage is not available in this environment');
  }
  
  try {
    const index = JSON.parse(localStorage.getItem('cardano_swap_secret_index') || '[]');
    return index.map(key => {
      const data = getSecretFromLocalStorage(key);
      if (data) {
        return {
          key,
          timestamp: data.timestamp,
          createdAt: data.createdAt,
          hasSecret: !!data.secret,
          url: data.url,
          userAgent: data.userAgent
        };
      }
      return null;
    }).filter(Boolean);
  } catch (error) {
    throw new Error(`Failed to list stored secrets: ${error.message}`);
  }
};

/**
 * Clears all stored secrets and index
 * @returns {number} - Number of secrets cleared
 */
const clearAllStoredSecrets = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('localStorage is not available in this environment');
  }
  
  try {
    const index = JSON.parse(localStorage.getItem('cardano_swap_secret_index') || '[]');
    
    // Remove all secret entries
    index.forEach(key => {
      localStorage.removeItem(`cardano_swap_secret_${key}`);
    });
    
    // Clear the index
    localStorage.removeItem('cardano_swap_secret_index');
    
    return index.length;
  } catch (error) {
    throw new Error(`Failed to clear secrets: ${error.message}`);
  }
};

/**
 * Validates if a secret matches a given hashlock
 * @param {string} secret - The secret to validate
 * @param {string} hashlock - The expected hashlock
 * @returns {Promise<boolean>} - True if secret matches hashlock
 */
const validateSecretAgainstHashlock = async (secret, hashlock) => {
  if (!secret || !hashlock) {
    return false;
  }
  
  try {
    const computedHash = await createSecretHash(secret);
    return computedHash === hashlock;
  } catch (error) {
    return false;
  }
};

/**
 * Generates a complete secret package for atomic swap
 * @param {string} orderId - Order ID to associate with the secret
 * @param {Object} metadata - Additional metadata
 * @returns {Promise<Object>} - Complete secret package
 */
const generateSecretPackage = async (orderId, metadata = {}) => {
  if (!orderId) {
    throw new Error('Order ID is required');
  }
  
  try {
    const secret = await generateRandomSecret();
    const hashlock = await createHashlock(secret);
    
    const packageData = {
      orderId,
      secret,
      hashlock,
      timestamp: Date.now(),
      createdAt: new Date().toISOString(),
      ...metadata
    };
    
    // Store in localStorage
    storeSecretToLocalStorage(orderId, secret, metadata);
    
    return packageData;
  } catch (error) {
    throw new Error(`Failed to generate secret package: ${error.message}`);
  }
};

/**
 * Export utilities for browser environment
 */
if (typeof window !== 'undefined') {
  window.CardanoSwapSecretManager = {
    generateRandomSecret,
    createSecretHash,
    createHashlock,
    storeSecretToLocalStorage,
    getSecretFromLocalStorage,
    removeSecretFromLocalStorage,
    listStoredSecrets,
    clearAllStoredSecrets,
    validateSecretAgainstHashlock,
    generateSecretPackage
  };
}

// CommonJS export for Node.js environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateRandomSecret,
    createSecretHash,
    createHashlock,
    storeSecretToLocalStorage,
    getSecretFromLocalStorage,
    removeSecretFromLocalStorage,
    listStoredSecrets,
    clearAllStoredSecrets,
    validateSecretAgainstHashlock,
    generateSecretPackage
  };
}
