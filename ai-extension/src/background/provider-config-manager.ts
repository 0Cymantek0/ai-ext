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
   * Add a new provider configuration.
   * If an API key is provided, it is encrypted before storage.
   * 
   * @param config - Provider configuration data
   * @returns The newly created ProviderConfig
   */
  public async addProvider(config: {
    type: ProviderType;
    name: string;
    apiKey?: string;
    enabled?: boolean;
  }): Promise<ProviderConfig> {
    this.ensureInitialized();

    try {
      const id = `provider_${nanoid()}`;
      const apiKeyId = `key_${id}`;
      const now = Date.now();

      // 1. Encrypt API key if provided
      if (config.apiKey) {
        const encryptedKey = await this.cryptoManager.encrypt(config.apiKey);
        const keyResult = await this.storage.get<ProviderKeyStorage>(PROVIDER_KEYS_KEY);
        const providerKeys = keyResult[PROVIDER_KEYS_KEY] || {};
        
        providerKeys[apiKeyId] = encryptedKey;
        await this.storage.set({ [PROVIDER_KEYS_KEY]: providerKeys });
        logger.debug("ProviderConfigManager", "Encrypted API key stored", { apiKeyId });
      }

      // 2. Create and store provider config
      const newConfig: ProviderConfig = {
        id,
        type: config.type,
        name: config.name,
        enabled: config.enabled ?? true,
        apiKeyId,
        createdAt: now,
        updatedAt: now
      };

      const configResult = await this.storage.get<ProviderConfigStorage>(PROVIDER_CONFIGS_KEY);
      const providerConfigs = configResult[PROVIDER_CONFIGS_KEY] || [];
      
      providerConfigs.push(newConfig);
      await this.storage.set({ [PROVIDER_CONFIGS_KEY]: providerConfigs });

      logger.info("ProviderConfigManager", "Added new provider", { 
        id, 
        type: config.type, 
        name: config.name 
      });

      return newConfig;
    } catch (error) {
      logger.error("ProviderConfigManager", "Failed to add provider", error);
      throw error;
    }
  }

  /**
   * Get a provider configuration by ID.
   * 
   * @param id - Provider ID to look up
   * @returns The ProviderConfig if found, otherwise null
   */
  public async getProvider(id: string): Promise<ProviderConfig | null> {
    this.ensureInitialized();

    try {
      const result = await this.storage.get<ProviderConfigStorage>(PROVIDER_CONFIGS_KEY);
      const providerConfigs = result[PROVIDER_CONFIGS_KEY] || [];
      
      const config = providerConfigs.find(c => c.id === id);
      return config || null;
    } catch (error) {
      logger.error("ProviderConfigManager", "Failed to get provider", { id, error });
      throw error;
    }
  }

  /**
   * List all stored provider configurations.
   * 
   * @returns Array of all ProviderConfig objects
   */
  public async listProviders(): Promise<ProviderConfig[]> {
    this.ensureInitialized();

    try {
      const result = await this.storage.get<ProviderConfigStorage>(PROVIDER_CONFIGS_KEY);
      return result[PROVIDER_CONFIGS_KEY] || [];
    } catch (error) {
      logger.error("ProviderConfigManager", "Failed to list providers", error);
      throw error;
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
