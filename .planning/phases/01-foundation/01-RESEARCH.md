# Phase 1: Foundation - Research

**Researched:** 2026-03-27
**Domain:** Secure storage infrastructure for provider configurations and encrypted API keys
**Confidence:** HIGH

## Summary

Phase 1 establishes the foundational infrastructure for the multi-provider settings system. The key finding is that **90% of the infrastructure already exists** in the codebase - `crypto-manager.ts` provides production-ready AES-256-GCM encryption, and `storage-wrapper.ts` offers robust Chrome storage with quota monitoring. The task is primarily **integration and extension**, not greenfield development.

The phase requires creating: (1) TypeScript types for provider configurations, (2) a provider configuration manager that wraps the existing crypto and storage infrastructure, and (3) CRUD operations for managing provider configs and their encrypted API keys. All storage uses `chrome.storage.local` - never `chrome.storage.sync` for security.

**Primary recommendation:** Extend existing infrastructure with thin provider-specific wrappers. Do NOT build new encryption or storage systems - compose what exists.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Encryption Strategy
- **D-01:** Single-layer encryption - Master key stored in `chrome.storage.local`, encrypted API keys stored in same location
- **D-02:** Reuse existing `crypto-manager.ts` (AES-256-GCM with PBKDF2, 100K iterations)
- **D-03:** Master key generated once on first use via `crypto.subtle.generateKey()`, persisted as base64

#### Provider Configuration Schema
- **D-04:** Flat config structure - Provider type + config in same object (not namespaced by type)
- **D-05:** Provider types defined as TypeScript string literal union: `'openai' | 'anthropic' | 'google' | 'openrouter' | 'ollama' | 'groq' | 'nvidia' | 'custom'`
- **D-06:** Each provider config includes: `id`, `type`, `name`, `enabled`, `apiKeyId` (reference to encrypted key), `createdAt`, `updatedAt`

#### Storage Architecture
- **D-07:** Provider configs stored under key `provider_configs` in `chrome.storage.local`
- **D-08:** Encrypted API keys stored under key `provider_keys` in `chrome.storage.local`
- **D-09:** Master encryption key stored under key `encryption_master_key` in `chrome.storage.local`
- **D-10:** Never sync API keys or encryption keys to `chrome.storage.sync` (security requirement)

### Claude's Discretion
- Exact field names and types in TypeScript interfaces
- Error handling patterns (follow existing `StorageError` pattern)
- File organization within `src/background/` directory
- Test file structure

### Deferred Ideas (OUT OF SCOPE)
None - discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROV-01 | User can add/remove/configure multiple AI providers | ProviderConfigManager with CRUD operations, flat schema design |
| PROV-03 | User can enter and save API keys per provider with AES-GCM encryption | CryptoManager encryption/decryption, apiKeyId reference pattern |
| PROV-05 | User can enable/disable individual providers without deleting configuration | `enabled` boolean field in ProviderConfig type |
| KEYS-01 | API keys are encrypted at rest using Web Crypto API AES-GCM | Existing crypto-manager.ts with AES-256-GCM + PBKDF2 |
| KEYS-02 | API keys are stored in chrome.storage.local (never synced) | Storage architecture uses ChromeLocalStorage exclusively |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `crypto-manager.ts` | (existing) | AES-256-GCM encryption | Already implemented with PBKDF2 100K iterations, singleton pattern |
| `storage-wrapper.ts` | (existing) | Chrome storage wrapper | Quota monitoring, retry logic, StorageError class |
| `zod` | ^3.25.76 | Runtime validation | Already used for schema validation throughout codebase |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | ^2.1.1 | Test framework | Unit tests for provider config manager |
| `@testing-library/react` | ^16.3.0 | Testing utilities | Integration tests (if needed) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Reusing crypto-manager | New encryption service | Reuse avoids duplication, already tested |
| Flat config structure | Namespaced by provider type | Flat is simpler, matches storage key pattern |
| apiKeyId reference pattern | Embed encrypted key in config | Separation allows key rotation without config changes |

