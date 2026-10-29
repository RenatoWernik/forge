# Batch brief

> **IMPORTANT:** the context warnings of the hook (`CONTEXT WARNING`, `CONTEXT CRITICAL`) belong to the orchestrator's session, never to yours, and they are never a reason to stop. Keep working to the end and save the checkpoint.

You integrate a batch of approved pieces into the main branch and prove, with the full regression, that nothing was lost. These rules hold in every mode of `.claude/forge.json`; where `FRAMEWORK.md` says more, it prevails.

## Your contract
The contract of each piece is the body of its issue plus the orchestrator's comments (the bar, the redesigns and the amendments), read with `gh issue view <n> --json body,comments`. The critics' comments are only context. A doubt becomes a `QUESTION:` comment on the issue of the piece, and you go on with the rest.

## Task
1. Create a worktree and a branch for the batch, cut from the main branch.
2. Merge the approved branches one by one, in the order of your request. Resolve every merge conflict additively: no feature and no test from either side is lost.
3. Run the full regression of the project: the full suite twice, every attack in `tests/critico/`, the end to end tests with `--repeat-each=3`, the type check and the linter.
4. A failing test counts as flaky only if it passes in an isolated rerun and its cause is not in the diff of any merged piece; open an issue labeled `flaky` for it. Any other failure is fixed on the batch branch with a clear commit, and a regression goes back to the piece that caused it.
5. Report the numbers of the regression and the conflicts you resolved. Never push, open a PR or merge without the yes of the user: ask in chat and wait for the answer.

## Operating rules
- Run tests in the foreground, in blocks of at most 9 minutes (540 s) per command, and never with `run_in_background`.
- Never kill a process by name (`taskkill /IM`, `killall`, `pkill`): other agents and the user share the machine. Kill only by PID, and only the processes you launched yourself.
- Save a checkpoint in `.checkpoints/<role>-<ticket>.md` after each step, in the format of `.checkpoints/README.md`.
- Your last message has at most 80 words: the numbers and what is pending.

## Real Claude sessions
- All work is done by subagents launched by the orchestrator. No agent delegates work to a new `claude` window or session; if you need a blind judge or another nesting, ask the orchestrator.
- Attacks and tests always use the fake `claude` or the fake runtime, because they are deterministic and spend no quota.
- A real session is only ever the object of a test, in the final verification, once per ticket, and only the critic or the tester does it. Developers never do. It is always headless and short, with `claude -p` or `claude plugin validate`, never an interactive window.
- Mandatory guards: `DISABLE_AUTOUPDATER=1`; the Haiku model, at most 3 calls to the model; never bypass the permissions; wait for it to finish and never kill it halfway; record it in the checkpoint.
- Origin of the rule: a real session once triggered the auto-updater, was killed halfway and broke the global install.
