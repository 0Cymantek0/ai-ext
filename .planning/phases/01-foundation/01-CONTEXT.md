# Phase 1: Foundation - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Secure infrastructure for storing provider configurations and encrypted API keys. This phase creates the foundational types, storage layer, and encryption service that all subsequent phases build upon.

**What's IN scope:**
- Provider configuration type definitions
- API key encryption/decryption service
- Provider configuration storage layer (CRUD operations)
- Enable/disable provider functionality

**What's OUT of scope:**
- Provider adapters (Phase 2)
- Routing logic (Phase 3)
- UI components (Phase 6)
- API key validation/connection testing (Phase 2)

</domain>

<decisions>
## Implementation Decisions

### Encryption Strategy
- **D-01:** Single-layer encryption — Master key stored in `chrome.storage.local`, encrypted API keys stored in same location
- **D-02:** Reuse existing `crypto-manager.ts` (AES-256-GCM with PBKDF2, 100K iterations)
- **D-03:** Master key generated once on first use via `crypto.subtle.generateKey()`, persisted as base64

### Provider Configuration Schema
- **D-04:** Flat config structure — Provider type + config in same object (not namespaced by type)
- **D-05:** Provider types defined as TypeScript string literal union: `'openai' | 'anthropic' | 'google' | 'openrouter' | 'ollama' | 'groq' | 'nvidia' | 'custom'`
- **D-06:** Each provider config includes: `id`, `type`, `name`, `enabled`, `apiKeyId` (reference to encrypted key), `createdAt`, `updatedAt`

### Storage Architecture
- **D-07:** Provider configs stored under key `provider_configs` in `chrome.storage.local`
- **D-08:** Encrypted API keys stored under key `provider_keys` in `chrome.storage.local`
- **D-09:** Master encryption key stored under key `encryption_master_key` in `chrome.storage.local`
- **D-10:** Never sync API keys or encryption keys to `chrome.storage.sync` (security requirement)

### Claude's Discretion
- Exact field names and types in TypeScript interfaces
- Error handling patterns (follow existing `StorageError` pattern)
- File organization within `src/background/` directory
- Test file structure

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Encryption Infrastructure
- `ai-extension/src/background/crypto-manager.ts` — AES-256-GCM encryption with PBKDF2 key derivation, EncryptedData interface, singleton pattern

### Existing Storage Infrastructure
- `ai-extension/src/background/storage-wrapper.ts` — ChromeLocalStorage, ChromeSyncStorage, StorageManager with quota monitoring, retry logic, StorageError class

### Message Types Pattern
- `ai-extension/src/shared/types/index.d.ts` — BaseMessage<K, T> pattern for type-safe message passing

### Project Requirements
- `.planning/REQUIREMENTS.md` — PROV-01, PROV-03, PROV-05, KEYS-01, KEYS-02 for this phase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **crypto-manager.ts**: Full AES-256-GCM implementation ready to use
  - `getCryptoManager()` — singleton access
  - `initialize(password?, salt?)` — setup master key
  - `encrypt(data)` / `decrypt(encryptedData)` — encrypt/decrypt any data
  - `exportMasterKey()` / `importMasterKey(base64)` — key persistence
  - `EncryptedData` interface — { ciphertext, iv, salt, algorithm, version }

- **storage-wrapper.ts**: Production-ready Chrome storage wrapper
  - `ChromeLocalStorage` — get, set, remove, clear with retry logic
  - `getQuota()` — quota monitoring (10MB limit, 80% warning, 95% critical)
  - `StorageError` class with typed error classification

- **monitoring.ts**: Logging infrastructure
  - `logger` with debug, info, warn, error levels

### Established Patterns
- Singleton pattern for managers (crypto, storage)
- Async/await with try-catch error handling
- Base64 encoding for binary data storage compatibility
- Zod for runtime validation (used elsewhere in codebase)

### Integration Points
- Service worker (`service-worker.ts`) will register message handlers for provider config operations
- New provider types should be added to `src/shared/types/index.d.ts`
- Storage keys follow pattern: `snake_case` (e.g., `provider_configs`)

</code_context>

<specifics>
## Specific Ideas

- "User should be able to add/remove/configure multiple AI providers" — from PROV-01
- "API keys are encrypted at rest using Web Crypto API AES-GCM" — from KEYS-01
- "API keys are stored in chrome.storage.local (never synced)" — from KEYS-02
- "User can enable/disable individual providers without deleting configuration" — from PROV-05

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-03-27*
