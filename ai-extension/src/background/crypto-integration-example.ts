/**
 * Crypto Integration Example
 * Demonstrates how to integrate the crypto manager with storage systems
 */

import { getCryptoManager, type EncryptedData } from "./crypto-manager.js";
import { getStorageManager } from "./storage-wrapper.js";
import {
  indexedDBManager,
  type CapturedContent,
  ContentType,
  ProcessingStatus,
} from "./indexeddb-manager.js";

/**
 * Example 1: Encrypting data before storing in chrome.storage.local
 */
export async function storeEncryptedUserPreferences(
  preferences: Record<string, any>,
): Promise<void> {
  const cryptoManager = getCryptoManager();
  const storageManager = getStorageManager();

  // Encrypt the preferences
  const encrypted = await cryptoManager.encrypt(preferences);

  // Store encrypted data
  await storageManager.local.set({
    encryptedPreferences: encrypted,
  });

  console.log("User preferences encrypted and stored");
}

/**
 * Example 2: Retrieving and decrypting data from chrome.storage.local
 */
export async function retrieveEncryptedUserPreferences(): Promise<
  Record<string, any>
> {
  const cryptoManager = getCryptoManager();
  const storageManager = getStorageManager();

  // Retrieve encrypted data
  const stored = await storageManager.local.get<{
    encryptedPreferences: EncryptedData;
  }>("encryptedPreferences");

  if (!stored.encryptedPreferences) {
    throw new Error("No encrypted preferences found");
  }

  // Decrypt the data
  const decrypted = await cryptoManager.decrypt<Record<string, any>>(
    stored.encryptedPreferences,
    true, // Parse as object
  );

  return decrypted;
}

/**
 * Example 3: Encrypting sensitive content before saving to IndexedDB
 */
export async function saveSensitiveContent(
  pocketId: string,
  sensitiveText: string,
  sourceUrl: string,
): Promise<string> {
  const cryptoManager = getCryptoManager();

  // Encrypt the sensitive content
  const encrypted = await cryptoManager.encrypt(sensitiveText);

  // Save to IndexedDB with encrypted content
  const contentId = await indexedDBManager.saveContent({
    pocketId,
    type: ContentType.TEXT,
    content: JSON.stringify(encrypted), // Store as JSON string
    metadata: {
      domain: new URL(sourceUrl).hostname,
      title: "Encrypted Content",
    },
    sourceUrl,
    processingStatus: ProcessingStatus.COMPLETED,
  });

  console.log("Sensitive content encrypted and saved:", contentId);
  return contentId;
}

/**
 * Example 4: Retrieving and decrypting content from IndexedDB
 */
export async function retrieveSensitiveContent(
  contentId: string,
): Promise<string> {
  const cryptoManager = getCryptoManager();

  // Retrieve from IndexedDB
  const content = await indexedDBManager.getContent(contentId);

  if (!content) {
    throw new Error("Content not found");
  }

  // Parse and decrypt
  const encrypted = JSON.parse(content.content as string) as EncryptedData;
  const decrypted = await cryptoManager.decrypt(encrypted);

  return decrypted;
}

/**
 * Example 5: Batch encryption for multiple items
 */
export async function encryptMultipleItems(
  items: Array<{ id: string; data: any }>,
): Promise<Array<{ id: string; encrypted: EncryptedData }>> {
  const cryptoManager = getCryptoManager();

  const encryptedItems = await Promise.all(
    items.map(async (item) => ({
      id: item.id,
      encrypted: await cryptoManager.encrypt(item.data),
    })),
  );

  return encryptedItems;
}

/**
 * Example 6: Secure API key storage
 */
export async function storeAPIKey(
  serviceName: string,
  apiKey: string,
): Promise<void> {
  const cryptoManager = getCryptoManager();
  const storageManager = getStorageManager();

  // Encrypt the API key
  const encrypted = await cryptoManager.encrypt(apiKey);

  // Store with service name as key
  await storageManager.local.set({
    [`apiKey_${serviceName}`]: encrypted,
  });

  console.log(`API key for ${serviceName} encrypted and stored`);
}

/**
 * Example 7: Retrieve API key
 */
