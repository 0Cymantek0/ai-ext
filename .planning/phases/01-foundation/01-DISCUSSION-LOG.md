# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-27
**Phase:** 01-foundation
**Areas discussed:** Encryption key strategy, Provider schema, Provider type system

---

## Encryption Key Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Single-layer (Recommended) | Master key in storage.local, encrypted API keys in storage.local | ✓ |
| Password-derived | Master key derived from user password each session | |
| Session-only | Master key in storage.session (memory-only, lost on restart) | |

**User's choice:** Single-layer (Recommended)
**Notes:** Balances security with seamless UX. Master key generated once, stored in storage.local alongside encrypted API keys.

---

## Provider Configuration Schema

| Option | Description | Selected |
|--------|-------------|----------|
| Flat config (Recommended) | Provider type + config in same object (e.g., {type: 'openai', enabled: true, ...}) | ✓ |
| Type-namespaced | Provider type as string, config stored separately by type (e.g., providers.openai = {...}) | |

**User's choice:** Flat config (Recommended)
**Notes:** Self-contained provider objects with type field. Simpler CRUD operations, easier to extend.

---

## Provider Type System

| Option | Description | Selected |
|--------|-------------|----------|
| String literals (Recommended) | String literal union: 'openai' \| 'anthropic' \| 'google' \| ... (extensible, TypeScript-friendly) | ✓ |
| Enum | TypeScript enum: ProviderType.OPENAI, etc. (stricter, requires migration for new types) | |

**User's choice:** String literals (Recommended)
**Notes:** More flexible for future provider additions. No enum migration needed when adding new providers.

---

## Research Applied

### Chrome Storage API
- **Source:** https://developer.chrome.com/docs/extensions/reference/api/storage
- **Finding:** `storage.local` has 10MB quota (unlimited with permission), persists data even when clearing cache, not synced across devices
- **Impact:** Confirmed storage.local is correct choice for encrypted API keys

### Web Crypto API
- **Source:** https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API
- **Finding:** AES-GCM, PBKDF2 supported in service workers and extension contexts
- **Impact:** Existing `crypto-manager.ts` implementation is appropriate

### Existing Codebase Analysis
- **crypto-manager.ts**: Already implements AES-256-GCM with 100K PBKDF2 iterations, EncryptedData interface, singleton pattern
- **storage-wrapper.ts**: Has ChromeLocalStorage with quota monitoring, retry logic, StorageError class
- **Impact:** Can reuse existing infrastructure with minimal new code

---

## Claude's Discretion

The following were not asked and left to Claude's discretion during implementation:
- Exact field names and types in TypeScript interfaces
- Error handling patterns (follow existing StorageError pattern)
- File organization within `src/background/` directory
- Test file structure

---

*Discussion completed: 2026-03-27*
