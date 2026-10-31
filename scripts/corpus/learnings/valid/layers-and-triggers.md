# Learnings 2026-10

## E-001
- DATE: 2026-10-20
- TRIGGER: user
- DETECTED-BY: critic, round 2 of ticket 7
- SYMPTOM: the test port collided with a running server
- CLASS: class-test
- CAUSE: the harness picked a fixed port
- CAUSE-OWNER: harness
- FAILED-LAYER: tdd
- MISSING-CONTEXT: none
- PREVENTION: test
- PREVENTION-PATH: tests/learn/port.test.mjs
- FAILS: closed
- REGRESSION: tests/learn/port-regression.test.mjs
- CLEAN-CASE: tests/learn/port-clean.test.mjs
- AREA: tests/**, src/net/*.js
- SCOPE: project
- REVIEW-BY: 2026-12-20
- STATUS: prevented

## E-002
- DATE: 2026-10-20
- TRIGGER: critic-rejected
- DETECTED-BY: critic, round 2 of ticket 7
- SYMPTOM: the test port collided with a running server
- CLASS: class-hook
- CAUSE: the harness picked a fixed port
- CAUSE-OWNER: harness
- FAILED-LAYER: tdd
- MISSING-CONTEXT: none
- PREVENTION: hook
- PREVENTION-PATH: .claude/hooks/port.mjs
- FAILS: closed
- REGRESSION: tests/learn/port-regression.test.mjs
- CLEAN-CASE: tests/learn/port-clean.test.mjs
- AREA: tests/**, src/net/*.js
- SCOPE: project
- REVIEW-BY: 2026-12-20
- STATUS: prevented

## E-003
- DATE: 2026-10-20
- TRIGGER: escape
- DETECTED-BY: critic, round 2 of ticket 7
- SYMPTOM: the test port collided with a running server
- CLASS: class-check
- CAUSE: the harness picked a fixed port
- CAUSE-OWNER: harness
- FAILED-LAYER: tdd
- MISSING-CONTEXT: none
- PREVENTION: check
- PREVENTION-PATH: scripts/port-check.mjs
- FAILS: closed
- REGRESSION: tests/learn/port-regression.test.mjs
- CLEAN-CASE: tests/learn/port-clean.test.mjs
- AREA: tests/**, src/net/*.js
- SCOPE: project
- REVIEW-BY: 2026-12-20
- STATUS: prevented

## E-004
- DATE: 2026-10-20
- TRIGGER: noise
- DETECTED-BY: critic, round 2 of ticket 7
- SYMPTOM: the test port collided with a running server
- CLASS: class-contract
- CAUSE: the harness picked a fixed port
- CAUSE-OWNER: harness
- FAILED-LAYER: tdd
- MISSING-CONTEXT: none
- PREVENTION: contract
- PREVENTION-PATH: docs/port-contract.md
- FAILS: closed
- REGRESSION: none
- CLEAN-CASE: none
- AREA: tests/**, src/net/*.js
- SCOPE: project
- REVIEW-BY: 2026-12-20
- STATUS: prevented

## E-005
- DATE: 2026-10-20
- TRIGGER: hook-blocked
- DETECTED-BY: critic, round 2 of ticket 7
- SYMPTOM: the test port collided with a running server
- CLASS: class-text
- CAUSE: the harness picked a fixed port
- CAUSE-OWNER: harness
- FAILED-LAYER: tdd
- MISSING-CONTEXT: none
- PREVENTION: text
- PREVENTION-PATH: CLAUDE.md
- FAILS: closed
- REGRESSION: none
- CLEAN-CASE: none
- AREA: tests/**, src/net/*.js
- SCOPE: project
- REVIEW-BY: 2026-11-03
- APPROVED: yes, 2026-10-20T10:00:00Z
- STATUS: prevented

## E-006
- DATE: 2026-10-20
- TRIGGER: incident
- DETECTED-BY: critic, round 2 of ticket 7
- SYMPTOM: the test port collided with a running server
- CLASS: class-memory
- CAUSE: the harness picked a fixed port
- CAUSE-OWNER: harness
- FAILED-LAYER: tdd
- MISSING-CONTEXT: none
- PREVENTION: memory
- PREVENTION-PATH: ai-memory:gotchas/fixed-test-port.md
- FAILS: closed
- REGRESSION: none
- CLEAN-CASE: none
- AREA: tests/**, src/net/*.js
- SCOPE: project
- REVIEW-BY: 2026-11-03
- STATUS: prevented
