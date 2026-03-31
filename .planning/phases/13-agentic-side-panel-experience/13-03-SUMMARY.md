---
phase: 13-agentic-side-panel-experience
plan: 03
subsystem: ui
tags: [react, workflow-launcher, tabs, model-selector, sidepanel]

# Dependency graph
requires:
  - phase: 13-agentic-side-panel-experience
    provides: BrowserActionPanel, DeepResearchPanel, AgentPanelLayout
provides:
  - WorkflowTabs for mode selection (browser-action vs deep-research)
  - ModelSelector for workflow-aware model selection
  - WorkflowLauncher unifying tabs, model selector, and active panel
  - ChatApp integration with separate model selection per workflow
affects: [13-04]

tech-stack:
  added: []
  patterns: [tab-based-workflow-switching, per-workflow-model-selection, unified-launcher]

key-files:
  created:
    - ai-extension/src/sidepanel/components/WorkflowTabs.tsx
    - ai-extension/src/sidepanel/components/ModelSelector.tsx
    - ai-extension/src/sidepanel/components/WorkflowLauncher.tsx
  modified:
    - ai-extension/src/sidepanel/ChatApp.tsx

key-decisions:
  - "WorkflowLauncher resolves model selection internally, passing concrete provider/model info to child panels"
  - "Separate model state per workflow (browserActionModel, deepResearchModel) replaces the shared selectedChatModel for agent runs"
  - "Model options built from the same buildChatModelOptions logic, duplicated in WorkflowLauncher to keep it self-contained"

patterns-established:
  - "Tab-based workflow switching with pill-shaped tabs and mode descriptions"
  - "Per-workflow model selection with independent selections that persist across tab switches"

requirements-completed: [UX-01, UX-03]

# Metrics
duration: 20min
completed: 2026-03-31
---

# Phase 13 Plan 03: Workflow Launcher Summary

**Created unified WorkflowLauncher with tab-based navigation, per-workflow model selection, and conditional panel rendering, replacing the side-by-side panel layout with a single active workflow view.**

## Performance

- **Duration:** 20 min
- **Tasks:** 4
- **Files modified:** 4

## Accomplishments
- Created WorkflowTabs component with two pill-shaped tabs (Browser Action, Deep Research) and mode descriptions
- Created ModelSelector component with dropdown of configured models, Auto option, and workflow-aware selection
- Created WorkflowLauncher unifying tabs + model selector + conditional panel rendering
- Integrated into ChatApp.tsx with separate model state per workflow

## Files Created/Modified
- `ai-extension/src/sidepanel/components/WorkflowTabs.tsx` - Tab-based workflow selector with Globe/Search icons, descriptions, active/inactive/disabled states
- `ai-extension/src/sidepanel/components/ModelSelector.tsx` - Model dropdown from settings snapshot, Auto option, disabled state handling
- `ai-extension/src/sidepanel/components/WorkflowLauncher.tsx` - Unified launcher wrapping tabs, model selector, and active panel with per-workflow model resolution
- `ai-extension/src/sidepanel/ChatApp.tsx` - Added activeWorkflowMode, browserActionModel, deepResearchModel state; integrated WorkflowLauncher replacing side-by-side panels

## Self-Check: PASSED

All created files verified present. All task commits verified in git log. Build passes clean.
