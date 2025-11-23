import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 64;

/**
 * Derives an encryption key from the encryption secret using PBKDF2
 */
function deriveKey(salt: Buffer): Buffer {
  const encryptionSecret = process.env.ENCRYPTION_SECRET || process.env.SESSION_SECRET;
  if (!encryptionSecret) {
    throw new Error("ENCRYPTION_SECRET or SESSION_SECRET must be set for API key encryption");
  }
  return crypto.pbkdf2Sync(encryptionSecret, salt, 100000, 32, "sha256");
}

/**
 * Encrypts an API key for secure storage
 * @param apiKey The plaintext API key to encrypt
 * @returns Encrypted key in format: salt:iv:authTag:encryptedData (all base64)
 */
export function encryptApiKey(apiKey: string): string {
  try {
    // Generate random salt and IV
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Derive key from secret + salt
    const key = deriveKey(salt);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Encrypt the API key
    let encrypted = cipher.update(apiKey, "utf8", "base64");
    encrypted += cipher.final("base64");
    
    // Get auth tag
    const authTag = cipher.getAuthTag();
    
    // Combine salt:iv:authTag:encrypted (all base64)
    return [
      salt.toString("base64"),
      iv.toString("base64"),
      authTag.toString("base64"),
      encrypted
    ].join(":");
  } catch (error) {
    console.error("Encryption error:", error);
    throw new Error("Failed to encrypt API key");
  }
}

/**
 * Decrypts an encrypted API key
 * @param encryptedKey Encrypted key in format: salt:iv:authTag:encryptedData
 * @returns The plaintext API key
 */
export function decryptApiKey(encryptedKey: string): string {
  try {
    // Split the encrypted key components
    const parts = encryptedKey.split(":");
    if (parts.length !== 4) {
      throw new Error("Invalid encrypted key format");
    }
    
    const [saltB64, ivB64, authTagB64, encryptedB64] = parts;
    
    // Convert from base64
    const salt = Buffer.from(saltB64, "base64");
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    
    // Derive the same key
    const key = deriveKey(salt);
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    // Decrypt
    let decrypted = decipher.update(encryptedB64, "base64", "utf8");
    decrypted += decipher.final("utf8");
    
    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error);
    throw new Error("Failed to decrypt API key");
  }
}

/**
 * Validates that a string is properly encrypted
 */
export function isEncrypted(value: string): boolean {
  return value.includes(":") && value.split(":").length === 4;
}
