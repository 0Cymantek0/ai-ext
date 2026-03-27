---
phase: 01-foundation
plan: 02
type: execute
wave: 2
depends_on: [01-PLAN]
files_modified:
  - ai-extension/src/background/provider-config-manager.ts
  - ai-extension/tests/provider-config-manager.test.ts
autonomous: true
requirements: [PROV-01, PROV-05]  # CRUD and enable/disable functionality
user_setup: []

must_haves:
  truths:
    - "Provider configs can be added with name, type, enabled status"
    - "Provider configs persist in chrome.storage.local"
    - "Provider configs can be retrieved by ID"
    - "Provider configs can be listed"
    - "Provider configs can be updated"
    - "Provider configs can be deleted"
    - "User can enable/disable individual providers without deleting configuration"
  artifacts:
    - path: "ai-extension/src/background/provider-config-manager.ts"
      provides: "CRUD operations for provider configurations"
      contains: "class ProviderConfigManager"
      exports: ["ProviderConfigManager", "getProviderConfigManager"]
      min_lines: 100
  key_links:
    - from: "ai-extension/src/background/provider-config-manager.ts"
      to: "ai-extension/src/background/storage-wrapper.ts"
      via: "ChromeLocalStorage"
      pattern: "this.storage = new ChromeLocalStorage"
    - from: "ai-extension/src/background/provider-config-manager.ts"
      to: "ai-extension/src/background/crypto-manager.ts"
      via: "CryptoManager import"
      pattern: "getCryptoManager\\(\\)"
---

<objective>
Implement the ProviderConfigManager class with CRUD operations for provider configurations using existing crypto-manager and storage-wrapper infrastructure.

Purpose: Create the manager that handles provider config storage, including master key initialization, CRUD operations, and enable/disable functionality.
Output: Working ProviderConfigManager class
</objective>

<execution_context>
@C:/Users/shuvagata/Documents/dev/ai-ext/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/shuvagata/Documents/dev/ai-ext/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/01-foundation/01-CONTEXT.md
@.planning/phases/01-foundation/01-RESEARCH.md

@ai-extension/src/background/provider-types.ts
@ai-extension/src/background/crypto-manager.ts
@ai-extension/src/background/storage-wrapper.ts

<interfaces>
<!-- Key interfaces from existing codebase that executor needs -->

From ai-extension/src/background/crypto-manager.ts:
```typescript
export class CryptoManager {
  async initialize(password?: string, salt?: Uint8Array): Promise<void>;
  async encrypt(data: string | object): Promise<EncryptedData>;
  async decrypt<T = string>(encryptedData: EncryptedData, returnAsObject?: boolean): Promise<T>;
  async exportMasterKey(): Promise<string>;
  async importMasterKey(keyBase64: string): Promise<void>;
  isInitialized(): boolean;
  clear(): void;
}

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  salt: string;
  algorithm: "AES-GCM";
  version: number;
}
export function getCryptoManager(): CryptoManager
```

From ai-extension/src/background/storage-wrapper.ts:
```typescript
export class ChromeLocalStorage {
  async get<T = any>(keys?: string | string[] | null): Promise<T>;
  async set(items: Record<string, any>): Promise<void>;
  async remove(keys: string | string[]): Promise<void>
  async clear(): Promise<void>
  async getBytesInUse(keys?: string | string[]): Promise<number>
  async getQuota(): Promise<StorageQuota>
  async hasSpace(estimatedBytes: number): Promise<boolean>
  estimateSize(data: any): number
  async cleanup(options?: { removeKeys?: string[]; keepMostRecent?: number; minBytesToFree?: number }): Promise<{ bytesFreed: number; itemsRemoved: number }>;
}
```

