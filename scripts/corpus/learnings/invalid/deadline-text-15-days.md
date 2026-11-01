<!-- expect: E-001 REVIEW-BY -->
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
- PREVENTION: text
- PREVENTION-PATH: CLAUDE.md
- FAILS: closed
- REGRESSION: none
- CLEAN-CASE: none
- AREA: tests/**, src/net/*.js
- SCOPE: project
- REVIEW-BY: 2026-11-04
- APPROVED: yes, 2026-10-20T10:00:00Z
- STATUS: prevented
