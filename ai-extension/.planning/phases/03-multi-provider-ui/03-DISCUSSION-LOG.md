# Phase 03: Multi-Provider Integration & UI Overhaul - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** March 28, 2026
**Phase:** 03-multi-provider-ui
**Areas discussed:** Model Routing, Provider Settings UI, Model Library, Model Tiers, Visual Feedback.

---

## Model Routing Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Heuristic Only | Hardcoded word count and keyword matching. | |
| User-Locked | Strictly follow the user's manual selection. | |
| Smart Mode (Nano Dispatcher) | Gemini Nano analyzes the task and routes to the best model bio. | ✓ |

**User's choice:** Smart Mode where Gemini Nano handles the classification and routing.
**Notes:** Users want to be able to influence this via "Routing Bios" and "Trigger Words" in settings. Gemini Nano performs small background tasks to avoid cloud costs.

---

## Provider Settings UI

| Option | Description | Selected |
|--------|-------------|----------|
| Settings Overlay | A modal over the chat. | |
| Dedicated Page | A full-screen "Model Library" for deep config. | ✓ |
| Sidepanel Drawer | A slide-out for quick tweaks. | ✓ |

**User's choice:** A mixture of both. A full settings page for library management and a drawer for quick chat-level adjustments.

---

## Model Tiers & Granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Standard Grouping | Group GPT variants into "Pro/Standard" tiers. | |
| Granular Variants | Treat GPT 5.4 Nano/Mini/Pro as distinct, with Low/Med/High as sub-tiers. | ✓ |

**User's choice:** Fully granular. Every model like GPT 5.4 Pro/Nano/Mini is a separate model, and sub-tiers like Low/Medium/High/Extra High are specific toggles visible only if the model supports them.

---

## Visual Feedback

**User's choice:** Visual Flow Indicator showing the routing process (Nano Router icon + status text) and Selection Meta text below responses showing the selected model and reason.

---

## Claude's Discretion

The user has explicitly defined the routing logic, UI structure, and model tier handling. Claude has discretion over the specific layout and animation styling for the "Visual Flow Indicator."

## Deferred Ideas

- **Zork AI Game Integration**: Deferred until the core UI overhaul is complete.
- **PDF Document Support**: Deferred to focus on the multi-provider orchestration logic.