From ai-extension/src/background/provider-types.ts (created in Plan 01):
```typescript
// Provider types per D-04, d-05, d-06
export type ProviderType = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'ollama' | 'groq' | 'nvidia' | 'custom';

export interface ProviderConfig {
  id: string;
  type: ProviderType;
  name: string;
  enabled: boolean;
  apiKeyId: string;
  createdAt: number;
  updatedAt: number;
}

// Storage shape for provider configs
export interface ProviderConfigStorage {
  provider_configs: ProviderConfig[];
}

// Storage shape for encrypted API keys
export interface ProviderKeyStorage {
  provider_keys: Record<string, EncryptedData>; // apiKeyId -> EncryptedData
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Implement ProviderConfigManager class skeleton</name>
  <files>ai-extension/src/background/provider-config-manager.ts</files>
  <read_first>
    - ai-extension/src/background/crypto-manager.ts
    - ai-extension/src/background/storage-wrapper.ts
    - ai-extension/src/background/provider-types.ts
  </read_first>
  <action>
Create `ai-extension/src/background/provider-config-manager.ts` with the class skeleton implementing singleton pattern per D-04 through D-09 from CONTEXT.md:

1. Import dependencies: nanoid, getCryptoManager, CryptoManager, EncryptedData, ChromeLocalStorage, StorageError, logger, provider types
2. Define storage keys as constants: MASTER_KEY_STORAGE_KEY, PROVIDER_CONFIGS_KEY, PROVIDER_KEYS_KEY
3. Create ProviderConfigManager class with:
   - Private constructor with cryptoManager, storage, and initialized fields
   - Private async initialize() method that loads/generates master key
   - Private ensureInitialized() helper that throws if not initialized
   - Public static getInstance() or getProviderConfigManager() for singleton access
4. Export getProviderConfigManager() function

Follow the singleton pattern from crypto-manager.ts and storage patterns from storage-wrapper.ts.
  </action>
  <verify>
    <automated>cd ai-extension && npx tsc --noEmit && grep -n "class ProviderConfigManager" ai-extension/src/background/provider-config-manager.ts</automated>
  </verify>
  <done>
    - File exists at ai-extension/src/background/provider-config-manager.ts
    - File contains `class ProviderConfigManager` with private fields
    - File exports `getProviderConfigManager()` singleton function
    - File contains `async initialize()` method with master key logic
    - File contains `ensureInitialized()` helper method
    - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Implement addProvider method</name>
  <files>ai-extension/src/background/provider-config-manager.ts</files>
  <read_first>
    - ai-extension/src/background/provider-config-manager.ts
    - ai-extension/src/background/provider-types.ts
  </read_first>
  <action>
Add the addProvider method to ProviderConfigManager class per D-04, d-05, d-06:

1. Generate unique id using `nanoid()` with format `provider_${nanoid()}`
2. Generate apiKeyId with format `key_${id}` for encrypted key reference
3. If apiKey provided, encrypt it using cryptoManager.encrypt()
4. Store encrypted key in provider_keys storage (key: apiKeyId, value: encryptedData)
5. Create ProviderConfig object with all required fields
6. Append to provider_configs array and save to storage
7. Return the created ProviderConfig

Signature:
```typescript
public async addProvider(config: {
  type: ProviderType;
  name: string;
  apiKey?: string;
  enabled?: boolean;
}): Promise<ProviderConfig>
```
  </action>
  <verify>
    <automated>cd ai-extension && grep -n "async addProvider" ai-extension/src/background/provider-config-manager.ts</automated>
  </verify>
  <done>
    - addProvider method exists and accepts type, name, optional apiKey, optional enabled
    - API key is encrypted before storage if provided
    - Provider config saved to provider_configs in chrome.storage.local
    - Returns complete ProviderConfig object with generated id
  </done>
</task>

<task type="auto">
  <name>Task 3: Implement getProvider and listProviders methods</name>
  <files>ai-extension/src/background/provider-config-manager.ts</files>
  <read_first>
    - ai-extension/src/background/provider-config-manager.ts
  </read_first>
  <action>
Add read methods to ProviderConfigManager class:

1. **getProvider(id: string): Promise<ProviderConfig | null>**
   - Call ensureInitialized()
   - Load provider_configs from storage
   - Find and return config by id, or null if not found

2. **listProviders(): Promise<ProviderConfig[]>**
   - Call ensureInitialized()
   - Load provider_configs from storage
   - Return array (empty array if none exist)
  </action>
  <verify>
    <automated>cd ai-extension && grep -n "async getProvider\|async listProviders" ai-extension/src/background/provider-config-manager.ts</automated>
  </verify>
  <done>
    - getProvider method returns ProviderConfig or null
    - listProviders method returns ProviderConfig[] (never null, empty array if none)
    - Both methods call ensureInitialized()
    - Both methods read from chrome.storage.local
  </done>
</task>

<task type="auto">
  <name>Task 4: Implement updateProvider method</name>
  <files>ai-extension/src/background/provider-config-manager.ts</files>
  <read_first>
    - ai-extension/src/background/provider-config-manager.ts
    - ai-extension/src/background/provider-types.ts
  </read_first>
  <action>
Add updateProvider method per D-05 (enable/disable without deleting):

1. Call ensureInitialized()
2. Load provider_configs from storage
3. Find config by id, throw Error if not found
4. Update only allowed fields: name and enabled (per D-05)
5. Set updatedAt to Date.now()
6. Save updated array to storage
7. Return updated ProviderConfig

Signature:
```typescript
public async updateProvider(
  id: string,
  updates: Partial<Pick<ProviderConfig, 'name' | 'enabled'>>
): Promise<ProviderConfig>
```
  </action>
  <verify>
    <automated>cd ai-extension && grep -n "async updateProvider" ai-extension/src/background/provider-config-manager.ts</automated>
  </verify>
  <done>
    - updateProvider accepts id and Partial updates for name, enabled only
    - Throws Error if provider not found
    - Only updates allowed fields (name, enabled)
    - Sets updatedAt timestamp automatically
    - Returns updated ProviderConfig
  </done>
</task>

<task type="auto">
  <name>Task 5: Implement setProviderEnabled method</name>
  <files>ai-extension/src/background/provider-config-manager.ts</files>
  <read_first>
    - ai-extension/src/background/provider-config-manager.ts
  </read_first>
  <action>
Add setProviderEnabled method per PROV-05 - convenience method for toggling enabled status:

1. Call ensureInitialized()
2. Load provider_configs from storage
3. Find config by id, throw Error if not found
4. Update enabled field to the provided boolean
5. Set updatedAt to Date.now()
6. Save to storage
7. Log the change
8. Return updated ProviderConfig

Signature:
```typescript
public async setProviderEnabled(id: string, enabled: boolean): Promise<ProviderConfig>
```
  </action>
  <verify>
    <automated>cd ai-extension && grep -n "async setProviderEnabled" ai-extension/src/background/provider-config-manager.ts</automated>
  </verify>
  <done>
    - setProviderEnabled accepts id and enabled boolean
    - Throws Error if provider not found
    - Only toggles enabled boolean
    - Sets updatedAt timestamp
    - Returns updated ProviderConfig
  </done>
</task>

<task type="auto">
  <name>Task 6: Implement deleteProvider method</name>
  <files>ai-extension/src/background/provider-config-manager.ts</files>
  <read_first>
    - ai-extension/src/background/provider-config-manager.ts
  </read_first>
  <action>
Add deleteProvider method that removes both config and encrypted key:

1. Call ensureInitialized()
2. Load provider_configs from storage
3. Find config by id, throw Error if not found
4. Get the apiKeyId from the config
5. Load provider_keys from storage
6. Delete the encrypted key entry for apiKeyId
7. Remove config from provider_configs array
8. Save both updated provider_configs and provider_keys to storage
9. Log the deletion

Signature:
```typescript
public async deleteProvider(id: string): Promise<void>
```
  </action>
  <verify>
    <automated>cd ai-extension && grep -n "async deleteProvider" ai-extension/src/background/provider-config-manager.ts</automated>
  </verify>
  <done>
    - deleteProvider removes both config and associated encrypted key
    - Throws Error if provider not found
    - Cleans up orphaned encrypted keys
    - Updates both provider_configs and provider_keys storage
  </done>
</task>

</tasks>

<verification>
- All methods call `ensureInitialized()` before operations
- TypeScript compiles without errors: `cd ai-extension && npx tsc --noEmit`
- All CRUD methods implemented
</verification>

<success_criteria>
- ProviderConfigManager class exists with all CRUD methods
- All methods use ChromeLocalStorage (never ChromeSyncStorage per KEYS-02)
- delete operation removes orphaned encrypted keys
- TypeScript compiles without errors
- setProviderEnabled provides PROV-05 enable/disable functionality
</success_criteria>

<output>
After completion, create `.planning/phases/01-foundation/01-02-SUMMARY.md`
</output>
