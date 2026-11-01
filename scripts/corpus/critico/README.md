# Corpus of the critic

Cases for measuring a critic, not the code of the forge. Each folder is a case:

| File | What it is |
|---|---|
| `contract.json` | The contract fields, as in the args of a piece (`issue`, `objective`, `input`, `criteria`, `fails`, `outOfScope`, `env`, `output`). |
| `piece/` | The delivered code the critic judges. |
| `expect.json` | `{kind: "defect" \| "clean", criterion?: "C<n>", class?: <kebab-case>, source?: <issue>}`. A `defect` cites in `source` the issue of the real defect it comes from. |
| `proof.test.mjs` | Proves the case: it fails against `piece/` of a `defect` and passes against a `clean` one. It runs with `node --test proof.test.mjs` in a copy of the folder and reaches `piece/` by a relative path. |

`defect` cases are real defects of the forge that escaped the critic or were found late. `clean` cases are approved pieces that never regressed.

## Measure a critic

```
node scripts/eval-critico.mjs --verdicts <file.json>
```

The file is `{<case>: <verdict>}`, each verdict in the `VERDICT` schema of `gauntlet-build.js`. It prints:

- `recall a/b`: the `defect` cases where the critic listed at least one blocking failure with the `criterion` of `expect.json` (any blocking failure if `expect.json` has no `criterion`);
- `noise c/d`: the `clean` cases where the critic listed at least one blocking failure;
- `missing: <cases>`: the cases without a verdict; a `defect` counts as a miss and a `clean` one as noise.

## When to run it with a real critic

Run it when something that changes what the critic sees or does changes: `critic.md`, the prompt of the critic in `gauntlet-build.js`, the tools of the critic, or its model. It costs quota (one real critic run for each case), so it needs the yes of the user first. Nothing here is scheduled and nothing runs by itself.
