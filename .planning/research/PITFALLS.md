# Domain Pitfalls: Multi-Provider AI Settings

**Domain:** Chrome Extension Multi-Provider AI Integration
**Researched:** 2026-03-27
**Confidence:** HIGH (official documentation from Anthropic, OpenAI, Google, Chrome)

---

## Critical Pitfalls

Mistakes that cause rewrites or major security issues.

### Pitfall 1: Provider API Format Assumptions

**What goes wrong:** Treating all LLM providers as OpenAI-compatible when they have fundamentally different API contracts.

**Why it happens:** OpenAI's API format became a de facto standard. Developers assume Anthropic, Google, and others "mostly work the same way."

**Consequences:**
- Silent failures when system prompts are ignored (Anthropic requires top-level param)
- 400 errors when `max_tokens` is missing (required by Anthropic, optional elsewhere)
- Authentication failures when headers differ (`x-api-key` vs `Authorization: Bearer`)
- Malformed requests when message formats differ (Anthropic uses separate content blocks)

**Warning signs:**
- Provider integration code shares 90%+ logic between providers
- System prompts passed in messages array for all providers
- No per-provider request transformation layer
- Tests only cover happy path with one provider

**Prevention:**
1. Create a provider adapter pattern with explicit per-provider transforms
2. Document API differences in code comments (not just docs)
3. Integration tests per provider with real API contracts
4. Use a unified abstraction layer like LiteLLM for common patterns, but handle provider-specific features explicitly

**Phase to address:** Phase 1 (Provider Abstraction Layer)

**Sources:**
- [Anthropic Messages API](https://docs.anthropic.com/en/api/messages) - HIGH confidence
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference) - HIGH confidence

---

### Pitfall 2: API Key Storage in chrome.storage.sync

**What goes wrong:** Storing API keys in `chrome.storage.sync` which syncs across devices and has strict quota limits.

**Why it happens:** Developers see "storage" and assume it's all the same, or want keys to sync across devices for convenience.

**Consequences:**
- API keys leaked to other Chrome profiles or synced devices
- 100KB quota exceeded errors (sync vs 10MB local)
- Keys visible in Chrome's sync dashboard
- Security review rejection for Chrome Web Store

**Warning signs:**
- Using `chrome.storage.sync.set` for API keys
- No encryption layer for stored credentials
- Settings export includes API keys in plain text
- No distinction between user prefs (syncable) and secrets (local-only)

**Prevention:**
1. Use `chrome.storage.local` exclusively for API keys
2. Encrypt keys at rest using Web Crypto API (AES-GCM)
3. Never include API keys in sync, export, or backup features
4. Add explicit documentation that keys are device-local only

**Phase to address:** Phase 1 (Secure Storage Layer)

