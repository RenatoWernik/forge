# BOOTSTRAP.md

Single checklist of CP0 (assembling the framework in {{PROJECT_NAME}}). It exists only while CP0 is open; in step 9 it moves to `.gauntlet/cp0/`. What stays valid afterwards is in [FRAMEWORK.md](./FRAMEWORK.md) section 3. The user approves the checklist once (that counts as the OK of FRAMEWORK.md section 8 for steps 1 to 6 and as approval of the pieces and bars of step 8); an action outside it needs its own OK. State: `node .claude/check.cjs --env` (a line in FAIL = an open step; steps 5 and 8 have no line that fails, and step 9 ends in `info  CP0: closed`). The machine tools (uv, ai-memory, Ponytail, Spec Kit, the Matt Pocock skills, Graphify) were checked and installed by forge's `new-project` skill before this file was written; if `check.cjs --env` says one is missing, run forge's `doctor` again and ask the user before installing.

| # | Action | Who | Done when (line of check.cjs) |
|---|---|---|---|
| 0 | Panel published from `.claude/dashboard/panel.html` and seeded (`meta/project`, `meta/framework`); done by the `new-project` skill. Without the Artifact tool the panel stays off: the workflows still run and their panel writes end in a WARNING | orchestrator | the URL in CLAUDE.md opens the panel; no line (the panel is external) |
| 1 | `.ai-memory.toml` (block in FRAMEWORK.md section 3; the scaffold already wrote it) | orchestrator | `.ai-memory.toml admits capture` (it may stay in FAIL until step 3 has created the project in ai-memory: run the check again after step 3) |
| 2 | `specify init --here --force --non-interactive --integration claude --script {{SPECIFY_SCRIPT}}` (once, serial; the `/speckit-*` skills call `.specify/scripts/` in this script type) | orchestrator | `Spec-Kit: .specify/ and the /speckit-* skills installed` |
| 3 | Seed ai-memory (block below; the write creates the project) | orchestrator | `ai-memory: page _rules/framework.md seeded` |
| 4 | `.graphifyignore` and `.gitignore` (the scaffold already wrote them); `git init -b main` (only if there is no repository yet: `graphify hook install` writes to `.git/hooks` and fails without it); `graphify hook install`; `graphify claude install` (it writes absolute paths of this machine into `.claude/settings.json`: tell the user before any commit, who may prefer to keep that file out of git) | orchestrator | `Graphify: post-commit and post-checkout hooks installed` and `git: repository and .gitignore` |
| 5 | `memory_handoff_begin {workspace:"{{MEM_WORKSPACE}}", project:"{{MEM_PROJECT}}", summary, open_questions, next_steps, files_touched}` and restart the session at the project root (the `/speckit-*` skills only show up in a session started after `specify init`) | orchestrator, then user | the new session lists `/speckit-constitution` and shows the "pending handoff" block |
| 6 | Type `/mattpocock-skills:setup-matt-pocock-skills`: tracker = GitHub (`{{REPO}}`); labels = default; write to the existing CLAUDE.md | user (the skill is human-only) | `Matt Pocock: /setup done` |
| 8 | `gauntlet-attacks`, `gauntlet-build`, `gauntlet-batch` and then `gauntlet-ponytail` (the first real test of the four workflows), with the args of "Step 8" below | orchestrator | pieces `won`; batch `pass`; Ponytail approved |
| 9 | Close CP0: FRAMEWORK.md section 5, steps 4 to 7, also recording the decisions below and closing the `cp0-ponytail` piece on the panel, if it exists (Ponytail uses `cp0-pt-*`); move this file to `.gauntlet/cp0/` (`mkdir -p`) before the commit | orchestrator and user | tag `cp-0` and `info  CP0: closed` |

There is no step 7: the numbers 8 and 9 stay because `check.cjs` and the skills cite them.

