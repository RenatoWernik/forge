# Changelog

## 1.0.0 (2026-10-30)

First release. forge turns an empty folder into a project run by the gauntlet loop, with the lessons of a real project built that way.

### The process
- The contract of every piece lives in GitHub Issues, with a closed oracle for each criterion (#36).
- Round -1: a critic writes the attacks as tests before any code exists (`gauntlet-attacks`, #47).
- `gauntlet-build` v2: rounds per mode, the materiality test in the critic, and escalation after two failed rounds of the same criterion (#51).
- `gauntlet-batch`: batches of pieces with a tester, failures classified as the batch's, already broken on main, or flaky (#54), with verified command blocks (#61, #65).
- Two modes, `rigorous` and `accelerated`, saved in `.claude/forge.json` (#25).

### The generated project
- `CLAUDE.md`, `AGENTS.md` and `FRAMEWORK.md` with the invariants and the orchestrator manual (#36), role briefs and the checkpoint format (#43).
- Model interview: the setup proposes a model and an effort for each role, with the reason (#28).
- Optional protection hooks in the project's own settings: no kill by process name, no tests in the background, a warning when an agent stops writing checkpoints (#29).
- Live panel: `painel.json` and its shared reader (#23), the Claude Code mod (#27) and the web page (#33).
- Integration of `/forge:new-project`, the bootstrap, `/forge:sync` and the READMEs (#55).

### The components
- claude-mem left the component list; the 7 components are the gauntlet loop, AI Memory, Ponytail, SDD, TDD, Matt Pocock's skills and Graphify (#16).
- `compat.json` records the version forge was verified with (#42).
- `/forge:update` compares each component and the plugin with its latest public release and updates them one at a time, each with your yes (#48). `--check` exits with `4` when something needs handling and reports only the warnings it prints (#59, #65).

### Quality
- A corpus of generated projects and mutations checks `check.cjs` (#17).
