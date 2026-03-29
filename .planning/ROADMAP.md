# Roadmap: AI Pocket - Autonomous Browser Agent + Deep Research

## Overview

This roadmap turns AI Pocket into an agentic browser workspace centered on two major workflows: browser-action execution and research-grade deep research. The roadmap begins with an architectural reset of partial agent systems already in the repository, then builds a safe browser runtime, deep research orchestration, pocket-native evidence accumulation, dense report generation, and a polished side-panel control experience.

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
- [ ] **Phase 13: Agentic Side Panel Experience** - Unify launch flows, timelines, model selection, and run review UX

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
**Plans**: TBD

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

### Phase 9: Human-in-the-Loop Control Layer
**Goal**: Add explicit control boundaries so autonomy remains understandable and safe
**Depends on**: Phase 8
**Requirements**: CTRL-01, CTRL-02, CTRL-03, CTRL-04
**Success Criteria** (what must be TRUE):
1. Sensitive actions require approval before execution
2. Approval prompts include target context and reason for the action
3. Run timeline records approvals, rejections, pauses, resumes, and cancellations
4. UI clearly communicates whether the agent is running, blocked on user input, cancelled, failed, or completed
**Plans**: TBD

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
**Plans**: TBD

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
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 7 -> 8 -> 9 -> 10 -> 11 -> 12 -> 13

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 7. Agent Architecture Reset | 0/TBD | Not started | - |
| 8. Browser Action Runtime | 0/TBD | Not started | - |
| 9. Human-in-the-Loop Control Layer | 0/TBD | Not started | - |
| 10. Deep Research Orchestrator | 0/TBD | Not started | - |
| 11. Pocket Evidence Pipeline | 0/TBD | Not started | - |
| 12. Citation-Backed Report Engine | 0/TBD | Not started | - |
| 13. Agentic Side Panel Experience | 0/TBD | Not started | - |

---

*Roadmap created: 2026-03-29*
*Granularity: standard*
