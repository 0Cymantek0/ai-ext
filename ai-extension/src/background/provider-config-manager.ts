import { nanoid } from "nanoid";
import { getCryptoManager, CryptoManager } from "./crypto-manager.js";
import { ChromeLocalStorage, StorageError } from "./storage-wrapper.js";
import { logger } from "./monitoring.js";
import type {
  ProviderType,
  ProviderConfig,
  ProviderConfigStorage,
  ProviderKeyStorage,
  ProviderEndpointMode,
  ProviderTransportOptions,
} from "./provider-types.js";

export const MASTER_KEY_STORAGE_KEY = "master_key";
export const PROVIDER_CONFIGS_KEY = "provider_configs";
export const PROVIDER_KEYS_KEY = "provider_keys";

type ProviderConfigEditableFields = Omit<
  ProviderConfig,
  "id" | "createdAt" | "updatedAt"
>;

export interface AddProviderInput {
  type: ProviderType;
  name: string;
  apiKey?: string;
  enabled?: boolean;
  modelId?: string;
  endpointMode?: ProviderEndpointMode;
  baseUrl?: string;
  apiKeyRequired?: boolean;
  defaultHeaders?: Record<string, string>;
  defaultQueryParams?: Record<string, string>;
  providerOptions?: ProviderTransportOptions;
}

export interface UpdateProviderInput
  extends Partial<ProviderConfigEditableFields> {
  apiKey?: string | null;
}

function getDefaultProviderMetadata(
  type: ProviderType,
): Pick<
  ProviderConfig,
  | "endpointMode"
  | "baseUrl"
  | "apiKeyRequired"
  | "defaultHeaders"
  | "defaultQueryParams"
  | "providerOptions"
> {
  switch (type) {
    case "openai":
      return {
        endpointMode: "native",
        baseUrl: "https://api.openai.com/v1",
        apiKeyRequired: true,
      };
    case "anthropic":
      return {
        endpointMode: "native",
        baseUrl: "https://api.anthropic.com/v1",
        apiKeyRequired: true,
      };
    case "google":
      return {
        endpointMode: "native",
        apiKeyRequired: true,
      };
    case "gemini-nano":
      return {
        endpointMode: "native",
        apiKeyRequired: false,
      };
    case "openrouter":
      return {
        endpointMode: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKeyRequired: true,
        providerOptions: {
          type: "openrouter",
        },
      };
    case "ollama":
      return {
        endpointMode: "openai-compatible",
        baseUrl: "http://localhost:11434/v1",
        apiKeyRequired: false,
        providerOptions: {
          type: "ollama",
          local: true,
        },
      };
    case "groq":
      return {
        endpointMode: "openai-compatible",
        baseUrl: "https://api.groq.com/openai/v1",
        apiKeyRequired: true,
        providerOptions: {
          type: "groq",
          supportsSpeechModels: true,
        },
      };
    case "nvidia":
      return {
        endpointMode: "nvidia-nim",
        baseUrl: "https://integrate.api.nvidia.com/v1",
        apiKeyRequired: true,
        providerOptions: {
          type: "nvidia",
          healthEndpoint: "/health/ready",
          serviceScope: "speech",
        },
      };
    case "custom":
      return {
        endpointMode: "openai-compatible",
        apiKeyRequired: true,
        providerOptions: {
          type: "custom",
          validateModelsEndpoint: false,
        },
      };
  }
}

export class ProviderConfigManager {
  private static instance: ProviderConfigManager | null = null;
  private storage: ChromeLocalStorage;
  private cryptoManager: CryptoManager;
  private initialized = false;

  private constructor() {
    this.storage = new ChromeLocalStorage();
    this.cryptoManager = getCryptoManager();
  }