**Sources:**
- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage) - HIGH confidence
- [Google Gemini API Key Security](https://ai.google.dev/gemini-api/docs/api-key) - HIGH confidence

---

### Pitfall 3: Client-Side API Key Exposure

**What goes wrong:** Making API calls directly from content scripts where keys are accessible via DevTools, or logging keys in console errors.

**Why it happens:** Convenience during development, or misunderstanding of Chrome extension security boundaries.

**Consequences:**
- Keys extractable by any extension with devtools access
- Keys logged in error messages and crash reports
- Keys visible in network tab for content script requests
- Account compromise and unexpected billing

**Warning signs:**
- `fetch('https://api.openai.com/...', { headers: { 'Authorization': `Bearer ${apiKey}` } })` in content scripts
- Error handling that logs full request objects
- No separation between UI layer and API layer
- API calls made from sidepanel without going through service worker

**Prevention:**
1. All external API calls MUST go through service worker
2. Content scripts and sidepanel request API calls via message passing
3. Service worker sanitizes error messages before returning to UI
4. Use separate encryption key for API keys vs other settings

**Phase to address:** Phase 1 (Secure Storage Layer)

**Sources:**
- [Google Gemini API Key Security](https://ai.google.dev/gemini-api/docs/api-key) - HIGH confidence

---

### Pitfall 4: Inconsistent Model Selection Across Capabilities

**What goes wrong:** Per-capability routing (chat vs embeddings vs speech) leads to incompatible model choices that break workflows.

**Why it happens:** Users select cheapest/fastest for each capability independently without understanding dependencies.

**Consequences:**
- Embeddings from one model can't be compared with another (different vector dimensions)
- Chat model can't process embeddings from different provider
- Speech-to-text output format incompatible with chat input
- Context window mismatches between pipeline stages

**Warning signs:**
- No validation when user changes embedding provider
- No warning when switching providers mid-conversation
- Vector search returns no results after provider switch
- No documentation of embedding dimension per model

**Prevention:**
1. Store embedding model metadata with each vector chunk
2. Detect embedding dimension mismatch and warn user
3. Provide "compatible presets" that lock all capabilities to one provider
4. Clear UI indication when provider switch invalidates existing data
5. Option to re-embed all content when switching providers

**Phase to address:** Phase 2 (Per-Capability Routing)

**Sources:**
- [OpenAI Embeddings Models](https://platform.openai.com/docs/models/embeddings) - HIGH confidence (dimension differences documented)

---

### Pitfall 5: Assuming All Providers Support Streaming

**What goes wrong:** Building streaming-first UI that breaks for providers without streaming support or with different streaming protocols.

**Why it happens:** OpenAI and Anthropic support SSE streaming, developers assume all providers do.

**Consequences:**
- UI shows no response for non-streaming providers
- Broken streaming for providers using different protocols
- No fallback to polling for providers without streaming
- Poor UX with long delays before any response

**Warning signs:**
- No provider capability detection for streaming
- UI assumes chunks arrive in real-time
- No timeout handling for slow/non-streaming responses
- No "waiting for response" state in UI

**Prevention:**
1. Query provider capabilities on configuration (streaming support, max tokens, etc.)
2. Implement non-streaming fallback path
3. Show progress indicator for non-streaming responses
4. Handle partial streaming failures gracefully

**Phase to address:** Phase 1 (Provider Abstraction Layer)

---

## Moderate Pitfalls

### Pitfall 6: Hardcoded Model Lists

**What goes wrong:** Maintaining static lists of available models that become outdated as providers release new models.

**Why it happens:** Easier to hardcode than implement dynamic model discovery.

**Consequences:**
- New models unavailable until code update
- Deprecated models shown as options
- Version-specific models (gpt-4-turbo-2024-04-09) become stale
- Users can't use latest models without extension update

**Warning signs:**
- Model list in constants file, not fetched from API
- No model ID validation against provider
- No "custom model ID" input option
- Model picker shows outdated models

**Prevention:**
1. Fetch available models from provider APIs on settings load
2. Allow custom model ID input for new/unlisted models
3. Cache model list with expiration (24-48 hours)
4. Fall back to curated list if API unavailable

**Phase to address:** Phase 2 (Model Selection UI)

**Sources:**
- [OpenAI Models API](https://platform.openai.com/docs/api-reference/models) - HIGH confidence
- [Anthropic Models](https://docs.anthropic.com/en/docs/about-claude/models) - HIGH confidence

---

### Pitfall 7: Missing Per-Provider Error Handling

**What goes wrong:** Generic error handling that loses provider-specific error context needed for debugging.

**Why it happens:** Catch blocks that just log `error.message` without structure.

**Consequences:**
- Rate limit errors (429) not surfaced with retry guidance
- Invalid API key errors shown as generic "request failed"
- Context length exceeded errors not differentiated
- No actionable guidance for common errors

**Warning signs:**
- Single catch block for all provider errors
- Error messages shown to user are generic
- No distinction between 4xx and 5xx errors
- No error telemetry or categorization

**Prevention:**
1. Parse provider-specific error formats (OpenAI error structure differs from Anthropic)
2. Map common errors to user-friendly messages with actions
3. Handle rate limits with exponential backoff
4. Log full error context (sanitized) for debugging

**Phase to address:** Phase 1 (Provider Abstraction Layer)

---

### Pitfall 8: System Prompt Handling Differences

**What goes wrong:** System prompts work in one provider but are ignored or cause errors in others.

**Why it happens:** Anthropic requires system as top-level param, OpenAI accepts in messages array, some providers don't support system at all.

**Consequences:**
- Model behavior inconsistent across providers
- System prompts silently ignored
- API errors for providers with different format requirements
- Users confused why "same settings" give different results

**Warning signs:**
- System prompt always in messages array
- No provider-specific system prompt handling
- System prompt tests only cover one provider

**Prevention:**
1. Provider adapter transforms system prompt to correct location
2. Document system prompt support per provider
3. Validate system prompt length against provider limits
4. Provide fallback behavior for providers without system support

**Phase to address:** Phase 1 (Provider Abstraction Layer)

**Sources:**
- [Anthropic System Prompts](https://docs.anthropic.com/en/api/messages#body-system) - HIGH confidence

---

### Pitfall 9: Token Counting Inconsistencies

**What goes wrong:** Token counting varies between providers, leading to context overflow or underutilization.

**Why it happens:** Each provider uses different tokenizers (tiktoken for OpenAI, different for Anthropic, etc.).

**Consequences:**
- Context length exceeded errors for some providers
- Wasted context window capacity for others
- Inaccurate cost estimates
- Truncated responses without warning

**Warning signs:**
- Single token counting function for all providers
- No provider-specific tokenizer
- Character-based estimation instead of token-based
- No pre-request token validation

**Prevention:**
1. Use provider-specific tokenizers when available
2. Conservative estimation (count more, use less)
3. Pre-validate context length before API call
4. Warn user when approaching context limits

**Phase to address:** Phase 2 (Context Management)

---

### Pitfall 10: Custom Endpoint URL Validation

**What goes wrong:** Accepting any URL for custom OpenAI-compatible endpoints without validation.

**Why it happens:** Wanting to support any OpenAI-compatible service (LM Studio, vLLM, etc.).

**Consequences:**
- Users enter invalid URLs that fail silently
- Non-HTTPS URLs rejected by Chrome CSP
- Typos in URLs cause confusing errors
- No way to test endpoint connectivity

**Warning signs:**
- URL input with no validation
- No "Test Connection" button
- Errors only surface on first API call
- No URL format requirements documented

**Prevention:**
1. Validate URL format before saving
2. Require HTTPS for production (allow HTTP for localhost)
3. Provide "Test Connection" that hits /v1/models endpoint
4. Clear error messages for common URL issues

**Phase to address:** Phase 2 (Custom Endpoint Support)

---

## Minor Pitfalls

### Pitfall 11: Missing Provider Status Indicators

**What goes wrong:** No visual indication of which provider is active or if it's properly configured.

**Why it happens:** Focus on functionality over UX.

**Consequences:**
- Users unsure which provider will handle requests
- Silent fallback to wrong provider
- Confusion when settings don't take effect

**Prevention:**
1. Always show active provider in UI header
2. Show configuration status (valid API key, connection test)
3. Indicate when using fallback provider

**Phase to address:** Phase 3 (Settings UI Polish)

---

### Pitfall 12: No Migration Path for Provider Switches

**What goes wrong:** Switching providers loses conversation history or embeddings with no recovery path.

**Why it happens:** Treating provider switch as simple setting change rather than data migration.

**Consequences:**
- Users stuck with one provider to preserve data
- Lost conversation context
- Must re-embed all content manually

**Prevention:**
1. Warn before provider switch about data implications
2. Offer to re-embed content in background
3. Keep old embeddings until explicitly deleted
4. Provider-specific data stores for easy rollback

**Phase to address:** Phase 2 (Per-Capability Routing)

---

### Pitfall 13: Rate Limit Not Surfaced to User

**What goes wrong:** Rate limit errors handled silently with retries, but user sees no feedback.

**Why it happens:** Trying to provide seamless experience.

**Consequences:**
- User thinks extension is frozen
- Multiple requests queue up
- No awareness of quota limits

**Prevention:**
1. Show "rate limited, retrying..." indicator
2. Display remaining quota when available
3. Suggest upgrade or provider switch on repeated limits

**Phase to address:** Phase 3 (Error UX)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Secure Storage Layer | Pitfall 2, 3 (API key exposure) | Encrypt at rest, service worker only |
| Provider Abstraction | Pitfall 1, 5, 7, 8 (API differences) | Adapter pattern with per-provider tests |
| Per-Capability Routing | Pitfall 4, 9, 12 (cross-capability issues) | Compatibility validation, migration warnings |
| Model Selection UI | Pitfall 6 (hardcoded models) | Dynamic model fetching + custom input |
| Custom Endpoint Support | Pitfall 10 (URL validation) | Test connection button, HTTPS requirement |
| Settings UI Polish | Pitfall 11, 13 (status indicators) | Active provider display, rate limit feedback |

---

## Security-Specific Pitfalls

### Security Pitfall 1: Encryption Key Derivation

**What goes wrong:** Using weak key derivation for encrypting API keys (or hardcoding the encryption key).

**Why it happens:** Web Crypto API is complex, developers cut corners.

**Consequences:**
- API keys decryptable by anyone with extension source
- No real security despite "encryption"
- Chrome Web Store security review failure

**Prevention:**
1. Use PBKDF2 or HKDF to derive encryption key from user-specific input
2. Salt the key derivation with extension-specific identifier
3. Never hardcode encryption keys
4. Consider using Chrome's built-in credential manager if available

**Phase to address:** Phase 1 (Secure Storage Layer)

---

### Security Pitfall 2: API Key in Error Reports

**What goes wrong:** Error telemetry includes full request with Authorization header.

**Why it happens:** Logging the full error object without sanitization.

**Consequences:**
- API keys in log files
- Keys in crash reports
- Keys in user-submitted bug reports

**Prevention:**
1. Sanitize all error objects before logging
2. Redact Authorization, X-API-Key headers
3. Never log request bodies with credentials
4. Review error telemetry for sensitive data

**Phase to address:** Phase 1 (Provider Abstraction Layer)

---

### Security Pitfall 3: Unencrypted Key in Memory

**What goes wrong:** Decrypting API key once and keeping it in memory for session duration.

**Why it happens:** Avoiding repeated decryption overhead.

**Consequences:**
- Key extractable from memory dump
- Key visible in DevTools heap snapshot
- Extended exposure window

**Prevention:**
1. Decrypt only when needed, discard immediately
2. Use Chrome's Web Authentication API if possible
3. Minimize time key exists in decrypted form
4. Clear decrypted keys on tab/window close

**Phase to address:** Phase 1 (Secure Storage Layer)

---

## Sources Summary

| Source | Confidence | Topics Covered |
|--------|------------|----------------|
| [Anthropic Messages API](https://docs.anthropic.com/en/api/messages) | HIGH | API format, system prompts, authentication |
| [Anthropic Models](https://docs.anthropic.com/en/docs/about-claude/models) | HIGH | Model names, context windows, capabilities |
| [OpenAI API Reference](https://platform.openai.com/docs/api-reference) | HIGH | Authentication, streaming, error formats |
| [OpenAI Models](https://platform.openai.com/docs/models) | HIGH | Model catalog, embeddings dimensions |
| [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage) | HIGH | Storage types, quotas, security considerations |
| [Google Gemini API Key Security](https://ai.google.dev/gemini-api/docs/api-key) | HIGH | Client-side key risks, best practices |
| [LiteLLM Documentation](https://github.com/BerriAI/litellm) | HIGH | Multi-provider abstraction patterns |

---

*Research completed: 2026-03-27*
*All sources verified from official documentation*
