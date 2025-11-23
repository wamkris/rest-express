/**
 * Key Manager for Multi-Key Rotation and BYOK Support
 * 
 * This module manages API keys for both internal testing (multi-key rotation)
 * and user BYOK (Bring Your Own Key) scenarios.
 */

interface KeyStatus {
  keyId: string;
  isAvailable: boolean;
  quotaExceeded: boolean;
  lastError: string | null;
  errorCount: number;
  lastUsed: Date | null;
}

interface KeyPool {
  keys: Map<string, { key: string; status: KeyStatus }>;
  currentIndex: number;
}

class KeyRotationManager {
  private youtubePools: KeyPool;
  private claudePools: KeyPool;

  constructor() {
    this.youtubePools = this.initializePool("youtube");
    this.claudePools = this.initializePool("claude");
  }

  /**
   * Initialize a key pool from environment variables
   * Supports YOUTUBE_API_KEY_1, YOUTUBE_API_KEY_2, etc.
   * and CLAUDE_API_KEY_1, CLAUDE_API_KEY_2, etc.
   */
  private initializePool(provider: "youtube" | "claude"): KeyPool {
    const keys = new Map<string, { key: string; status: KeyStatus }>();
    let index = 1;
    
    // Load keys from environment
    const envPrefix = provider === "youtube" 
      ? ["YOUTUBE_API_KEY", "GOOGLE_API_KEY"] 
      : ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"];
    
    // Add base keys (without number suffix)
    for (const prefix of envPrefix) {
      const baseKey = process.env[prefix];
      if (baseKey) {
        const keyId = `${provider}_default`;
        keys.set(keyId, {
          key: baseKey,
          status: {
            keyId,
            isAvailable: true,
            quotaExceeded: false,
            lastError: null,
            errorCount: 0,
            lastUsed: null,
          }
        });
        break; // Only use the first available base key
      }
    }
    
    // Add numbered keys for rotation (e.g., YOUTUBE_API_KEY_1, YOUTUBE_API_KEY_2)
    while (true) {
      let found = false;
      for (const prefix of envPrefix) {
        const key = process.env[`${prefix}_${index}`];
        if (key) {
          const keyId = `${provider}_${index}`;
          keys.set(keyId, {
            key,
            status: {
              keyId,
              isAvailable: true,
              quotaExceeded: false,
              lastError: null,
              errorCount: 0,
              lastUsed: null,
            }
          });
          found = true;
          break;
        }
      }
      if (!found) break;
      index++;
    }

    console.log(`Initialized ${provider} key pool with ${keys.size} key(s)`);
    
    return {
      keys,
      currentIndex: 0,
    };
  }

  /**
   * Get the next available key from the pool
   * Implements round-robin rotation and skips quota-exceeded keys
   */
  getNextKey(provider: "youtube" | "claude"): string | null {
    const pool = provider === "youtube" ? this.youtubePools : this.claudePools;
    
    if (pool.keys.size === 0) {
      console.error(`No ${provider} keys configured`);
      return null;
    }

    const keyArray = Array.from(pool.keys.values());
    const startIndex = pool.currentIndex;
    
    // Try to find an available key
    for (let i = 0; i < keyArray.length; i++) {
      const index = (startIndex + i) % keyArray.length;
      const keyData = keyArray[index];
      
      if (keyData.status.isAvailable && !keyData.status.quotaExceeded) {
        pool.currentIndex = (index + 1) % keyArray.length;
        keyData.status.lastUsed = new Date();
        return keyData.key;
      }
    }

    // All keys are unavailable or quota exceeded
    // Return the least recently used key as a fallback
    console.warn(`All ${provider} keys unavailable, returning fallback`);
    const fallback = keyArray[pool.currentIndex];
    pool.currentIndex = (pool.currentIndex + 1) % keyArray.length;
    fallback.status.lastUsed = new Date();
    return fallback.key;
  }

  /**
   * Report an error for a specific key
   */
  reportKeyError(provider: "youtube" | "claude", key: string, error: string, isQuotaError: boolean = false) {
    const pool = provider === "youtube" ? this.youtubePools : this.claudePools;
    
    for (const [keyId, keyData] of Array.from(pool.keys.entries())) {
      if (keyData.key === key) {
        keyData.status.errorCount++;
        keyData.status.lastError = error;
        
        if (isQuotaError) {
          keyData.status.quotaExceeded = true;
          console.warn(`Key ${keyId} marked as quota exceeded`);
        }
        
        // Mark key as unavailable if it has too many errors
        if (keyData.status.errorCount >= 3 && !isQuotaError) {
          keyData.status.isAvailable = false;
          console.warn(`Key ${keyId} marked as unavailable after ${keyData.status.errorCount} errors`);
        }
        
        break;
      }
    }
  }

  /**
   * Mark a key as working (clears error count)
   */
  reportKeySuccess(provider: "youtube" | "claude", key: string) {
    const pool = provider === "youtube" ? this.youtubePools : this.claudePools;
    
    for (const keyData of Array.from(pool.keys.values())) {
      if (keyData.key === key) {
        keyData.status.errorCount = 0;
        keyData.status.lastError = null;
        keyData.status.isAvailable = true;
        // Don't clear quotaExceeded - that requires manual reset or time-based reset
        break;
      }
    }
  }

  /**
   * Get status of all keys in a pool (for monitoring/debugging)
   */
  getPoolStatus(provider: "youtube" | "claude"): KeyStatus[] {
    const pool = provider === "youtube" ? this.youtubePools : this.claudePools;
    return Array.from(pool.keys.values()).map(kd => kd.status);
  }

  /**
   * Reset quota exceeded status (call this when quota resets, e.g., daily)
   */
  resetQuotaStatus(provider: "youtube" | "claude") {
    const pool = provider === "youtube" ? this.youtubePools : this.claudePools;
    for (const keyData of Array.from(pool.keys.values())) {
      keyData.status.quotaExceeded = false;
    }
    console.log(`Reset quota status for all ${provider} keys`);
  }
}

// Singleton instance
export const keyManager = new KeyRotationManager();
