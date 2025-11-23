import { storage } from "./storage";
import { decryptApiKey } from "./keyEncryption";
import { keyManager } from "./keyManager";

/**
 * Selects the appropriate API key for a request
 * Priority:
 * 1. User's own API key (if authenticated and has one)
 * 2. Internal key pool (ONLY for developer: wamkris@gmail.com)
 * 
 * @param provider "youtube" or "claude"
 * @param userId Optional user ID if authenticated
 * @param userEmail Optional user email if authenticated
 * @returns The API key to use, or null if none available
 * @throws Error if non-developer user doesn't have their own keys
 */
export async function selectApiKey(
  provider: "youtube" | "claude",
  userId?: string,
  userEmail?: string
): Promise<{ key: string; source: "user" | "pool" } | null> {
  // Try to use user's key first if they're authenticated
  if (userId) {
    try {
      const userKey = await storage.getUserApiKey(userId, provider);
      if (userKey && userKey.isValid) {
        const decryptedKey = decryptApiKey(userKey.encryptedKey);
        return { key: decryptedKey, source: "user" };
      }
    } catch (error) {
      console.error(`Error getting user ${provider} key:`, error);
      // Fall through to check if developer
    }
  }

  // Only allow pool keys for the developer
  const isDeveloper = userEmail === "wamkris@gmail.com";
  if (!isDeveloper) {
    throw new Error(`Please add your own ${provider === "youtube" ? "YouTube" : "Claude"} API key in Settings to use this feature.`);
  }

  // Fall back to key pool (developer only)
  const poolKey = keyManager.getNextKey(provider);
  if (poolKey) {
    return { key: poolKey, source: "pool" };
  }

  return null;
}

/**
 * Report success or error for a key
 */
export function reportKeyStatus(
  provider: "youtube" | "claude",
  key: string,
  success: boolean,
  error?: string,
  isQuotaError: boolean = false
) {
  if (success) {
    keyManager.reportKeySuccess(provider, key);
  } else {
    keyManager.reportKeyError(provider, key, error || "Unknown error", isQuotaError);
  }
}
