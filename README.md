# forge

[Leia em português (Brasil)](./README.pt-BR.md)

A Claude Code plugin that turns an empty folder into a complete, verified engineering project run by a **gauntlet loop**: for every small piece of work one agent builds with TDD, a separate agent with a fresh context judges it blind against a named quality bar, and the loop repeats until the work wins. The plugin does not lock any model: you choose them.

## What it is

forge packages one framework as two skills:

- `/forge:new-project` checks your machine, asks a few questions, generates the whole project (manual, invariants, bootstrap checklist, two workflows, a checker, a live panel page) and runs the bootstrap.
- `/forge:sync` brings the improvements you made in a generated project back into this package, as a patch you review.

A generated project contains: `CLAUDE.md` (invariants and glossary, loaded by every agent), `FRAMEWORK.md` (the orchestrator manual), `BOOTSTRAP.md` (the one-time setup checklist, called CP0), the workflows `gauntlet-build` and `gauntlet-ponytail`, `.claude/check.cjs` (validates all of it), `.claude/forge.json` (your models and language), the panel page, `.ai-memory.toml`, `.gitignore` and `.graphifyignore`. The generated files are in English; the panel texts, notes, docs and commits use the language you pick at setup.

## The 7 components

forge does not bundle these tools. It links each one to its official source, compares your installed copy with the latest public release, and installs or updates from that source after your yes.

