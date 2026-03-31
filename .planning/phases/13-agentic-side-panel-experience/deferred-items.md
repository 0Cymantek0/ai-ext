Pre-existing test failures in tests/sidepanel/:
- provider-settings-sheet.test.tsx (13 failures) - Settings sheet rendering/test infrastructure
- deep-research-launch.test.tsx (1 failure) - Needs AGENT_RUN_STATUS mock for hook hydration
- deep-research-timeline.test.tsx (1 failure) - Needs AGENT_RUN_STATUS mock for hook hydration
- research-pocket-evidence.test.tsx (1 failure) - Deep research panel rendering issue
These are out of scope for Plan 04 and were failing before Plan 04 changes.
