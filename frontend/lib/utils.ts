import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { randomBytes } from 'crypto';
import crypto from 'crypto';
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Generate a random secret
export function generateRandomSecret(): string {
  return randomBytes(32).toString('hex');
}

// Compute the hashlock of a secret using SHA-256
export async function computeHashlock(secret: string): Promise<string> {
  const hash = createSecretHash(secret);
  if (hash.length !== 64) {
    throw new Error(`Invalid hash length: Expected 64 characters, got ${hash.length}`);
  }
  return `0x${hash}`;
}

export const createSecretHash = (secret: string) => {
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
    throw new Error(`Failed to create hash: ${error as any}`);
  }
};
// Store the secret in local storage
export function storeSecretInLocalStorage(key: string, secret: string): void {
  localStorage.setItem(key, secret);
}

// Retrieve an item from local storage
export function getSecretFromLocalStorage(key: string): string | null {
  return localStorage.getItem(key);
}
