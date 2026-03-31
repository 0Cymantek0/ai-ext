# Roadmap: AI Pocket - Autonomous Browser Agent + Deep Research

## Overview

This roadmap turns AI Pocket into an agentic browser workspace centered on two major workflows: browser-action execution and research-grade deep research. The roadmap begins with an architectural reset of partial agent systems already in the repository, then builds a safe browser runtime, deep research orchestration, pocket-native evidence accumulation, dense report generation, and a polished side-panel control experience. The milestone now also includes closure phases for multi-model capability guardrails, autonomous evaluation, and production hardening so the final system is not only implemented but trustworthy to operate daily.

Phase 6 settings follow-up work was completed on 2026-03-29 to stabilize provider detail, routing, speech, and provenance surfaces before deeper agent-platform work proceeds. The roadmap focus still starts at Phase 7 for milestone v2.0.

## Phases

**Phase Numbering:**
- Integer phases continue from the previous milestone
- Decimal phases remain reserved for urgent insertions

- [ ] **Phase 7: Agent Architecture Reset** - Audit existing agentic systems, converge runtime contracts, and establish resumable run state
- [ ] **Phase 8: Browser Action Runtime** - Deliver a reliable browser-action agent loop with tool execution and recovery
- [ ] **Phase 9: Human-in-the-Loop Control Layer** - Add approvals, run governance, and safety-aware action visibility
- [ ] **Phase 10: Deep Research Orchestrator** - Build iterative research planning, source gathering, and mid-run synthesis
- [ ] **Phase 11: Pocket Evidence Pipeline** - Make research pockets the live evidence store for agent findings and notes
- [ ] **Phase 12: Citation-Backed Report Engine** - Generate dense multi-page reports grounded in captured evidence
- [x] **Phase 13: Agentic Side Panel Experience** - Unify launch flows, timelines, model selection, and run review UX (completed 2026-03-31)
- [ ] **Phase 14: Model Capability and Workflow Guardrails** - Ensure every supported provider/model is capability-checked and safely routed for the chosen workflow
- [ ] **Phase 15: Autonomous Evaluation and Regression Harness** - Prove browser-action and deep-research flows work end-to-end across supported scenarios
- [ ] **Phase 16: MV3 Reliability, Performance, and Shipping Hardening** - Harden lifecycle, responsiveness, and maintainability for real-world use

## Phase Details

### Phase 7: Agent Architecture Reset
**Goal**: Convert the repo's partial browser-agent, research, and report code into one coherent runtime foundation that can support the new product direction
**Depends on**: Phase 6 and existing v1.0 infrastructure
**Requirements**: ARCH-01, ARCH-02, ARCH-03, ARCH-04
**Success Criteria** (what must be TRUE):
1. Existing browser-agent, research, and report subsystems are audited with explicit keep/refactor/remove outcomes
2. One typed runtime contract exists for run state, tool events, evidence writes, and terminal outcomes
3. Agent checkpoints can restore enough state to resume or inspect interrupted runs
4. Obsolete or conflicting agent abstractions identified by the audit are removed or isolated behind the new runtime
**Plans**: 3 plans
Plans:
- [ ] 07-01-PLAN.md — Audit current runtime subsystems and define canonical shared runtime contracts plus Wave 0 tests
- [x] 07-02-PLAN.md — Add canonical persistence, checkpoints, and import-once migration from legacy browser-agent stores
- [ ] 07-03-PLAN.md — Rewire service worker, side panel, browser-action/research flows, and report consumption to the canonical runtime

### Phase 8: Browser Action Runtime
**Goal**: Deliver a dependable browser-action agent that can inspect and interact with pages through extension-safe tools
**Depends on**: Phase 7
**Requirements**: AGENT-01, AGENT-02, AGENT-03, AGENT-04, AGENT-05
**Success Criteria** (what must be TRUE):
1. User can start a browser-action run from the side panel with a chosen model
2. Agent can navigate, inspect page state, and execute non-destructive actions through registered tools
3. Side panel receives streaming step updates, current intent, and tool results during execution
4. Failed actions produce recoverable replanning or actionable user feedback instead of opaque termination
5. Pausing, resuming, and cancelling preserve coherent run state
**Plans**: TBD