**Installation:** No new dependencies required - all infrastructure exists.

## Architecture Patterns

### Recommended File Structure
```
ai-extension/src/background/
├── crypto-manager.ts          # EXISTS - encryption service
├── storage-wrapper.ts         # EXISTS - storage wrapper
├── provider-config-manager.ts # NEW - provider config CRUD
├── provider-types.ts          # NEW - type definitions
└── service-worker.ts          # MODIFY - register message handlers

ai-extension/src/shared/types/
└── index.d.ts                 # MODIFY - add provider message types
```

### Pattern 1: Provider Configuration Manager (Singleton)
**What:** Central manager for all provider configuration operations, wraps existing crypto and storage services.
**When to use:** All provider config operations in this phase.
**Example:**
```typescript
// Source: Pattern from existing crypto-manager.ts and storage-wrapper.ts
export class ProviderConfigManager {
  private cryptoManager: CryptoManager;
  private storage: ChromeLocalStorage;

  async initialize(): Promise<void> {
    // Load or create master encryption key
    const keyData = await this.storage.get<{ encryption_master_key?: string }>('encryption_master_key');
    if (keyData.encryption_master_key) {
      await this.cryptoManager.importMasterKey(keyData.encryption_master_key);
    } else {
      await this.cryptoManager.initialize();
      const exportedKey = await this.cryptoManager.exportMasterKey();
      await this.storage.set({ encryption_master_key: exportedKey });
    }
  }

  async addProvider(config: Omit<ProviderConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProviderConfig> {
    // 1. Encrypt API key if provided
    // 2. Store encrypted key in provider_keys
    // 3. Store config with apiKeyId reference in provider_configs
  }

  async getProvider(id: string): Promise<ProviderConfig | null> {
    // Load from provider_configs
  }

  async getDecryptedApiKey(providerId: string): Promise<string | null> {
    // 1. Get provider config
    // 2. Get encrypted key from provider_keys
    // 3. Decrypt and return
  }

  async updateProvider(id: string, updates: Partial<ProviderConfig>): Promise<ProviderConfig> {
    // Update config, set updatedAt
  }

  async deleteProvider(id: string): Promise<void> {
    // Remove config and associated encrypted key
  }

  async setProviderEnabled(id: string, enabled: boolean): Promise<void> {
    // Update only enabled field (PROV-05)
  }

  async listProviders(): Promise<ProviderConfig[]> {
    // Return all provider configs
  }
}

// Singleton access (pattern from existing code)
let _providerConfigManager: ProviderConfigManager | null = null;

export function getProviderConfigManager(): ProviderConfigManager {
  if (!_providerConfigManager) {
    _providerConfigManager = new ProviderConfigManager();
  }
  return _providerConfigManager;
}
```

### Pattern 2: Type Definitions
**What:** TypeScript types for provider configurations following the flat structure decision.
**When to use:** All provider-related type declarations.
**Example:**
```typescript
// Source: Context.md D-04, D-05, D-06
export type ProviderType = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'ollama' | 'groq' | 'nvidia' | 'custom';

export interface ProviderConfig {
  id: string;           // nanoid for uniqueness
  type: ProviderType;
  name: string;         // User-friendly display name
  enabled: boolean;     // For PROV-05 enable/disable without deletion
  apiKeyId: string;     // Reference to encrypted key in provider_keys
  createdAt: number;    // Unix timestamp
  updatedAt: number;    // Unix timestamp
}

// Storage shape
export interface ProviderConfigStorage {
  provider_configs: ProviderConfig[];
}

export interface ProviderKeyStorage {
  provider_keys: Record<string, EncryptedData>; // apiKeyId -> EncryptedData
}
```

