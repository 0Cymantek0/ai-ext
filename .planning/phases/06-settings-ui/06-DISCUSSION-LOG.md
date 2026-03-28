# Phase 6: Settings UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 06-settings-ui
**Areas discussed:** Settings layout and navigation, Provider card detail and editing flow, API key management behavior, Routing and provider visibility

---

## Settings layout and navigation

| Option | Description | Selected |
|--------|-------------|----------|
| Single scrollable settings page | Keep one long settings surface with clear sections | |
| Tabbed settings view | Split the surface into top-level tabs such as providers, routing, speech, and advanced | ✓ |
| Master-detail layout | Add a left nav with a detail panel | |

**User's choice:** Tabbed settings view
**Notes:** Provider editing should happen in a dedicated detail view. Adding a provider should start with choosing a provider preset and then continue into setup. Speech should stay in its own top-level section.

---

## Provider card detail and editing flow

| Option | Description | Selected |
|--------|-------------|----------|
| Simple provider overview | Show provider name, enabled state, connection status, and selected model | ✓ |
| Rich overview cards | Add capability badges and key status on the overview list | |
| Dense admin cards | Show endpoint mode, base URL, model, key status, and routing usage in the list | |

**User's choice:** Simple provider overview
**Notes:** Clicking the provider row should open a dedicated detail view. The detail view should use a model picker with expandable advanced model metadata editing. Endpoint override controls should only appear when relevant to that provider.

---

## API key management behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal overview key state | Show only saved/not-saved | |
| Status-oriented overview key state | Show saved/not-saved plus validation or connection status | ✓ |
| Full key actions on overview | Put key-management actions directly on the provider overview card | |

**User's choice:** Status-oriented overview key state
**Notes:** Saved API keys should never be re-revealed after storage. Validation should happen both on save and through a later manual retest action. Key deletion should require confirmation and keep the provider configuration intact.

---

## Routing and provider visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated routing tab only | Edit routing only from a central routing screen | |
| Provider-detail-driven routing | Manage routing from provider detail screens | |
| Hybrid routing visibility | Use a routing tab for assignments and show usage hints in provider detail | ✓ |

**User's choice:** Hybrid routing visibility
**Notes:** Capability routing should be provider-first, with the model shown and editable when needed. Fallback chain should be an advanced routing section. Provider provenance should remain inline near assistant responses and related request UI.

---

## the agent's Discretion

- Exact tab naming, ordering, and visual framing
- Exact responsive layout for provider detail inside the side panel
- Exact styling for provider status and selected-model presentation
- Exact confirmation UX for replace/delete/retest key actions

## Deferred Ideas

- App-wide persistent provider badges beyond the current request/response context
- A full default model-catalog management console
