# forge

[Leia em português (Brasil)](./README.pt-BR.md)

A Claude Code plugin that turns an empty folder into a complete, verified engineering project run by a **gauntlet loop**: for every small piece of work one agent builds with TDD, a separate agent with a fresh context judges it blind against a named quality bar, and the loop repeats until the work wins or the mode's round limit stops it. The plugin does not lock any model: you choose them.

## What it is

forge packages one framework as three skills:

- `/forge:new-project` checks your machine, interviews you about the project, proposes a mode and a model for each role, generates the whole project (manual, invariants, bootstrap checklist, four workflows, four briefs, a checker, a live panel page, optional protection hooks) and runs the bootstrap.
- `/forge:update` checks the components and the plugin against their latest public release and updates them one at a time, each with your yes.
- `/forge:sync` brings the improvements you made in a generated project back into this package, as a patch you review.

A generated project contains: `CLAUDE.md` (invariants and glossary, loaded by every agent), `AGENTS.md` (the same invariants for Codex), `FRAMEWORK.md` (the orchestrator manual), `BOOTSTRAP.md` (the one-time setup checklist, called CP0), the workflows `gauntlet-attacks`, `gauntlet-build`, `gauntlet-batch` and `gauntlet-ponytail`, the four role briefs in `.claude/briefs/`, `.claude/check.cjs` (validates all of it), `.claude/forge.json` (your mode, models and language), the panel page `.claude/dashboard/panel.html`, `.checkpoints/` (the checkpoint format and `painel.json`), `.ai-memory.toml`, `.gitignore` and `.graphifyignore`. The panel texts, notes, docs and commits use the language you pick at setup, and the generated documents are translated to it.

## The two modes

You pick the mode in the interview, and it is saved as `mode` in `.claude/forge.json`:

- `rigorous`: the full process. A critic writes the attacks before any code exists (Round -1), each piece gets up to 3 rounds, the critic's first round is exhaustive, and a batch of up to 3 pieces gets the full regression once, run by a tester.
- `accelerated`: fewer rounds (2) and less quality margin, with batches of up to 5 pieces. Security never relaxes.

The contract of every piece lives in **GitHub Issues** of the project's repository (the body of the issue plus the orchestrator's comments); the orchestrator writes those issues itself, and the developer, the critic and the tester read them with `gh issue view <n> --json body,comments`.

## The 7 components

forge does not bundle these tools. It links each one to its official source, compares your installed copy with the latest public release, and installs or updates from that source after your yes.