| # | Component | What it does in the framework | Official source |
|---|---|---|---|
| 1 | Gauntlet loop | Builder and blind critic loop until the work beats the bar | [robonuggets/gauntlet-loop](https://github.com/robonuggets/gauntlet-loop) |
| 2 | AI Memory | Long-term memory, decisions and the baton between sessions | [akitaonrails/ai-memory](https://github.com/akitaonrails/ai-memory) |
| 3 | Ponytail | Cuts excess code; runs as its own gauntlet per checkpoint | [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) |
| 4 | SDD | Spec-driven development: the Spec-Kit CLI plus the `sdd` guide skill | [github/spec-kit](https://github.com/github/spec-kit), [SpillwaveSolutions/sdd-skill](https://github.com/SpillwaveSolutions/sdd-skill) |
| 5 | TDD | Red before code, green after, one vertical slice at a time | [mattpocock/skills](https://github.com/mattpocock/skills) (`tdd`) |
| 6 | Matt Pocock skills | Grilling, domain modeling, diagnosing bugs, research and more | [mattpocock/skills](https://github.com/mattpocock/skills) |
| 7 | Graphify | Knowledge graph of the code and docs (`query`, `path`, `affected`) | [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify) |

The Spec-Kit and Graphify command line tools also need [uv](https://docs.astral.sh/uv/getting-started/installation/), which forge checks first. Each tool keeps its own license.

## Install in 30 seconds

The plugin lives at [github.com/RenatoWernik/forge](https://github.com/RenatoWernik/forge). The two commands below read it from GitHub, so they work once that repository is published; until then, use the local copy variant below.

```bash
claude plugin marketplace add RenatoWernik/forge
claude plugin install forge@forge
```

The same from inside a Claude Code session:

```
/plugin marketplace add RenatoWernik/forge
/plugin install forge@forge
```

Working from a local copy instead (works before publication and is also the way to try a change before publishing it). Run it from the folder that holds `forge/` (after publication you can also `git clone https://github.com/RenatoWernik/forge` first and run it from the folder you cloned into):

```bash
claude plugin marketplace add ./forge
claude plugin install forge@forge
```

Restart Claude Code so the skills show up. To update later: `claude plugin marketplace update forge`, then `claude plugin update forge@forge`, then restart.

### `npx skills add`

Not supported, on purpose. `npx skills add` installs each skill folder (`SKILL.md` and its neighbors) into your project. forge's skills call scripts and templates that live at the repository root (`scripts/`, `templates/`, `components.json`) through `${CLAUDE_PLUGIN_ROOT}`, a variable that only exists when Claude Code loads the repository as a plugin. Installed alone, `/forge:new-project` would have nothing to run. Use the plugin install above.

## Use

1. Create an empty folder for the new project and start Claude Code in it.
2. Type `/forge:new-project`.
3. Answer in chat. Nothing is installed, downloaded, published or written outside the folder without your yes, asked action by action:
   - **Machine check.** The `doctor` compares each tool with its latest public release (GitHub release, PyPI or npm; never a pinned version). For each missing or outdated component it shows the exact command and the official docs link, then waits for your yes.
   - **Setup questions.** Project name, language, model and effort for the developer, the critic and the auxiliaries, ai-memory scope, Spec-Kit script type (`sh` or `ps`), plain style (no dashes, arrows or emoji in the manual), and global rules of yours that conflict with the framework.
   - **Generation.** A `--dry-run` preview of the file tree, then the files. It never overwrites an existing file unless you agree.
   - **Panel.** With the `Artifact` tool available, the panel page is published as a private artifact (only you can open it) and seeded. Without it the project still works; the workflows warn that the panel is off.
   - **Bootstrap.** The orchestrator runs `BOOTSTRAP.md` (CP0): Spec-Kit init, memory seed, Graphify hooks, session restart with a baton, Matt Pocock setup and a first gauntlet that validates the workflows. It ends with `node .claude/check.cjs` reporting `All ok.`
4. Continue with `/speckit-constitution` and one checkpoint at a time (see the `FRAMEWORK.md` of the generated project).

## Model configuration

forge fixes no model. At setup you choose, for each of three roles, a model alias or full ID that the `Workflow` tool accepts (for example `sonnet`, `opus`, `haiku`) and an effort (`low`, `medium`, `high`, `xhigh`, `max`):

| Role | Used for |
|---|---|
| `developer` | builds each piece with TDD and Ponytail; never judges its own work |
| `critic` | judges blind with a fresh context every round; the strongest model you have is a good choice |
| `aux` | panel agent and research readers |

The choice is saved in `.claude/forge.json` of the project:

```json
{
  "language": "English",
  "plainStyle": true,
  "models": {
    "developer": { "model": "sonnet", "effort": "high" },
    "critic":    { "model": "opus",   "effort": "high" },
    "aux":       { "model": "sonnet", "effort": "medium", "label": "optional display name", "match": "optional regex the resolved model ID must satisfy" }
  }
}
```

The values above only show the shape. Workflow scripts cannot read files, so the orchestrator copies `models` and `language` into the `args` of every `Workflow` call, and `node .claude/check.cjs` fails if the model text in the workflows' `meta` disagrees with `forge.json`. To change a model after setup, edit `models` in `.claude/forge.json`, run `node .claude/check.cjs --render` (it rewrites the model and effort texts in the `meta` of both workflows to match, and says so when nothing changed), then run `node .claude/check.cjs` and expect `All ok.` Start the next `Workflow` call with the new values in `args`.

## Sync

After improving a workflow, the checker or the manual inside a generated project, open Claude Code in that project and type `/forge:sync`. It:

1. asks for the path of your git clone of this repository (patches must land in a clone, not in the plugin cache that updates replace);
2. runs `scripts/sync.mjs`, which rebuilds your answers from `forge.json`, renders the templates with them, diffs the result against your project and turns your values back into markers (`{{PROJECT_NAME}}`, `{{MEM_WORKSPACE}}`, `{{MEM_PROJECT}}`, `{{DASHBOARD_URL}}` and others), so no project data travels into the package;
3. shows you the patch and flags anything that looks specific to you or to one project (exit code `3` means the patch may still carry project data);
4. applies it to `templates/` only after your yes, runs the tests and shows `git diff --stat`. Commit and push are separate actions with their own yes.

When the comparison finds no difference, nothing is applied.

## Manual commands

From a clone of this repository, on any system with Node:

```bash
node scripts/doctor.mjs            # machine report; exit 0 when everything is ok, 1 otherwise
node scripts/doctor.mjs --json     # the same as data
node --test scripts/*.test.mjs     # the package tests
claude plugin validate . --strict                          # the marketplace manifest
claude plugin validate .claude-plugin/plugin.json --strict  # the plugin manifest
```

The doctor calls the public APIs of GitHub, PyPI and npm. Set `GITHUB_TOKEN` in your environment to avoid GitHub's anonymous rate limit. It only prints commands; it never runs them.

## Requirements

- [Claude Code](https://code.claude.com) with plugin support and the `Workflow` tool (the gauntlets run through it). The live panel also needs the `Artifact` tool.
- [Node.js](https://nodejs.org) 20.12 or newer. Scripts use only the standard library and `node:test`; there is nothing to `npm install`.
- `git`.
- Internet access for the version checks and installs.
- Windows, macOS or Linux: every install and update command exists for the three.
- [uv](https://docs.astral.sh/uv/getting-started/installation/) for Spec-Kit and Graphify (the doctor offers to install it first).

## Privacy

The package holds no personal data, local paths, e-mail addresses or company names. The one exception is the handle of the public repository's owner, `RenatoWernik`, which appears in the repository links. Everything specific to your project is written into your project's files at setup time.

## License

[MIT](./LICENSE)
