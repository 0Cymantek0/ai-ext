# Phase 3: Router + Settings Manager - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
 Decisions captured in CONTEXT.md — this log preserves the alternatives considered.
 It the **DISCUSSION-LOG.md**.

**Date:** 2026-03-28
**Phase:** 03-router-settings-manager
**Areas discussed:** Routing Strategy, Settings persistence, Fallback behavior, Embedding provider warnings, Model parameters

---

## Auto mode (Recommended)

- Auto mode was default and Gemini Nano auto auto-classifies the prompt complexity level and intent, budget signal
 and outputs structured metadata ( NOT the final model selection)
- Heuristics engine takes that metadata + model sheet + user-defined fallback order to selectss provider
- Keywords/trigger words bypass Nano classifier

| Option | Description | Route requests (prompt) complexity, intent, budget signal) | ✓ |
| **User's choice:** Auto (default)
| **User's choice:** Manual mode — pick model directly (Recommended)
| **Notes:** None |

---

## Claude's Discretion
- Exact model sheet schema, capability flags
- Loading/fallback chain
- Model selection logic
- Internal model catalog
- Error handling patterns
- Adding new provider types to factory