Step 6: the setup requires the answer about the tracker and writes `docs/agents/issue-tracker.md`, the marker `check.cjs` looks for. The tracker is GitHub Issues of `{{REPO}}`, where the contract of each piece lives (FRAMEWORK.md section 10); the orchestrator writes those issues itself from `tasks.md`, so `to-spec`, `to-tickets` and `triage` stay banned (FRAMEWORK.md section 2).

ai-memory seed (step 3; a pointer page, it does not copy rules):

```
memory_write_page {workspace:"{{MEM_WORKSPACE}}", project:"{{MEM_PROJECT}}", path:"_rules/framework.md", tier:"procedural", pinned:true,
  body:"# Project framework\nInvariants: CLAUDE.md. Script: FRAMEWORK.md. Validation: node .claude/check.cjs. Panel: {{DASHBOARD_URL}}. Git tags: cp-N. Scope: {{MEM_WORKSPACE}}/{{MEM_PROJECT}}."}
```

## Step 8: args of the four gauntlets

Script of FRAMEWORK.md section 5, steps 2 and 3, with the objects below in `args` (JSON, never a string). Put in `root` the absolute path of the project root. CP0 has no `spec.md`, `plan.md` or `tasks.md`: the suite is `node .claude/check.cjs`; without a previous commit, compare `results[].files` with the `owns` instead of `git status`. The pieces run in sequence (the default) and in this order, because they share the suite and each document describes the previous one. The four lines `bootstrap: args: gauntlet-attacks`, `bootstrap: args: gauntlet-build`, `bootstrap: args: gauntlet-batch` and `bootstrap: args: gauntlet-ponytail` of `check.cjs` validate the three blocks below, which must stay in this order: pieces (attacks and build), batch, ponytail.

Before the build, run the Round −1 with `Workflow({name:"gauntlet-attacks", args})` and the args below without `attacks`; give its `results[]` untouched as `attacks` of the build. Replace each `issue` with the number of the issue that holds the contract of the piece and write the contract fields (`objective`, `input`, `criteria`, `fails`, `outOfScope`, `env`, `output`) as the transcript of it; the values below show the format. `Workflow({name:"gauntlet-build", args})`, one piece per CP0 bar:

