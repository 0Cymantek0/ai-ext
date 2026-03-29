# AI Pocket - Autonomous Browser Agent and Deep Research

## What This Is

AI Pocket is a Chrome extension that is evolving from AI-powered capture and chat into an autonomous browser and research workspace. This milestone repositions the product around an agentic side-panel experience where the user can choose a model, delegate browser tasks, watch progress in real time, intervene when needed, and store evidence directly into pockets for later synthesis.

The product direction for this milestone is a research-grade deep research agent. The agent should browse on the user's behalf, collect findings incrementally, preserve source traceability, write structured notes into a research pocket, and then turn that evidence into a dense multi-page report with citations.

## Core Value

**Trustworthy autonomous research and action** — Users should be able to delegate meaningful browser work and deep research to the extension while retaining clear control, visibility, and verifiable outputs.

## Current Milestone: v2.0 Autonomous Browser Agent + Deep Research

**Goal:** Transform the extension into a smooth agentic browser workspace with deep research, pocket-native evidence capture, and citation-backed report generation.

**Target features:**
- Browser action agent that can navigate, inspect, extract, and act on pages through the extension
- Deep research workflow that explores sources iteratively and accumulates evidence into a research pocket
- Pocket-native evidence model for findings, snippets, notes, source metadata, and synthesis checkpoints
- Multi-page report generation with inline citations and source traceability
- Human-in-the-loop approvals, pause/resume, live run visibility, and model selection for agentic tasks
- Architecture audit and cleanup of unfinished browser-agent and research subsystems before building forward

## Requirements

### Validated

- ✓ Chrome extension MV3 architecture — existing
- ✓ Side panel React UI — existing
- ✓ Typed message passing system — existing
- ✓ IndexedDB + Chrome Storage persistence — existing
- ✓ Pocket management and content capture — existing
- ✓ Conversation and context retrieval pipeline — existing
- ✓ Multi-provider model configuration and routing foundation — validated in v1.0
- ✓ Speech provider routing foundation — validated in v1.0

### Active

- [ ] Agent runtime architecture reset for browser automation and research workflows
- [ ] Browser action agent with safe tool execution and predictable state transitions
- [ ] Deep research orchestration with iterative collection, synthesis, and citation tracking
- [ ] Pocket-native research evidence model and note accumulation pipeline
- [ ] Long-form report generation from research pockets with packed source-backed output
- [ ] Human-in-the-loop controls, observability, and smooth agent UX in the side panel

### Out of Scope

- Fully unattended destructive automation with no approvals
- Remote cloud sync of private research evidence by default
- Team collaboration and shared workspaces in this milestone
- General web-scale crawling outside user-initiated research sessions
- Native mobile clients

## Context

### Existing Product and Codebase

The codebase already contains partial foundations for the new direction:
- A browser-agent subsystem under `ai-extension/src/browser-agent/`
- An agent orchestrator in `ai-extension/src/background/agent-orchestrator.ts`
- An ARIA research controller in `ai-extension/src/background/research/aria-controller.ts`
- Pocket attachment and report generation plumbing already connected to conversations and stored content

These pieces are incomplete and do not yet form a coherent product architecture. This milestone must first determine what to keep, what to refactor, and what to remove so the final system is consistent and maintainable.

### Product Direction

The side panel remains the main control surface. Users should be able to:
- choose the model and agent mode,
- launch an autonomous browser or deep research run,
- monitor live progress and tool usage,
- approve or deny sensitive actions,
- inspect collected evidence as it lands in pockets,
- and generate a final report from the accumulated research state.

### Technical Constraints

- Browser control must stay compatible with Chrome Extension MV3 lifecycle constraints
- Page interaction must flow through content scripts, messaging, and `chrome.tabs` / `chrome.scripting`
- Agent state must survive service worker suspension and resumptions where possible
- Research outputs must preserve enough provenance to support citations and user trust
- The extension must remain smooth in the side panel even during long-running agent sessions

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Keep the side panel as the agent command center | It matches the existing extension UX and supports persistent user oversight | Pending |
| Audit existing browser-agent and research code before extending it | Avoid stacking new abstractions on top of half-finished ones | Pending |
| Use pockets as the native evidence store for research runs | Reuses a core product primitive instead of inventing a parallel memory system | Pending |
| Separate browser action runs from deep research runs in orchestration | They share tools but have different planning, UX, and completion semantics | Pending |
| Make citations and evidence traceability first-class | Research output is not trustworthy without source grounding | Pending |
| Require human approval for sensitive browser actions | Preserves user control while still enabling autonomy | Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check - still the right priority?
3. Audit Out of Scope - reasons still valid?
4. Update Context with current state

---

*Last updated: 2026-03-29*