### Pattern 3: Message Types for IPC
**What:** Type-safe message definitions for communication between components.
**When to use:** Service worker message handlers, sidepanel requests.
**Example:**
```typescript
// Source: Pattern from existing index.d.ts BaseMessage
// Add to MessageKind union:
| "PROVIDER_CONFIG_CREATE"
| "PROVIDER_CONFIG_GET"
| "PROVIDER_CONFIG_LIST"
| "PROVIDER_CONFIG_UPDATE"
| "PROVIDER_CONFIG_DELETE"
| "PROVIDER_KEY_GET"

// Payload types
export interface ProviderConfigCreatePayload {
  type: ProviderType;
  name: string;
  apiKey?: string;  // Optional - can add later
}

export interface ProviderConfigUpdatePayload {
  id: string;
  updates: Partial<Pick<ProviderConfig, 'name' | 'enabled'>>;
}

export interface ProviderKeyGetPayload {
  providerId: string;
}
```

### Anti-Patterns to Avoid
- **Storing API keys in chrome.storage.sync:** Violates KEYS-02, data can sync to other devices
- **Embedding encrypted keys in provider config:** Breaks key rotation, makes updates complex
- **Creating new encryption service:** crypto-manager.ts is already tested and production-ready
- **Skipping master key persistence:** Would require re-encrypting all keys on restart
- **Using IndexedDB for provider configs:** chrome.storage.local is simpler and sufficient for small config data

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| API key encryption | New AES implementation | `crypto-manager.ts` | Already has PBKDF2 100K iterations, base64 encoding, error handling |
| Chrome storage | Direct chrome.storage API | `storage-wrapper.ts` | Quota monitoring, retry logic, typed StorageError |
| ID generation | Custom UUID | `nanoid` (already in deps) | Smaller, URL-safe, already used in codebase |
| Runtime validation | Manual type checks | `zod` schemas | Type-safe parsing, already used throughout |

**Key insight:** This phase is 80% integration of existing infrastructure, 20% new code for provider-specific logic.

## Runtime State Inventory

This phase is greenfield infrastructure - no existing runtime state to migrate.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None - new feature | Create initial storage structure |
| Live service config | None | N/A |
| OS-registered state | None | N/A |
| Secrets/env vars | None - user-provided keys | N/A |
| Build artifacts | None | N/A |

## Common Pitfalls

### Pitfall 1: Master Key Not Persisted
**What goes wrong:** Master key generated but not stored, all encrypted keys become undecryptable after service worker restart.
**Why it happens:** Forgetting the second step of key generation (export + persist).
**How to avoid:** Initialize flow: check storage first -> if missing, generate -> export -> persist -> confirm.
**Warning signs:** `CryptoError: NOT_INITIALIZED` after service worker restart.

### Pitfall 2: Syncing API Keys to chrome.storage.sync
**What goes wrong:** API keys sync to user's other Chrome profiles, potential security exposure.
**Why it happens:** Using wrong storage area or ChromeSyncStorage wrapper.
**How to avoid:** Always use `ChromeLocalStorage` (10MB limit), never `ChromeSyncStorage` for provider data.
**Warning signs:** API key data appearing in chrome.storage.sync debug view.

### Pitfall 3: Service Worker Lifecycle
**What goes wrong:** CryptoManager loses master key when service worker terminates (30s idle timeout).
**Why it happens:** Master key held only in memory, not reloaded on wake.
**How to avoid:** Always call `initialize()` at start of any operation that needs encryption - it will reload from storage if available.
**Warning signs:** Intermittent decryption failures, especially after idle periods.

### Pitfall 4: Orphaned Encrypted Keys
**What goes wrong:** Provider deleted but encrypted key remains in storage, quota creep.
**Why it happens:** Delete operation only removes config, not associated key.
**How to avoid:** `deleteProvider()` must remove both `provider_configs` entry and `provider_keys[apiKeyId]`.
**Warning signs:** Storage quota growing, `provider_keys` entries with no matching config.