```json
{"checkpoint":{"n":0,"title":"Step 0: framework"},
 "root":"<absolute path of the project root>",
 "dashboardUrl":"{{DASHBOARD_URL}}",
 "language":"{{LANGUAGE}}",
 "memory":{"workspace":"{{MEM_WORKSPACE}}","project":"{{MEM_PROJECT}}"},
 "models":{{MODELS_JSON}},
 "mode":"<rigorous or accelerated, copied from .claude/forge.json>",
 "escalation":"<the escalation key of .claude/forge.json, copied as it is>",
 "context":"CP0 has no spec.md, plan.md or tasks.md: the spec is CLAUDE.md, the suite is `node .claude/check.cjs` (run it at the root) and the behaviours to cover are the items of the goal, without T### or FR### ids. Document pieces (tdd:false) have no red and green: the critic's reading against the bar and check.cjs count. In this CP0 the critic may open FRAMEWORK.md, BOOTSTRAP.md and .claude/workflows/, which are the object of the judgment.",
 "pieces":[
  {"id":"workflows","title":"Saved workflows and check.cjs","goal":"The two workflows follow the Workflow API and invariants 3 and 4 of CLAUDE.md (developer and critic in separate agent() calls, models and effort only from args.models, the rounds of gauntlet-build capped by the mode and no cap in gauntlet-ponytail), and check.cjs proves each one by simulation; the format of the args does not change. Seam: the simulation of check.cjs (args in; agent() calls and results out).","bar":"The skill workflow-authoring (call the Skill tool with that name and read it whole): script hooks, literal meta, Date.now and Math.random forbidden, agent() opts, schema, dropped coverage recorded with log(), resume. Measure: `node .claude/check.cjs` without FAIL on the lines `build:`, `ponytail:` and `panel:`.","owns":[".claude/workflows/gauntlet-build.js",".claude/workflows/gauntlet-ponytail.js",".claude/check.cjs"],"tdd":true,
   "issue":1,"objective":"The two workflows keep invariants 3 and 4 of CLAUDE.md and check.cjs proves them by simulation","input":"branch main; files .claude/workflows/ and .claude/check.cjs","criteria":[{"text":"check.cjs has no FAIL on the lines build:, ponytail: and panel:","command":"node .claude/check.cjs"}],"fails":"a FAIL in check.cjs, or a change in the format of the args","outOfScope":"the manual and CLAUDE.md","env":"Node 20 or newer, standard library only","output":"the files of owns and a Round 0 comment on the issue"},
  {"id":"study","title":"FRAMEWORK.md and BOOTSTRAP.md against the sources","goal":"FRAMEWORK.md and BOOTSTRAP.md only claim what the sources confirm (every command, flag, path, tool name and version cited exists and does what the text says), and each step of the script gives the exact call and the done criterion, leaving nothing to guess.","bar":"The primary sources of each component, opened or run by the critic: the SKILL.md of gauntlet-loop, ponytail*, graphify and tdd in ~/.claude/skills/; the skills of the mattpocock-skills plugin under ~/.claude/plugins/cache/; the SKILL.md of speckit-* in .claude/skills/; the --help of specify, graphify and ai-memory, plus the README.md and docs/ of each source repository. Measure: divergences between the manual and the source = 0.","owns":["FRAMEWORK.md","BOOTSTRAP.md"],"tdd":false,
   "issue":2,"objective":"FRAMEWORK.md and BOOTSTRAP.md only claim what the sources confirm","input":"branch main; FRAMEWORK.md and BOOTSTRAP.md","criteria":[{"text":"Divergences between the manual and the primary sources: 0","oracle":"threshold","command":"the critic opens or runs each cited source and compares it with the text"}],"fails":"a command, flag, path or tool name that the source does not confirm","outOfScope":"CLAUDE.md and the workflows","env":"Node 20 or newer; the sources of the components","output":"the files of owns and a Round 0 comment on the issue"},
  {"id":"manual","title":"CLAUDE.md against the Matt Pocock model","goal":"CLAUDE.md, loaded by every agent, carries only verifiable invariants, the glossary ## Terms and pointers; it has fewer than 80 lines (not counting the blocks the installers append after the section `## Generated blocks`) and does not repeat at length what FRAMEWORK.md already says.","bar":"The CLAUDE.md of the HEAD of github.com/mattpocock/skills and its glossary file (GLOSSARY.md; CONTEXT.md in older revisions), read with `gh api repos/mattpocock/skills/contents/<file> -H 'Accept: application/vnd.github.raw'`. Measure: lines of CLAUDE.md up to the end of the section `## Generated blocks` below 80 and `node .claude/check.cjs` without FAIL.","owns":["CLAUDE.md"],"tdd":false,
   "issue":3,"objective":"CLAUDE.md carries only verifiable invariants, the glossary and pointers","input":"branch main; CLAUDE.md","criteria":[{"text":"CLAUDE.md has fewer than 80 lines up to the end of the section Generated blocks","oracle":"threshold","command":"wc -l CLAUDE.md"},{"text":"check.cjs has no FAIL","command":"node .claude/check.cjs"}],"fails":"80 lines or more, or a FAIL in check.cjs","outOfScope":"FRAMEWORK.md and the workflows","env":"Node 20 or newer","output":"CLAUDE.md and a Round 0 comment on the issue"}],
 "attacks":[{"id":"workflows","attacks":[{"id":"workflows-a1","file":"tests/critico/workflows-r0/a1.test.mjs","passesOnBase":false}],"failingOnBase":true,"gaps":[]},
            {"id":"study","attacks":[{"id":"study-a1","file":"tests/critico/study-r0/a1.test.mjs","passesOnBase":false}],"failingOnBase":true,"gaps":[]},
            {"id":"manual","attacks":[{"id":"manual-a1","file":"tests/critico/manual-r0/a1.test.mjs","passesOnBase":false}],"failingOnBase":true,"gaps":[]}]}
