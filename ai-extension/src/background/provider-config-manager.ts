import { nanoid } from "nanoid";
import { getCryptoManager, CryptoManager } from "./crypto-manager.js";
import type { EncryptedData } from "./crypto-manager.js";
import { ChromeLocalStorage, StorageError } from "./storage-wrapper.js";
import { logger } from "./monitoring.js";
import type { 
  ProviderType, 
  ProviderConfig, 
  ProviderConfigStorage, 
  ProviderKeyStorage 
} from "./provider-types.js";

/**
 * Storage keys for provider configurations and keys
 */
export const MASTER_KEY_STORAGE_KEY = "master_key";
export const PROVIDER_CONFIGS_KEY = "provider_configs";
export const PROVIDER_KEYS_KEY = "provider_keys";

/**
 * Provider Config Manager
 * Handles storage and retrieval of AI provider configurations and encrypted API keys.
 * 
 * Features:
 * - Singleton pattern for global access
 * - Master key management for key encryption
 * - CRUD operations for provider settings
 * - Enable/disable providers without data loss
 * - Automatic API key encryption at rest
 * 
 * Requirements: PROV-01, PROV-05, KEYS-02
 */
export class ProviderConfigManager {
  private static instance: ProviderConfigManager | null = null;
  private storage: ChromeLocalStorage;
  private cryptoManager: CryptoManager;
  private initialized = false;

  /**
   * Private constructor for singleton pattern
   */
  private constructor() {
    this.storage = new ChromeLocalStorage();
    this.cryptoManager = getCryptoManager();
  }

  /**
   * Get the singleton instance of ProviderConfigManager
   */
  public static getInstance(): ProviderConfigManager {
    if (!ProviderConfigManager.instance) {
      ProviderConfigManager.instance = new ProviderConfigManager();
    }
    return ProviderConfigManager.instance;
  }

  /**
   * Initialize the manager by loading or generating the master key.
   * This must be called before any other operations.
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Check if master key exists in storage
      const result = await this.storage.get<{ [MASTER_KEY_STORAGE_KEY]?: string }>(MASTER_KEY_STORAGE_KEY);
      const storedKey = result[MASTER_KEY_STORAGE_KEY];

      if (storedKey) {
        // Import existing master key
        await this.cryptoManager.importMasterKey(storedKey);
        logger.info("ProviderConfigManager", "Master key imported from storage");
      } else {
        // Generate and save new master key
        // Initialize with default random key if none exists
        await this.cryptoManager.initialize();
        const newKey = await this.cryptoManager.exportMasterKey();
        await this.storage.set({ [MASTER_KEY_STORAGE_KEY]: newKey });
        logger.info("ProviderConfigManager", "New master key generated and stored");
      }

      this.initialized = true;
      logger.info("ProviderConfigManager", "Initialized successfully");
    } catch (error) {
      logger.error("ProviderConfigManager", "Failed to initialize", error);
      if (error instanceof StorageError) {
        throw error;
      }
      throw new Error(`Failed to initialize ProviderConfigManager: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if the manager is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Helper to ensure the manager is initialized before any operation
   * @throws Error if not initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("ProviderConfigManager not initialized. Call initialize() first.");
    }
  }

  /**
   * Placeholder for CRUD operations to be implemented in subsequent tasks
   */
}

/**
 * Singleton access function for the ProviderConfigManager
 */
export function getProviderConfigManager(): ProviderConfigManager {
  return ProviderConfigManager.getInstance();
}
