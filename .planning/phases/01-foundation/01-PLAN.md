---
phase: 01-foundation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - ai-extension/src/background/provider-types.ts
  - ai-extension/tests/provider-config-manager.test.ts
autonomous: true
requirements: []  # Foundation plan - creates types and test stubs enabling downstream plans
user_setup: []

must_haves:
  truths:
    - "Provider types are defined and importable"
    - "TypeScript compiles without errors"
    - "Test stubs exist for all phase requirements"
  artifacts:
    - path: "ai-extension/src/background/provider-types.ts"
      provides: "TypeScript types for provider configurations"
      contains: "export type ProviderType"
      min_lines: 30
    - path: "ai-extension/tests/provider-config-manager.test.ts"
      provides: "Test scaffold for provider config manager"
      contains: "describe('ProviderConfigManager')"
      min_lines: 50
  key_links:
    - from: "ai-extension/src/background/provider-types.ts"
      to: "src/shared/types/index.d.ts"
      via: "TypeScript import"
      pattern: "export (type|interface)"
---

<objective>
Define TypeScript types for provider configurations and create Wave 0 test scaffold for the provider config manager.

Purpose: Establish type contracts that downstream tasks implement against, and create test infrastructure for verification.
Output: Provider type definitions and test stubs
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

<interfaces>
<!-- Key types from existing codebase that executor needs -->

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
export function getCryptoManager(): CryptoManager;
```

From ai-extension/src/background/storage-wrapper.ts
```typescript
export class ChromeLocalStorage {
  async get<T = any>(keys?: string | string[] | null): Promise<T>;
  async set(items: Record<string, any>): Promise<void>;
  async remove(keys: string | string[]): Promise<void>;
}
export class StorageError extends Error {
  constructor(
    public type: StorageErrorType,
    message: string,
    public originalError?: unknown,
  ) { ... }
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create provider types file</name>
  <files>ai-extension/src/background/provider-types.ts</files>
  <read_first>
    - ai-extension/src/background/crypto-manager.ts
    - ai-extension/src/background/storage-wrapper.ts
  </read_first>
  <action>
Create `ai-extension/src/background/provider-types.ts` with TypeScript type definitions per CONTEXT.md decisions D-04, d-05, d-06:

 Per user decision:
- ProviderType: String literal union with all 8 supported provider types
- ProviderConfig interface with id, type, name, enabled, apiKeyId, createdAt, updatedAt fields
- ProviderConfigStorage interface with provider_configs array
- ProviderKeyStorage interface with provider_keys as Record mapping apiKeyId to EncryptedData

- Zod schemas for runtime validation (optional but use pattern from existing tests)

  </action>
  <verify>
    <automated>cd ai-extension && npx tsc --noEmit && grep -q "export type ProviderType" ai-extension/src/background/provider-types.ts</automated>
  </verify>
  <done>
    - File exists at ai-extension/src/background/provider-types.ts
    - Contains `export type ProviderType`
    - Contains `export interface ProviderConfig`
    - Contains `export interface ProviderConfigStorage`
    - Contains `export interface ProviderKeyStorage`
  </done>
</task>

<task type="auto">
  <name>Task 2: Create Wave 0 test scaffold</name>
  <files>ai-extension/tests/provider-config-manager.test.ts</files>
  <read_first>
    - ai-extension/src/background/provider-types.ts (to reference type definitions)
    - ai-extension/tests/crypto-manager.test.ts (existing test patterns for structure and mocking)
    - ai-extension/tests/storage-wrapper.test.ts (existing mock patterns for Chrome storage)
  </read_first>
  <action>
Create `ai-extension/tests/provider-config-manager.test.ts` with test stubs for all Phase 1 requirements. Follow the patterns from existing test files:

1. Import { describe, it, expect, beforeEach } from "vitest"
2 Import { ProviderConfig, ProviderType, ProviderConfigStorage, ProviderKeyStorage } from "../src/background/provider-types"

2 // Mock chrome.storage API
    const mockLocalStorage = {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
      getBytesInUse: vi.fn(),
      QUOTA_BYTES: 10485760, // 10MB for local
      MAX_ITEMS: 512,
      QUOTA_BYTES_PER_ITEM: 8192,
    }

    global.chrome = {
      storage: {
        local: mockLocalStorage as any,
        sync: {} as any,
        onChanged: {
          addListener: vi.fn(),
        } as any,
      },
    } as any;

    // Mock logger
    vi.mock("../src/background/monitoring.js", () => ({
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }));