| # | Component | What it does in the framework | Official source |
|---|---|---|---|
| 1 | Gauntlet loop | Builder and blind critic loop until the work beats the bar | [RenatoWernik/gauntlet-loop](https://github.com/RenatoWernik/gauntlet-loop) |
| 2 | AI Memory | Long-term memory, decisions and the baton between sessions | [akitaonrails/ai-memory](https://github.com/akitaonrails/ai-memory) |
| 3 | Ponytail | Cuts excess code; runs as its own gauntlet per checkpoint | [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) |
| 4 | SDD | Spec-driven development: the Spec-Kit CLI plus the `sdd` guide skill | [github/spec-kit](https://github.com/github/spec-kit), [SpillwaveSolutions/sdd-skill](https://github.com/SpillwaveSolutions/sdd-skill) |
| 5 | TDD | Red before code, green after, one vertical slice at a time | [mattpocock/skills](https://github.com/mattpocock/skills) (`tdd`) |
| 6 | Matt Pocock skills | Grilling, domain modeling, diagnosing bugs, research and more | [mattpocock/skills](https://github.com/mattpocock/skills) |
| 7 | Graphify | Knowledge graph of the code and docs (`query`, `path`, `affected`) | [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify) |

Component 1 is forge's fork of the gauntlet loop. The original, with credit to its author, is robonuggets/gauntlet-loop on GitHub; forge reads only the fork and never applies commits of the original for you.

The Spec-Kit and Graphify command line tools also need [uv](https://docs.astral.sh/uv/getting-started/installation/), which forge checks first. Each tool keeps its own license.

## Install in 30 seconds

The plugin lives at [github.com/RenatoWernik/forge](https://github.com/RenatoWernik/forge). Install it from GitHub with two commands:

```bash
claude plugin marketplace add RenatoWernik/forge
claude plugin install forge@forge
```

The same from inside a Claude Code session:

```
/plugin marketplace add RenatoWernik/forge
/plugin install forge@forge
```

To try a change before you push it, install from a local copy instead: `git clone https://github.com/RenatoWernik/forge`, then run this from the folder that holds `forge/`:

```bash
claude plugin marketplace add ./forge
claude plugin install forge@forge
```

Restart Claude Code so the skills show up. To update the plugin later, use `/forge:update` (it runs `claude plugin marketplace update forge` and `claude plugin update forge@forge` with your yes), then restart.

### `npx skills add`

Not supported, on purpose. `npx skills add` installs each skill folder (`SKILL.md` and its neighbors) into your project. forge's skills call scripts and templates that live at the repository root (`scripts/`, `templates/`, `components.json`) through `${CLAUDE_PLUGIN_ROOT}`, a variable that only exists when Claude Code loads the repository as a plugin. Installed alone, `/forge:new-project` would have nothing to run. Use the plugin install above.

## Use

1. Create an empty folder for the new project and start Claude Code in it.
2. Type `/forge:new-project`.
3. Answer in chat. Nothing is installed, downloaded, published or written outside the folder without your yes, asked action by action:
   - **Machine check.** `scripts/update.mjs --check` compares each tool with its latest public release (GitHub release, PyPI or npm; never a pinned version) and with the version forge was verified with. It only reads. For each missing or outdated component the skill shows the exact command and the official docs link, then waits for your yes.
   - **Interview.** The orchestrator asks until it is 95 % sure of what you want and need, stating its certainty for each dimension, and stops at 95 % or when you say "enough". Then it proposes the mode and, with a reason each, a model and an effort for the developer, the UI developer, the critic, the tester and the auxiliaries. You decide.
   - **Setup questions.** Project name, language, ai-memory scope, the GitHub repository for the issues, Spec-Kit script type (`sh` or `ps`), plain style (no dashes, arrows or emoji in the manual), and global rules of yours that conflict with the framework.
   - **Protection hooks.** Three optional hooks, one yes each (see below).
   - **Generation.** A `--dry-run` preview of the file tree, then the files. It never overwrites an existing file unless you agree.
   - **Panel.** With the `Artifact` tool available, the panel page is published as a private artifact (only you can open it) and seeded. Without it the project still works; the workflows warn that the panel is off.
   - **Bootstrap.** The orchestrator runs `BOOTSTRAP.md` (CP0): Spec-Kit init, memory seed, Graphify hooks, session restart with a baton, Matt Pocock setup and a first run of the four workflows that validates them. It ends with `node .claude/check.cjs` reporting `All ok.`
4. Continue with `/speckit-constitution` and one checkpoint at a time (see the `FRAMEWORK.md` of the generated project).

## The panel

The panel has two parts, and both read the same file, `.checkpoints/painel.json` (tickets and agents), through one shared reader:

- **The page.** `.claude/dashboard/panel.html`, published as an Artifact: agents, pieces, checkpoints, events, notes and an inbox, drawn live from the documents `painel/estado` and `painel/vida`. The command `node .claude/painel-vida.mjs` prints `painel/vida` (how long ago each agent wrote its checkpoint) for the orchestrator to write.
- **The mod.** This plugin registers a mod (`hooks/painel.tsx`) with the command `forge-painel`, which opens a pane inside Claude Code with the same data, in a forge project only.

## The three protection hooks

They go into the project's own `.claude/settings.json`, never into a global one, and only with your yes (the answers are `killByName`, `backgroundTests` and `idleWatch`):

- `killByName` (`forge-matar-por-nome`): blocks killing processes by name (`taskkill /IM`, `killall`, `pkill`, `Stop-Process -Name`), which also ends the processes of other agents and of you. Killing by PID stays allowed.
- `backgroundTests` (`forge-testes-em-primeiro-plano`): blocks test commands started with `run_in_background`, which leave an agent waiting with nobody noticing.
- `idleWatch` (`forge-vigia-de-agentes`): warns the orchestrator, on each prompt, when an agent active in `painel.json` has written no checkpoint for 10 minutes.

## Model configuration

forge fixes no model. In the interview you choose, for each of five roles, a model alias or full ID that the `Workflow` tool accepts (for example `sonnet`, `opus`, `haiku`), an effort (`low`, `medium`, `high`, `xhigh`, `max`) and a one-line reason:

| Role | Used for |
|---|---|
| `developer` | builds each piece with TDD and Ponytail; never judges its own work |
| `developerUi` | builds the pieces that are rich user interface |
| `critic` | judges blind with a fresh context every round; the strongest model you have is a good choice |
| `tester` | runs the batch suite and the end-to-end checks |
| `aux` | panel agent and research readers |

The choice is saved in `.claude/forge.json` of the project, with the mode and the escalation rules:

```json
{
  "language": "English",
  "plainStyle": true,
  "mode": "rigorous",
  "models": {
    "developer":   { "model": "sonnet", "effort": "high", "reason": "builds from a closed contract" },
    "developerUi": { "model": "opus",   "effort": "high", "reason": "rich UI needs a stronger model" },
    "critic":      { "model": "opus",   "effort": "high", "reason": "judges blind" },
    "tester":      { "model": "haiku",  "effort": "xhigh", "reason": "the batch suite is mechanical work" },
    "aux":         { "model": "sonnet", "effort": "medium", "reason": "panel records only", "label": "optional display name", "match": "optional regex the resolved model ID must satisfy" }
  }
}
```

The values above only show the shape. Workflow scripts cannot read files, so the orchestrator copies `mode`, `models` and `language` into the `args` of every `Workflow` call, and `node .claude/check.cjs` fails if the model text in the workflows' `meta` disagrees with `forge.json`. To change a model after setup, edit `models` in `.claude/forge.json`, run `node .claude/check.cjs --render` (it rewrites the model and effort texts in the `meta` of the workflows to match, and says so when nothing changed), then run `node .claude/check.cjs` and expect `All ok.` Start the next `Workflow` call with the new values in `args`.

## Update

Type `/forge:update` in any Claude Code session. It runs `scripts/update.mjs --check`, which only reads, and shows for each component the installed version, the latest one and a status: `ok`, `outdated`, `unverified` (newer than the version forge was tested with), `customized` (a skill you edited), `missing` or `unknown`. Then it updates one component at a time, each with its own yes; there is no "update everything". Three barriers need their own yes, as flags of `update.mjs --apply <id> --yes`:

- `--accept-unverified`: for a version that forge was not tested with.
- `--backup-confirmed`: for ai-memory across a major version, after you took the backup yourself.
- `--overwrite`: to replace a skill you customized, after a backup copy.

`update.mjs --check` exits with `0` when every component is `ok`, and with `4` when something needs handling (`missing`, `outdated`, `unverified`, `customized` or `unknown`). Code `1` is only for an error of the command itself; `2` is invalid use and `3` is a barrier that was not confirmed.

The update never rewrites the files already generated in your projects.

## Sync

After improving a workflow, the checker, a brief, a hook or the manual inside a generated project, open Claude Code in that project and type `/forge:sync`. It:

1. asks for the path of your git clone of this repository (patches must land in a clone, not in the plugin cache that updates replace);
2. runs `scripts/sync.mjs`, which rebuilds your answers from `forge.json`, renders the templates with them, diffs the result against your project and turns your values back into markers (`{{PROJECT_NAME}}`, `{{MEM_WORKSPACE}}`, `{{MEM_PROJECT}}`, `{{REPO}}`, `{{DASHBOARD_URL}}` and others), so no project data travels into the package;
3. shows you the patch and flags anything that looks specific to you or to one project (exit code `3` means the patch may still carry project data, an e-mail address or an absolute path);
4. applies it at the root of your clone only after your yes, runs the tests and shows `git diff --stat`. Commit and push are separate actions with their own yes.

When the comparison finds no difference, nothing is applied.

## Manual commands

From a clone of this repository, on any system with Node:

```bash
node scripts/update.mjs --check    # components report; it only reads
node scripts/doctor.mjs            # install and update commands per component
node --test scripts/*.test.mjs     # the package tests
claude plugin validate . --strict                          # the marketplace manifest
claude plugin validate .claude-plugin/plugin.json --strict  # the plugin manifest
```

The checks call the public APIs of GitHub, PyPI and npm. Set `GITHUB_TOKEN` in your environment to avoid GitHub's anonymous rate limit. They only print commands; they never run them.

## Requirements

- [Claude Code](https://code.claude.com) with plugin support and the `Workflow` tool (the gauntlets run through it). The live panel also needs the `Artifact` tool.
- Node 22.1 or newer ([nodejs.org](https://nodejs.org)). Scripts use only the standard library and `node:test`; there is nothing to `npm install`.
- `git`, and the `gh` command line to read and write the issues of the contracts.
- Internet access for the version checks and installs.
- Windows, macOS or Linux: every install and update command exists for the three.
- [uv](https://docs.astral.sh/uv/getting-started/installation/) for Spec-Kit and Graphify (the machine check offers to install it first).

## Privacy

The package holds no personal data, local paths, e-mail addresses or company names. The one exception is the handle of the public repository's owner, `RenatoWernik`, which appears in the repository links. Everything specific to your project is written into your project's files at setup time.

## License

[MIT](./LICENSE)
