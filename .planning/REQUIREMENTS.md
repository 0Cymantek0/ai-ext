# Requirements: AI Pocket - Autonomous Browser Agent + Deep Research

**Defined:** 2026-03-29
**Milestone:** v2.0
**Core Value:** Trustworthy autonomous research and action

## v2.0 Requirements

Requirements for the autonomous browser agent and deep research milestone. Each requirement is written as a user capability and maps to exactly one roadmap phase.

### Architecture Audit and Runtime Reset

- [ ] **ARCH-01**: Team can inventory all existing browser-agent, research, and report-generation subsystems and classify each as keep, refactor, or remove
- [x] **ARCH-02**: System exposes a single agent runtime contract for browser-action runs and deep-research runs
- [x] **ARCH-03**: Agent run state survives service worker interruptions through persisted checkpoints and resumable session state
- [x] **ARCH-04**: Tool execution, run events, and evidence writes share typed contracts across side panel, service worker, and content scripts

### Browser Action Agent

- [ ] **AGENT-01**: User can start a browser-action task from the side panel using a selected model
- [ ] **AGENT-02**: Agent can navigate tabs and pages, inspect the DOM, extract structured page state, and execute page interactions through approved tools
- [ ] **AGENT-03**: Agent can stream its plan, current action, and intermediate results back to the side panel while running
- [ ] **AGENT-04**: Agent can recover from non-fatal page-action failures by retrying, replanning, or asking for help instead of silently failing
- [ ] **AGENT-05**: User can pause, resume, or cancel an active browser-action run without corrupting its stored state

### Human-in-the-Loop Safety and Control

- [x] **CTRL-01**: User is prompted to approve sensitive browser actions before execution
- [x] **CTRL-02**: User can inspect the exact pending action, target page context, and reason for the approval request
- [x] **CTRL-03**: System records approvals, rejections, pauses, resumes, and cancellations in the run timeline
- [x] **CTRL-04**: Agent UI clearly distinguishes autonomous execution, waiting-for-user state, and terminal outcomes

### Deep Research Orchestration

- [ ] **RES-01**: User can start a deep research project from the side panel with a topic, goal, and selected model
- [ ] **RES-02**: Research agent can collect information iteratively across multiple browsing steps instead of relying on one-shot summarization
- [ ] **RES-03**: Research agent can maintain a research plan with subquestions, coverage progress, and open gaps
- [ ] **RES-04**: Research agent can synthesize intermediate findings during the run and refine what to search next
- [ ] **RES-05**: Research agent can preserve per-finding source metadata sufficient for later citations

### Pocket-Native Evidence Capture

- [ ] **POCKET-01**: Starting a deep research run creates or links a dedicated research pocket for that project
- [ ] **POCKET-02**: Agent can write findings into the research pocket as structured evidence entries during the run
- [ ] **POCKET-03**: Each evidence entry preserves source URL, title, captured excerpt or claim, timestamp, and research context
- [ ] **POCKET-04**: User can review accumulated evidence and interim notes in the existing pocket experience without waiting for final report generation
- [ ] **POCKET-05**: Evidence capture avoids duplicate entries or clearly marks duplicates when the same source is revisited

### Report Generation and Citations

- [ ] **REPORT-01**: User can generate a multi-page report from a research pocket after or during a research run
- [ ] **REPORT-02**: Report contains a clear structure with sections, synthesized findings, and citations linked to collected evidence
- [ ] **REPORT-03**: Report generator can distinguish grounded findings from unresolved or weakly supported claims
- [ ] **REPORT-04**: User can inspect which evidence items support each major section or claim in the report
- [ ] **REPORT-05**: Report output remains information-dense and suitable for serious research use rather than generic summary prose

### Agent Experience and Model Selection

- [ ] **UX-01**: User can choose among configured models for browser-action and deep-research runs
- [ ] **UX-02**: Side panel shows a live run timeline including plan steps, tool calls, evidence writes, approvals, and errors
- [ ] **UX-03**: Side panel exposes distinct entry points for browser-action tasks and deep-research projects
- [ ] **UX-04**: User can reopen historical runs and understand what happened, what was collected, and how the run ended
- [ ] **UX-05**: Agent experience remains responsive during long-running sessions and does not block core pocket browsing

## Future Requirements

Tracked but not in this milestone.

- **FUT-01**: Shared team research workspaces and collaborative review
- **FUT-02**: Automated recurring monitoring research with scheduled reruns
- **FUT-03**: Cross-device sync of research projects and evidence
- **FUT-04**: Fully autonomous unattended workflows for trusted domains
- **FUT-05**: External export pipelines for PDF, DOCX, and publish-ready briefing packs

## Out of Scope

Explicitly excluded to prevent scope creep in this milestone.

| Feature | Reason |
|---------|--------|
| No-approval destructive browser automation | Too risky for first milestone of agentic browser control |
| Team collaboration and shared editing | Single-user workflow first |
| Background crawling without user-initiated task context | Product should stay user-directed and resource-bounded |
| Mobile and native desktop clients | Focus is the Chrome extension experience |
| Automatic cloud sync of research evidence | Privacy and security concerns |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ARCH-01 | Phase 7 | Pending |
| ARCH-02 | Phase 7 | Complete |
| ARCH-03 | Phase 7 | Complete |
| ARCH-04 | Phase 7 | Complete |
| AGENT-01 | Phase 8 | Pending |
| AGENT-02 | Phase 8 | Pending |
| AGENT-03 | Phase 8 | Pending |
| AGENT-04 | Phase 8 | Pending |
| AGENT-05 | Phase 8 | Pending |
| CTRL-01 | Phase 9 | Complete |
| CTRL-02 | Phase 9 | Complete |
| CTRL-03 | Phase 9 | Complete |
| CTRL-04 | Phase 9 | Complete |
| RES-01 | Phase 10 | Pending |
| RES-02 | Phase 10 | Pending |
| RES-03 | Phase 10 | Pending |
| RES-04 | Phase 10 | Pending |
| RES-05 | Phase 10 | Pending |
| POCKET-01 | Phase 11 | Pending |
| POCKET-02 | Phase 11 | Pending |
| POCKET-03 | Phase 11 | Pending |
| POCKET-04 | Phase 11 | Pending |
| POCKET-05 | Phase 11 | Pending |
| REPORT-01 | Phase 12 | Pending |
| REPORT-02 | Phase 12 | Pending |
| REPORT-03 | Phase 12 | Pending |
| REPORT-04 | Phase 12 | Pending |
| REPORT-05 | Phase 12 | Pending |
| UX-01 | Phase 13 | Pending |
| UX-02 | Phase 13 | Pending |
| UX-03 | Phase 13 | Pending |
| UX-04 | Phase 13 | Pending |
| UX-05 | Phase 13 | Pending |

**Coverage:**
- v2.0 requirements: 33 total
- Mapped to phases: 33
- Unmapped: 0

---

*Requirements defined: 2026-03-29*
*Last updated: 2026-03-29 after roadmap creation*