    // Import after mocking
    import { ProviderConfigManager } from "../src/background/provider-config-manager"

    describe("ProviderConfigManager Types", () => {
      it("should define ProviderType correctly", () => {
        expect(ProviderType).toBeDefined()
      })

      it("should define ProviderConfig interface", () => {
        expect(ProviderConfig).toBeDefined()
      })
    })

    describe("ProviderConfigManager", () => {
      let providerConfigManager: ProviderConfigManager

      beforeEach(() => {
        providerConfigManager = new ProviderConfigManager()
        vi.clearAllMocks()
      })

      describe("Initialization", () => {
        // Wave 0 - Test stub for PROV-01: user can define provider configurations
        it.todo("should initialize with generated master key")
        it.todo("should load existing master key from storage")
        it.todo("should handle master key generation errors")
      })

      describe("addProvider", () => {
        // Wave 0 - Test stub for PROV-01: user can add provider configurations
        it.todo("should add provider with config")
        it.todo("should encrypt API key if provided")
        it.todo("should throw error if not initialized")
      })

      describe("listProviders", () => {
        // Wave 0 - Test stub for PROV-01: user can list providers
        it.todo("should list providers from storage")
        it.todo("should return empty array if no providers")
      })

      describe("getProvider", () => {
        // Wave 0 - Test stub for PROV-01: user can retrieve provider by ID
        it.todo("should get provider from storage")
        it.todo("should return null if not found")
      })

      describe("updateProvider", () => {
        // Wave 0 - Test stub for PROV-05: user can enable/disable providers
        it.todo("should update provider")
        it.todo("should update enabled field")
        it.todo("should throw error if not found")
      })

      describe("deleteProvider", () => {
        // Wave 0 - Test stub for PROV-01: user can delete provider configurations
        it.todo("should delete provider")
        it.todo("should delete associated encrypted key")
        it.todo("should throw error if not found")
      })
    })

    describe("getDecryptedApiKey", () => {
        // Wave 0 - Test stub for KEYS-01: user can decrypt API keys
        it.todo("should decrypt API key successfully")
        it.todo("should return null if provider not found")
        it.todo("should return null if no API key")
        it.todo("should handle decryption errors")
      })
    })

    describe("setProviderEnabled", () => {
        // Wave 0 - Test stub for PROV-05: user can enable/disable providers
        it.todo("should enable provider")
        it.todo("should disable provider")
        it.todo("should throw error if not found")
      })
    })

    describe("Storage Keys (KEYS-02)", () => {
        // Wave 0 - Test stub for KEYS-02: API keys stored in chrome.storage.local only
        it.todo("should use chrome.storage.local for provider configs")
        it.todo("should use chrome.storage.local for encrypted keys")
        it.todo("should never use chrome.storage.sync")
      })
    })
  </action>
  <verify>
    <automated>cd ai-extension && npx tsc --noEmit && grep -q "import.*ProviderConfigManager" ai-extension/tests/provider-config-manager.test.ts</automated>
  </verify>
  <done>
    - File exists at ai-extension/tests/provider-config-manager.test.ts
    - File contains "import { describe, it, expect, beforeEach } from 'vitest'"
    - File contains "import { ProviderConfig, ProviderType, ProviderConfigStorage, ProviderKeyStorage } from '../src/background/provider-types'"
    - File contains "describe('ProviderConfigManager Types')"
    - File contains "describe('ProviderConfigManager')"
    - File contains atdescribe('Initialization')"
    - File contains "describe('addProvider')"
    - File contains "describe('listProviders')"
    - File contains "describe('getProvider')"
    - File contains "describe('updateProvider')"
    - File contains "describe('deleteProvider')"
    - File contains "describe('getDecryptedApiKey')"
    - File contains "describe('setProviderEnabled')"
    - File contains "describe('Storage Keys')"
  </done>
</task>

</tasks>

<verification>
- TypeScript compiles without errors: `cd ai-extension && npx tsc --noEmit`
- Test file exists with stubs for all phase requirements
- All types are exported from provider-types.ts
</verification>

<success_criteria>
- Provider types defined per D-04, d-05, d-06
- Storage types defined per D-07, D-08, D-09
- Test stubs cover all phase requirements (PROV-01, PROV-03, PROV-05, KEYS-01, KEYS-02)
- TypeScript compilation succeeds
</success_criteria>

<output>
After completion, create `.planning/phases/01-foundation/01-01-SUMMARY.md`
</output>