  public static getInstance(): ProviderConfigManager {
    if (!ProviderConfigManager.instance) {
      ProviderConfigManager.instance = new ProviderConfigManager();
    }
    return ProviderConfigManager.instance;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const result = await this.storage.get<{
        [MASTER_KEY_STORAGE_KEY]?: string;
      }>(MASTER_KEY_STORAGE_KEY);
      const storedKey = result[MASTER_KEY_STORAGE_KEY];

      if (storedKey) {
        await this.cryptoManager.importMasterKey(storedKey);
        logger.info(
          "ProviderConfigManager",
          "Master key imported from storage",
        );
      } else {
        await this.cryptoManager.initialize();
        const newKey = await this.cryptoManager.exportMasterKey();
        await this.storage.set({ [MASTER_KEY_STORAGE_KEY]: newKey });
        logger.info(
          "ProviderConfigManager",
          "New master key generated and stored",
        );
      }

      this.initialized = true;
      logger.info("ProviderConfigManager", "Initialized successfully");
    } catch (error) {
      logger.error("ProviderConfigManager", "Failed to initialize", error);
      if (error instanceof StorageError) {
        throw error;
      }
      throw new Error(
        `Failed to initialize ProviderConfigManager: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        "ProviderConfigManager not initialized. Call initialize() first.",
      );
    }
  }

  private async getStoredProviders(): Promise<ProviderConfig[]> {
    const result =
      await this.storage.get<ProviderConfigStorage>(PROVIDER_CONFIGS_KEY);
    return result[PROVIDER_CONFIGS_KEY] || [];
  }

  private async saveStoredProviders(
    providerConfigs: ProviderConfig[],
  ): Promise<void> {
    await this.storage.set({ [PROVIDER_CONFIGS_KEY]: providerConfigs });
  }

  private async getStoredProviderKeys(): Promise<
    ProviderKeyStorage["provider_keys"]
  > {
    const result =
      await this.storage.get<ProviderKeyStorage>(PROVIDER_KEYS_KEY);
    return result[PROVIDER_KEYS_KEY] || {};
  }

  private async saveStoredProviderKeys(
    providerKeys: ProviderKeyStorage["provider_keys"],
  ): Promise<void> {
    await this.storage.set({ [PROVIDER_KEYS_KEY]: providerKeys });
  }

  private async persistApiKey(
    providerId: string,
    apiKey: string,
    existingApiKeyId?: string,
  ): Promise<string> {
    const apiKeyId = existingApiKeyId || `key_${providerId}`;
    const encryptedKey = await this.cryptoManager.encrypt(apiKey);
    const providerKeys = await this.getStoredProviderKeys();
    providerKeys[apiKeyId] = encryptedKey;
    await this.saveStoredProviderKeys(providerKeys);
    return apiKeyId;
  }

  private async removePersistedApiKey(apiKeyId?: string): Promise<void> {
    if (!apiKeyId) {
      return;
    }

    const providerKeys = await this.getStoredProviderKeys();
    if (providerKeys[apiKeyId]) {
      delete providerKeys[apiKeyId];
      await this.saveStoredProviderKeys(providerKeys);
    }
  }

  public async addProvider(config: AddProviderInput): Promise<ProviderConfig> {
    this.ensureInitialized();

    try {
      const id = `provider_${nanoid()}`;
      const now = Date.now();
      const defaults = getDefaultProviderMetadata(config.type);
      const apiKeyId = config.apiKey
        ? await this.persistApiKey(id, config.apiKey)
        : undefined;
      const resolvedBaseUrl = config.baseUrl ?? defaults.baseUrl;
      const resolvedApiKeyRequired =
        config.apiKeyRequired ?? defaults.apiKeyRequired;
      const resolvedDefaultHeaders =
        config.defaultHeaders ?? defaults.defaultHeaders;
      const resolvedDefaultQueryParams =
        config.defaultQueryParams ?? defaults.defaultQueryParams;
      const resolvedProviderOptions =
        config.providerOptions ?? defaults.providerOptions;

      const newConfig: ProviderConfig = {
        id,
        type: config.type,
        name: config.name,
        enabled: config.enabled ?? true,
        endpointMode: config.endpointMode ?? defaults.endpointMode,
        createdAt: now,
        updatedAt: now,
        ...(apiKeyId ? { apiKeyId } : {}),
        ...(config.modelId ? { modelId: config.modelId } : {}),
        ...(resolvedBaseUrl ? { baseUrl: resolvedBaseUrl } : {}),
        ...(resolvedApiKeyRequired !== undefined
          ? { apiKeyRequired: resolvedApiKeyRequired }
          : {}),
        ...(resolvedDefaultHeaders
          ? { defaultHeaders: resolvedDefaultHeaders }
          : {}),
        ...(resolvedDefaultQueryParams
          ? { defaultQueryParams: resolvedDefaultQueryParams }
          : {}),
        ...(resolvedProviderOptions
          ? { providerOptions: resolvedProviderOptions }
          : {}),
      };

      const providerConfigs = await this.getStoredProviders();
      providerConfigs.push(newConfig);
      await this.saveStoredProviders(providerConfigs);

      logger.info("ProviderConfigManager", "Added new provider", {
        id,
        type: config.type,
        name: config.name,
      });

      return newConfig;
    } catch (error) {
      logger.error("ProviderConfigManager", "Failed to add provider", error);
      throw error;
    }
  }

  public async getProvider(id: string): Promise<ProviderConfig | null> {
    this.ensureInitialized();

    try {
      const providerConfigs = await this.getStoredProviders();
      return providerConfigs.find((config) => config.id === id) || null;
    } catch (error) {
      logger.error("ProviderConfigManager", "Failed to get provider", {
        id,
        error,
      });
      throw error;
    }
  }

  public async listProviders(): Promise<ProviderConfig[]> {
    this.ensureInitialized();

    try {
      return await this.getStoredProviders();
    } catch (error) {
      logger.error("ProviderConfigManager", "Failed to list providers", error);
      throw error;
    }
  }

  public async updateProvider(
    id: string,
    updates: UpdateProviderInput,
  ): Promise<ProviderConfig> {
    this.ensureInitialized();

    try {
      const providerConfigs = await this.getStoredProviders();
      const index = providerConfigs.findIndex((config) => config.id === id);
      if (index === -1) {
        throw new Error(`Provider with ID ${id} not found`);
      }

      const currentConfig = providerConfigs[index]!;
      let apiKeyId = currentConfig.apiKeyId;

      if (updates.apiKey !== undefined) {
        if (updates.apiKey === null || updates.apiKey === "") {
          await this.removePersistedApiKey(currentConfig.apiKeyId);
          apiKeyId = undefined;
        } else {
          apiKeyId = await this.persistApiKey(
            id,
            updates.apiKey,
            currentConfig.apiKeyId,
          );
        }
      }

      const mergedConfig = {
        ...currentConfig,
        ...updates,
        updatedAt: Date.now(),
      };
      delete (mergedConfig as ProviderConfig & { apiKey?: string | null })
        .apiKey;

      const updatedConfig: ProviderConfig = {
        ...mergedConfig,
        ...(apiKeyId ? { apiKeyId } : {}),
      };

      if (!apiKeyId) {
        delete (updatedConfig as ProviderConfig & { apiKeyId?: string })
          .apiKeyId;
      }

      providerConfigs[index] = updatedConfig;
      await this.saveStoredProviders(providerConfigs);

      logger.info("ProviderConfigManager", "Updated provider", {
        id,
        updates: Object.keys(updates),
      });

      return updatedConfig;
    } catch (error) {
      logger.error("ProviderConfigManager", "Failed to update provider", {
        id,
        error,
      });
      throw error;
    }
  }

  public async setProviderEnabled(
    id: string,
    enabled: boolean,
  ): Promise<ProviderConfig> {
    this.ensureInitialized();
    logger.info(
      "ProviderConfigManager",
      `${enabled ? "Enabling" : "Disabling"} provider`,
      {
        id,
      },
    );
    return this.updateProvider(id, { enabled });
  }

  public async deleteProvider(id: string): Promise<void> {
    this.ensureInitialized();

    try {
      const providerConfigs = await this.getStoredProviders();
      const index = providerConfigs.findIndex((config) => config.id === id);
      if (index === -1) {
        throw new Error(`Provider with ID ${id} not found`);
      }

      const config = providerConfigs[index]!;
      await this.removePersistedApiKey(config.apiKeyId);
      providerConfigs.splice(index, 1);
      await this.saveStoredProviders(providerConfigs);

      logger.info("ProviderConfigManager", "Deleted provider", { id });
    } catch (error) {
      logger.error("ProviderConfigManager", "Failed to delete provider", {
        id,
        error,
      });
      throw error;
    }
  }

  public async getDecryptedApiKey(providerId: string): Promise<string | null> {
    this.ensureInitialized();

    try {
      const provider = await this.getProvider(providerId);
      if (!provider?.apiKeyId) {
        return null;
      }

      const providerKeys = await this.getStoredProviderKeys();
      const encryptedData = providerKeys[provider.apiKeyId];
      if (!encryptedData) {
        return null;
      }

      return await this.cryptoManager.decrypt<string>(encryptedData);
    } catch (error) {
      logger.error("ProviderConfigManager", "Failed to decrypt API key", {
        providerId,
        error,
      });
      return null;
    }
  }

  public async setProviderApiKey(
    providerId: string,
    apiKey: string,
  ): Promise<void> {
    this.ensureInitialized();

    try {
      const providerConfigs = await this.getStoredProviders();
      const index = providerConfigs.findIndex(
        (config) => config.id === providerId,
      );
      if (index === -1) {
        throw new Error(`Provider with ID ${providerId} not found`);
      }

      const provider = providerConfigs[index]!;
      provider.apiKeyId = await this.persistApiKey(
        providerId,
        apiKey,
        provider.apiKeyId,
      );
      provider.updatedAt = Date.now();
      await this.saveStoredProviders(providerConfigs);

      logger.info("ProviderConfigManager", "Updated API key for provider", {
        providerId,
        apiKeyId: provider.apiKeyId,
      });
    } catch (error) {
      logger.error("ProviderConfigManager", "Failed to set API key", {
        providerId,
        error,
      });
      throw error;
    }
  }
}

export function getProviderConfigManager(): ProviderConfigManager {
  return ProviderConfigManager.getInstance();
}