export async function retrieveAPIKey(serviceName: string): Promise<string> {
  const cryptoManager = getCryptoManager();
  const storageManager = getStorageManager();

  // Retrieve encrypted API key
  const stored = await storageManager.local.get<{
    [key: string]: EncryptedData;
  }>(`apiKey_${serviceName}`);

  const encrypted = stored[`apiKey_${serviceName}`];
  if (!encrypted) {
    throw new Error(`API key for ${serviceName} not found`);
  }

  // Decrypt and return
  const decrypted = await cryptoManager.decrypt(encrypted);
  return decrypted;
}

/**
 * Example 8: Initialize crypto manager with password-based encryption
 */
export async function initializeWithPassword(password: string): Promise<void> {
  const cryptoManager = getCryptoManager();
  const storageManager = getStorageManager();

  // Generate salt
  const salt = cryptoManager.generateSalt();

  // Store salt (not secret, needed for decryption)
  await storageManager.local.set({
    cryptoSalt: Array.from(salt), // Convert to array for storage
  });

  // Initialize with password
  await cryptoManager.initialize(password, salt);

  console.log("Crypto manager initialized with password");
}

/**
 * Example 9: Initialize crypto manager from stored salt
 */
export async function initializeFromStoredSalt(
  password: string,
): Promise<void> {
  const cryptoManager = getCryptoManager();
  const storageManager = getStorageManager();

  // Retrieve stored salt
  const stored = await storageManager.local.get<{ cryptoSalt: number[] }>(
    "cryptoSalt",
  );

  if (!stored.cryptoSalt) {
    throw new Error("No salt found. Initialize with password first.");
  }

  // Convert array back to Uint8Array
  const salt = new Uint8Array(stored.cryptoSalt);

  // Initialize with password and salt
  await cryptoManager.initialize(password, salt);

  console.log("Crypto manager initialized from stored salt");
}

/**
 * Example 10: Export and backup master key
 */
export async function backupMasterKey(): Promise<void> {
  const cryptoManager = getCryptoManager();
  const storageManager = getStorageManager();

  // Export master key
  const exportedKey = await cryptoManager.exportMasterKey();

  // Store encrypted (in production, this should be further protected)
  await storageManager.local.set({
    masterKeyBackup: exportedKey,
  });

  console.log("Master key backed up");
}

/**
 * Example 11: Restore from backup
 */
export async function restoreFromBackup(): Promise<void> {
  const cryptoManager = getCryptoManager();
  const storageManager = getStorageManager();

  // Retrieve backup
  const stored = await storageManager.local.get<{ masterKeyBackup: string }>(
    "masterKeyBackup",
  );

  if (!stored.masterKeyBackup) {
    throw new Error("No backup found");
  }

  // Import master key
  await cryptoManager.importMasterKey(stored.masterKeyBackup);

  console.log("Master key restored from backup");
}

/**
 * Example 12: Complete workflow - Initialize, encrypt, store, retrieve, decrypt
 */
export async function completeEncryptionWorkflow(): Promise<void> {
  const cryptoManager = getCryptoManager();
  const storageManager = getStorageManager();

  // 1. Initialize crypto manager
  await cryptoManager.initialize();
  console.log("✓ Crypto manager initialized");

  // 2. Prepare sensitive data
  const sensitiveData = {
    userId: "user-123",
    email: "user@example.com",
    apiToken: "secret-token-xyz",
    preferences: {
      theme: "dark",
      notifications: true,
    },
  };

  // 3. Encrypt data
  const encrypted = await cryptoManager.encrypt(sensitiveData);
  console.log("✓ Data encrypted");

  // 4. Store encrypted data
  await storageManager.local.set({ userData: encrypted });
  console.log("✓ Encrypted data stored");

  // 5. Retrieve encrypted data
  const stored = await storageManager.local.get<{ userData: EncryptedData }>(
    "userData",
  );
  console.log("✓ Encrypted data retrieved");

  // 6. Decrypt data
  const decrypted = await cryptoManager.decrypt<typeof sensitiveData>(
    stored.userData,
    true,
  );
  console.log("✓ Data decrypted");

  // 7. Verify data integrity
  if (
    decrypted.userId === sensitiveData.userId &&
    decrypted.email === sensitiveData.email
  ) {
    console.log("✓ Data integrity verified");
  }

  // 8. Clean up
  await storageManager.local.remove("userData");
  console.log("✓ Data cleaned up");
}