### Phase 08.1: Complete Browser Action Execution Loop (INSERTED)

**Goal:** [Urgent work - to be planned]
**Requirements**: TBD
**Depends on:** Phase 8
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 08.1 to break down)

### Phase 9: Human-in-the-Loop Control Layer
**Goal**: Add explicit control boundaries so autonomy remains understandable and safe
**Depends on**: Phase 8
**Requirements**: CTRL-01, CTRL-02, CTRL-03, CTRL-04
**Success Criteria** (what must be TRUE):
1. Sensitive actions require approval before execution
2. Approval prompts include target context and reason for the action
3. Run timeline records approvals, rejections, pauses, resumes, and cancellations
4. UI clearly communicates whether the agent is running, blocked on user input, cancelled, failed, or completed
**Plans**: 3 plans
Plans:
- [x] 09-01-PLAN.md — Extend approval contracts, create ApprovalService, rewire runtime to emit approval.requested instead of failure, add service worker handler
- [x] 09-02-PLAN.md — Add STATUS_DISPLAY selector mapping, export isTerminalStatus, enrich timeline selectors with tests
- [x] 09-03-PLAN.md — Build AgentApprovalCard, AgentRunStatusBadge, AgentRunControls UI components and wire into ChatApp

### Phase 10: Deep Research Orchestrator
**Goal**: Build a research-grade agent loop that iterates through subquestions, gathers evidence, and synthesizes as it goes
**Depends on**: Phase 9
**Requirements**: RES-01, RES-02, RES-03, RES-04, RES-05
**Success Criteria** (what must be TRUE):
1. User can start a deep research project with topic, goal, and model selection
2. Research run maintains an explicit plan with subquestions, progress, and open gaps
3. Agent performs multi-step browsing and collection rather than a single summarization call
4. Intermediate synthesis influences subsequent browsing or extraction decisions
5. Every meaningful finding carries source metadata for later citation
**Plans**: TBD

### Phase 11: Pocket Evidence Pipeline
**Goal**: Turn pockets into the native evidence workspace for in-progress and completed research projects
**Depends on**: Phase 10
**Requirements**: POCKET-01, POCKET-02, POCKET-03, POCKET-04, POCKET-05
**Success Criteria** (what must be TRUE):
1. Research project creation provisions or links a dedicated research pocket
2. Agent writes structured evidence entries into that pocket during execution
3. Evidence entries include source metadata, excerpts or claims, timestamps, and research context
4. User can inspect live evidence accumulation in the pocket UI before final report generation
5. Duplicate or repeated-source evidence is prevented or clearly marked
**Plans**: TBD

### Phase 12: Citation-Backed Report Engine
**Goal**: Produce in-depth research reports from pocket evidence with strong grounding and traceability
**Depends on**: Phase 11
**Requirements**: REPORT-01, REPORT-02, REPORT-03, REPORT-04, REPORT-05
**Success Criteria** (what must be TRUE):
1. User can generate a long-form report from a research pocket
2. Report sections are backed by explicit evidence and citations
3. Weakly supported or unresolved claims are distinguished from grounded findings
4. User can inspect which evidence supports each section or major claim
5. Final report quality is dense and research-oriented rather than generic summary output
**Plans**: 3 plans
Plans:
- [ ] 12-01-PLAN.md — Define canonical report contracts, provenance schemas, and Wave 0 report-engine tests
- [ ] 12-02-PLAN.md — Implement evidence normalization, staged report generation, durable storage, and service-worker wiring
- [ ] 12-03-PLAN.md — Migrate report viewer rendering and add minimal side-panel report launch plus provenance inspection