## Code Examples

### Provider Config Manager Initialization
```typescript
// Source: Pattern from crypto-manager.ts
import { getCryptoManager, CryptoManager } from './crypto-manager.js';
import { ChromeLocalStorage, StorageError } from './storage-wrapper.js';
import { logger } from './monitoring.js';
import { nanoid } from 'nanoid';

export class ProviderConfigManager {
  private cryptoManager: CryptoManager;
  private storage: ChromeLocalStorage;
  private initialized = false;

  constructor() {
    this.cryptoManager = getCryptoManager();
    this.storage = new ChromeLocalStorage();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Check for existing master key
      const keyData = await this.storage.get<{ encryption_master_key?: string }>('encryption_master_key');

      if (keyData.encryption_master_key) {
        // Import existing key
        await this.cryptoManager.importMasterKey(keyData.encryption_master_key);
        logger.info('ProviderConfigManager', 'Loaded existing master key');
      } else {
        // Generate new master key
        await this.cryptoManager.initialize();
        const exportedKey = await this.cryptoManager.exportMasterKey();
        await this.storage.set({ encryption_master_key: exportedKey });
        logger.info('ProviderConfigManager', 'Generated and stored new master key');
      }

      this.initialized = true;
    } catch (error) {
      logger.error('ProviderConfigManager', 'Initialization failed', error);
      throw error;
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('ProviderConfigManager not initialized. Call initialize() first.');
    }
  }
}
```

### Add Provider with Encrypted API Key
```typescript
// Source: Context.md requirements + crypto-manager.ts pattern
async addProvider(config: {
  type: ProviderType;
  name: string;
  apiKey?: string;
}): Promise<ProviderConfig> {
  this.ensureInitialized();

  const id = nanoid();
  const now = Date.now();
  const apiKeyId = `key_${id}`;

  // Encrypt API key if provided
  if (config.apiKey) {
    const encryptedKey = await this.cryptoManager.encrypt(config.apiKey);

    // Store encrypted key
    const keyStorage = await this.storage.get<ProviderKeyStorage>('provider_keys');
    const keys = keyStorage.provider_keys || {};
    keys[apiKeyId] = encryptedKey;
    await this.storage.set({ provider_keys: keys });
  }

  // Create provider config
  const providerConfig: ProviderConfig = {
    id,
    type: config.type,
    name: config.name,
    enabled: true,
    apiKeyId,
    createdAt: now,
    updatedAt: now,
  };

  // Store config
  const configStorage = await this.storage.get<ProviderConfigStorage>('provider_configs');
  const configs = configStorage.provider_configs || [];
  configs.push(providerConfig);
  await this.storage.set({ provider_configs: configs });

  logger.info('ProviderConfigManager', 'Provider added', { id, type: config.type });
  return providerConfig;
}
```

