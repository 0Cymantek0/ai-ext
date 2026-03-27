---
phase: 01-foundation
plan: 03
type: execute
wave: 3
depends_on: [01-PLAN, 02-PLAN]
files_modified:
  - ai-extension/src/background/provider-config-manager.ts
  - ai-extension/tests/provider-config-manager.test.ts
autonomous: true
requirements: [KEYS-01, KEYS-02, PROV-03]  # Encryption, storage location, and API key entry
user_setup: []

must_haves:
  truths:
    - "API keys are encrypted using AES-GCM before storage"
    - "Encrypted keys can be decrypted successfully"
    - "API keys are stored in chrome.storage.local only (never sync)"
    - "Decrypted API keys are returned in plain text"
    - "Decrypted API keys match original encrypted data"
  artifacts:
    - path: "ai-extension/src/background/provider-config-manager.ts"
      provides: "getDecryptedApiKey method"
      contains: "async getDecryptedApiKey"
      pattern: "cryptoManager.decrypt"
      min_lines: 150
    - path: "ai-extension/tests/provider-config-manager.test.ts"
      provides: "Tests for KEYS-01, KEYS-02"
      contains: "describe('API Key Encryption')"
      min_lines: 50
  key_links:
    - from: "getDecryptedApiKey"
      to: "cryptoManager.decrypt"
      via: "decryption call"
      pattern: "await this.cryptoManager.decrypt"
    - from: "addProvider"
      to: "cryptoManager.encrypt"
      via: "encryption call"
      pattern: "await this.cryptoManager.encrypt"
---

<objective>
Implement API key encryption/decryption functionality in the ProviderConfigManager using the existing crypto-manager. Add test coverage for KEYS-01 and KEYS-02.

Purpose: Ensure API keys are securely encrypted at rest using existing AES-256-GCM infrastructure.
Output: Working encryption/decryption with test coverage
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
  async remove(keys: string | string[]): Promise<void>;
  async clear(): Promise<void>;
  async getBytesInUse(keys?: string | string[]): Promise<number>;
  async getQuota(): Promise<StorageQuota>;
  async hasSpace(estimatedBytes: number): Promise<boolean>;
  estimateSize(data: any): number;
}
```

From ai-extension/src/background/provider-types.ts (created in Plan 01):
```typescript
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

export interface ProviderConfigStorage {
  provider_configs: ProviderConfig[];
}

export interface ProviderKeyStorage {
  provider_keys: Record<string, EncryptedData>;
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Implement getDecryptedApiKey method</name>
  <files>ai-extension/src/background/provider-config-manager.ts</files>
  <read_first>
    - ai-extension/src/background/provider-config-manager.ts
    - ai-extension/src/background/crypto-manager.ts
  </read_first>
  <action>
Add the getDecryptedApiKey method to ProviderConfigManager class per KEYS-01:

1. Call ensureInitialized()
2. Load provider_configs from storage
3. Find provider by id, return null if not found
4. Get apiKeyId from the provider config
5. If no apiKeyId, return null (provider has no API key)
6. Load provider_keys from storage
7. Get encrypted data for apiKeyId
8. If no encrypted data found, return null
9. Decrypt using cryptoManager.decrypt(encryptedData)
10. Return decrypted key as string
11. Handle decryption errors with logging and return null or throw

Signature:
```typescript
public async getDecryptedApiKey(providerId: string): Promise<string | null>
```

This method reads from chrome.storage.local only per KEYS-02.
  </action>
  <verify>
    <automated>cd ai-extension && grep -n "async getDecryptedApiKey" ai-extension/src/background/provider-config-manager.ts</automated>
  </verify>
  <done>
    - getDecryptedApiKey method exists and accepts providerId string
    - Returns decrypted API key as string, or null if not found/no key
    - Uses cryptoManager.decrypt() for decryption
    - Reads from chrome.storage.local only (never sync)
    - Handles errors gracefully with logging
  </done>
</task>

<task type="auto">
  <name>Task 2: Implement setProviderApiKey method</name>
  <files>ai-extension/src/background/provider-config-manager.ts</files>
  <read_first>
    - ai-extension/src/background/provider-config-manager.ts
    - ai-extension/src/background/crypto-manager.ts
  </read_first>
  <action>
Add the setProviderApiKey method to allow updating API keys for existing providers:

1. Call ensureInitialized()
2. Load provider_configs from storage
3. Find provider by id, throw Error if not found
4. Generate or reuse apiKeyId (format: key_${providerId})
5. Encrypt the API key using cryptoManager.encrypt(apiKey)
6. Load provider_keys from storage
7. Store/update encrypted data for apiKeyId
8. Save provider_keys to storage
9. Update provider config's apiKeyId if it changed
10. Save provider_configs to storage
11. Log the update

Signature:
```typescript
public async setProviderApiKey(providerId: string, apiKey: string): Promise<void>
```

This method writes to chrome.storage.local only per KEYS-02.
  </action>
  <verify>
    <automated>cd ai-extension && grep -n "async setProviderApiKey" ai-extension/src/background/provider-config-manager.ts</automated>
  </verify>
  <done>
    - setProviderApiKey method exists and accepts providerId and apiKey
    - Encrypts API key using cryptoManager.encrypt()
    - Stores encrypted key in provider_keys in chrome.storage.local
    - Throws Error if provider not found
    - Updates apiKeyId on provider config if needed
  </done>
</task>

<task type="auto">
  <name>Task 3: Add test coverage for encryption/decryption</name>
  <files>ai-extension/tests/provider-config-manager.test.ts</files>
  <read_first>
    - ai-extension/tests/provider-config-manager.test.ts
    - ai-extension/tests/crypto-manager.test.ts
  </read_first>
  <action>
Add test cases for KEYS-01 and KEYS-02 in the existing test file:

1. **describe('API Key Encryption (KEYS-01)')**
   - it.todo("should encrypt API key when adding provider")
   - it.todo("should decrypt API key successfully")
   - it.todo("should return null for provider without API key")
   - it.todo("should handle decryption errors gracefully")

2. **describe('Storage Location (KEYS-02)')**
   - it.todo("should store encrypted keys in chrome.storage.local")
   - it.todo("should store provider configs in chrome.storage.local")
   - it.todo("should never use chrome.storage.sync for API keys")

Follow the existing test patterns from crypto-manager.test.ts for encryption testing.
  </action>
  <verify>
    <automated>cd ai-extension && grep -n "describe('API Key Encryption\|describe('Storage Location" ai-extension/tests/provider-config-manager.test.ts</automated>
  </verify>
  <done>
    - Test file contains describe('API Key Encryption (KEYS-01)')
    - Test file contains describe('Storage Location (KEYS-02)')
    - Test stubs cover all encryption scenarios
    - Test stubs verify chrome.storage.local usage
  </done>
</task>

</tasks>

<verification>
- getDecryptedApiKey method decrypts and returns the original key
- setProviderApiKey method encrypts and stores API keys
- Tests verify encryption/decryption functionality
- Tests verify API keys are stored in chrome.storage.local
- TypeScript compiles: `cd ai-extension && npx tsc --noEmit`
</verification>

<success_criteria>
- getDecryptedApiKey returns decrypted key or null
- setProviderApiKey encrypts and stores new API keys
- API keys are stored in chrome.storage.local only (never in chrome.storage.sync per KEYS-02)
- getDecryptedApiKey returns null for non-existent providers
- getDecryptedApiKey returns original input key after round-trip
- Test stubs exist for all KEYS-01 and KEYS-02 requirements
</success_criteria>

<output>
After completion, create `.planning/phases/01-foundation/01-03-SUMMARY.md`
</output>
