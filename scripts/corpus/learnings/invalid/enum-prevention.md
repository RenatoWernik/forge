<!-- expect: E-001 PREVENTION -->
# Learnings 2026-10

## E-001
- DATE: 2026-10-20
- TRIGGER: critic-rejected
- DETECTED-BY: critic, round 2 of ticket 7
- SYMPTOM: the test port collided with a running server
- CLASS: fixed-test-port
- CAUSE: the harness picked a fixed port
- CAUSE-OWNER: harness
- FAILED-LAYER: tdd
- MISSING-CONTEXT: none
- PREVENTION: docs
- PREVENTION-PATH: tests/learn/port.test.mjs
- FAILS: closed
- REGRESSION: tests/learn/port-regression.test.mjs
- CLEAN-CASE: tests/learn/port-clean.test.mjs
- AREA: tests/**, src/net/*.js
- SCOPE: project
- REVIEW-BY: 2026-11-03
- STATUS: prevented
