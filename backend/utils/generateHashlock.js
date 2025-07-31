import crypto from 'crypto';

/**
 * Generate a random secret and its SHA-256 hashlock
 * @returns {Object} Object containing secret and hashlock
 */
function generateHashlock() {
    // Generate a random 32-byte secret
    const secret = crypto.randomBytes(32);
    
    // Create SHA-256 hash of the secret
    const hashlock = crypto.createHash('sha256').update(secret).digest('hex');
    
    return {
        secret: secret.toString('hex'),
        hashlock: hashlock,
        secretBytes: secret.length,
        hashlockBytes: hashlock.length / 2
    };
}

// Generate and display the hashlock
const result = generateHashlock();

console.log('=== Random Hashlock Generator ===');
console.log('Secret (hex):', result.secret);
console.log('Hashlock (SHA-256):', result.hashlock);
console.log('Secret length:', result.secretBytes, 'bytes');
console.log('Hashlock length:', result.hashlockBytes, 'bytes');
console.log('');
console.log('For your order creation:');
console.log('hashlock:', `"${result.hashlock}"`);

export { generateHashlock };