### Get Decrypted API Key
```typescript
async getDecryptedApiKey(providerId: string): Promise<string | null> {
  this.ensureInitialized();

  // Get provider config
  const configStorage = await this.storage.get<ProviderConfigStorage>('provider_configs');
  const configs = configStorage.provider_configs || [];
  const config = configs.find(c => c.id === providerId);

  if (!config) {
    logger.warn('ProviderConfigManager', 'Provider not found', { providerId });
    return null;
  }

  // Get encrypted key
  const keyStorage = await this.storage.get<ProviderKeyStorage>('provider_keys');
  const keys = keyStorage.provider_keys || {};
  const encryptedKey = keys[config.apiKeyId];

  if (!encryptedKey) {
    logger.warn('ProviderConfigManager', 'No API key for provider', { providerId });
    return null;
  }

  // Decrypt and return
  try {
    const decryptedKey = await this.cryptoManager.decrypt(encryptedKey);
    return decryptedKey;
  } catch (error) {
    logger.error('ProviderConfigManager', 'Failed to decrypt API key', { providerId, error });
    throw new StorageError(
      StorageErrorType.CORRUPTION,
      'Failed to decrypt API key',
      error
    );
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| In-memory API keys | Encrypted at rest | Phase 1 | Keys survive service worker restart |
| Chrome storage sync | Chrome storage local only | Phase 1 | Keys never leave device |
| Custom encryption | Web Crypto API | Pre-existing | OWASP-compliant AES-256-GCM |

**Deprecated/outdated:**
- Plain text API key storage: Security risk, replaced with AES-GCM encryption
- Syncing sensitive data: Privacy concern, replaced with local-only storage

## Open Questions

1. **Should we validate API key format before storing?**
   - What we know: Each provider has different key formats (sk-... for OpenAI, etc.)
   - What's unclear: Should Phase 1 include format validation or defer to Phase 2 connection testing?
   - Recommendation: Defer to Phase 2 - format validation is provider-specific, this phase focuses on storage infrastructure.

2. **What happens if master key is corrupted?**
   - What we know: All encrypted keys become undecryptable without master key.
   - What's unclear: Should we have a recovery mechanism or just require re-configuration?
   - Recommendation: Require re-configuration - recovery mechanisms add complexity. Log error clearly.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified)

This phase uses only existing project infrastructure:
- Web Crypto API (browser built-in)
- Chrome Storage API (extension environment)
- Existing TypeScript/Node.js toolchain

No external services, CLIs, or databases required.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.1 |
| Config file | `ai-extension/vitest.config.ts` |
| Quick run command | `cd ai-extension && pnpm run test tests/provider-config-manager.test.ts` |
| Full suite command | `cd ai-extension && pnpm run test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROV-01 | Add/remove/configure providers | unit | `vitest run tests/provider-config-manager.test.ts` | Wave 0 |
| PROV-03 | Save encrypted API keys | unit | `vitest run tests/provider-config-manager.test.ts` | Wave 0 |
| PROV-05 | Enable/disable providers | unit | `vitest run tests/provider-config-manager.test.ts` | Wave 0 |
| KEYS-01 | AES-GCM encryption at rest | unit | `vitest run tests/provider-config-manager.test.ts` | Wave 0 |
| KEYS-02 | Keys in chrome.storage.local | unit | `vitest run tests/provider-config-manager.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm run test tests/provider-config-manager.test.ts`
- **Per wave merge:** `pnpm run test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/provider-config-manager.test.ts` - covers all phase requirements (PROV-01, PROV-03, PROV-05, KEYS-01, KEYS-02)
- [ ] Mock setup for Chrome storage and crypto-manager (follow pattern from existing tests)

**Existing test infrastructure covers:**
- `tests/crypto-manager.test.ts` - encryption/decryption patterns (reference for mocking)
- `tests/storage-wrapper.test.ts` - storage mock patterns (reference for mocking)

## Sources

### Primary (HIGH confidence)
- `ai-extension/src/background/crypto-manager.ts` - Encryption implementation details
- `ai-extension/src/background/storage-wrapper.ts` - Storage wrapper with quota monitoring
- `ai-extension/src/shared/types/index.d.ts` - Message type patterns
- `.planning/phases/01-foundation/01-CONTEXT.md` - User decisions and constraints

### Secondary (MEDIUM confidence)
- `ai-extension/tests/crypto-manager.test.ts` - Test patterns for encryption
- `ai-extension/tests/storage-wrapper.test.ts` - Test patterns for storage mocking

### Tertiary (LOW confidence)
- None - all findings verified against codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All infrastructure exists in codebase, verified by reading source files
- Architecture: HIGH - Patterns established by existing crypto-manager and storage-wrapper
- Pitfalls: HIGH - Based on actual Chrome extension constraints and existing code patterns

**Research date:** 2026-03-27
**Valid until:** 30 days (stable infrastructure, no external dependencies)