```

`Workflow({name:"gauntlet-batch", args})`, only after the three pieces win: the tester runs the suite of CP0 twice (it has no E2E) and the batch must come back with `batch.verdict` `pass`; a `regressions` entry goes back to the piece that caused it. Copy `pieces` from the build args (`id`, `title`, `owns`); the batch of CP0 has three pieces, which both modes take.

```json
{"checkpoint":{"n":0,"title":"Step 0: framework"},
 "root":"<absolute path of the project root>",
 "dashboardUrl":"{{DASHBOARD_URL}}",
 "language":"{{LANGUAGE}}",
 "models":{{MODELS_JSON}},
 "mode":"<rigorous or accelerated, copied from .claude/forge.json>",
 "testCommand":"node .claude/check.cjs",
 "pieces":[{"id":"workflows","title":"Saved workflows and check.cjs","owns":[".claude/workflows/gauntlet-build.js",".claude/workflows/gauntlet-ponytail.js",".claude/check.cjs"]},
           {"id":"study","title":"FRAMEWORK.md and BOOTSTRAP.md against the sources","owns":["FRAMEWORK.md","BOOTSTRAP.md"]},
           {"id":"manual","title":"CLAUDE.md against the Matt Pocock model","owns":["CLAUDE.md"]}]}
```

`Workflow({name:"gauntlet-ponytail", args})`, only after the batch passes. Units: the two workflows (`check.cjs` is the suite, and Markdown is not code). Bar: the copy `.gauntlet/ponytail/cp0/<unit>/before`, which the developer creates in round 1, against the current version, blind; measurable target: `wc -l` of the final version below that of the copy (without a reduction, take the developer's `kept` to the user). The ledger of FRAMEWORK.md section 5, step 3, excludes `.claude/`: in CP0 run the `grep` on `.claude/workflows`.

```json
{"checkpoint":{"n":0,"title":"Step 0: framework"},
 "root":"<absolute path of the project root>",
 "dashboardUrl":"{{DASHBOARD_URL}}",
 "language":"{{LANGUAGE}}",
 "memory":{"workspace":"{{MEM_WORKSPACE}}","project":"{{MEM_PROJECT}}"},
 "models":{{MODELS_JSON}},
 "context":"CP0 without a spec: the behaviour to preserve is that of invariants 3 and 4 of CLAUDE.md, verified by `node .claude/check.cjs`. In this CP0 the critic may open .claude/workflows/, which are the units.",
 "testCommand":"node .claude/check.cjs",
 "units":[{"id":"build","title":"gauntlet-build","paths":[".claude/workflows/gauntlet-build.js"]},
          {"id":"ponytail","title":"gauntlet-ponytail","paths":[".claude/workflows/gauntlet-ponytail.js"]}]}
```

## Decisions of the setup

Answered by the user in the `new-project` setup and recorded by the orchestrator in ai-memory (`decisions/`) in step 9:

| Topic | Decision | Page in `decisions/` |
|---|---|---|
| Project language | {{LANGUAGE}} (panel texts, notes, docs and commits) | `cp0-language` |
| Models and effort | the roles in `.claude/forge.json`: developer {{developer}}, critic {{critic}}, auxiliaries {{aux}} | `cp0-models` |
| ai-memory scope | {{MEM_WORKSPACE}} / {{MEM_PROJECT}} | `cp0-ai-memory-scope` |
| Ticket tracker | GitHub Issues of {{REPO}} (the contract of each piece) | `cp0-tracker` |
| Manual defaults (versioning, CP1 onwards, who writes to ai-memory and `tasks.md`, commit and tag format) | `graphify-out/` and `.gauntlet/` outside git; `specs/`, `.specify/`, `.claude/workflows`, `.claude/forge.json` and `.ai-memory.toml` versioned; CP1 = Setup + Foundational and then one user story per checkpoint; only the orchestrator writes to ai-memory and `tasks.md`; commit `cp-N: title` and a lightweight tag `cp-N` only after approval | `cp0-manual-defaults` |