### Phase 13: Agentic Side Panel Experience
**Goal**: Make the full agent experience smooth, understandable, and ready for daily use
**Depends on**: Phase 12
**Requirements**: UX-01, UX-02, UX-03, UX-04, UX-05
**Success Criteria** (what must be TRUE):
1. User can clearly choose between browser-action and deep-research workflows
2. User can select configured models appropriate to the chosen workflow
3. Side panel shows a live timeline of planning, tool calls, approvals, evidence writes, and errors
4. Historical runs remain inspectable after completion
5. Long-running agent work does not block normal pocket browsing and side panel responsiveness
**Plans**: 4 plans
Plans:
- [x] 13-01-PLAN.md — Extract inline agent UI from ChatApp into BrowserActionPanel, DeepResearchPanel, and AgentPanelLayout components
- [x] 13-02-PLAN.md — Build AgentTimeline, AgentTimelineEntry, RunHistoryPanel, and RunHistoryItem components for live events and historical run inspection
- [x] 13-03-PLAN.md — Create WorkflowTabs, ModelSelector, and WorkflowLauncher for unified workflow launch with model selection
- [x] 13-04-PLAN.md — Optimize event subscription with useAgentRunEvents hook and service worker event batching for non-blocking UX
**UI hint**: yes

### Phase 14: Model Capability and Workflow Guardrails
**Goal**: Make multi-model autonomy safe and predictable by enforcing workflow capability rules before and during agent execution
**Depends on**: Phase 13
**Requirements**: COMPAT-01, COMPAT-02, COMPAT-03
**Success Criteria** (what must be TRUE):
1. Browser-action and deep-research launches validate the selected provider/model against workflow capability requirements before the run starts
2. Side panel explains incompatibility or downgrade decisions in user-comprehensible terms instead of allowing opaque runtime failure
3. Workflow-specific default model preferences and fallback rules are persisted and reusable across sessions
4. Runtime can safely block, downgrade, or reroute unsupported tool/citation/report needs without corrupting run state
**Plans**: TBD

### Phase 15: Autonomous Evaluation and Regression Harness
**Goal**: Create a repeatable quality gate proving the agent can complete core tasks with acceptable autonomy, grounding, and recovery behavior
**Depends on**: Phase 14
**Requirements**: EVAL-01, EVAL-02, EVAL-03
**Success Criteria** (what must be TRUE):
1. Team can run deterministic end-to-end scenarios for browser-action and deep-research workflows against supported models/providers
2. Eval outputs score success, recovery quality, approval handling, evidence grounding, and report provenance in a structured way
3. Critical eval scenarios run as a pre-ship or pre-complete milestone gate rather than a one-off manual check
4. Regressions identify which stage failed: launch, planning, tool use, evidence capture, report generation, or historical inspection
**Plans**: TBD

### Phase 16: MV3 Reliability, Performance, and Shipping Hardening
**Goal**: Harden the agent platform so long-running autonomous work remains resilient, responsive, and maintainable in Chrome MV3
**Depends on**: Phase 15
**Requirements**: REL-01, REL-02, REL-03
**Success Criteria** (what must be TRUE):
1. Service worker interruption and checkpoint replay do not duplicate browser actions, evidence writes, or report-stage artifacts
2. Side panel remains responsive during long runs, large evidence pockets, and report generation workloads
3. Fragile central surfaces such as runtime routing and heavy UI modules are decomposed or isolated enough for safe maintenance
4. Release verification includes lifecycle, stress, and regression checks that reflect real autonomous usage
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 7 -> 8 -> 9 -> 10 -> 11 -> 12 -> 13 -> 14 -> 15 -> 16

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 7. Agent Architecture Reset | 0/3 | Not started | - |
| 8. Browser Action Runtime | 0/TBD | Not started | - |
| 9. Human-in-the-Loop Control Layer | 0/3 | Not started | - |
| 10. Deep Research Orchestrator | 0/TBD | Not started | - |
| 11. Pocket Evidence Pipeline | 0/TBD | Not started | - |
| 12. Citation-Backed Report Engine | 0/TBD | Not started | - |
| 13. Agentic Side Panel Experience | 4/4 | Complete    | 2026-03-31 |
| 14. Model Capability and Workflow Guardrails | 0/TBD | Not started | - |
| 15. Autonomous Evaluation and Regression Harness | 0/TBD | Not started | - |
| 16. MV3 Reliability, Performance, and Shipping Hardening | 0/TBD | Not started | - |

---

*Roadmap created: 2026-03-29*
*Updated: 2026-03-31 after inferred milestone gap audit*
*Granularity: standard*
