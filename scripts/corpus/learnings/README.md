# Corpus of the error register (F-22a, oracle of learnings/)

- `valid/*.md`: registers that `check.cjs` must accept; each is installed alone as `learnings/2026-10.md`.
- `invalid/*.md`: one rule each. The first line is `<!-- expect: E-NNN FIELD -->`; the FAIL of the line `learnings: every entry of learnings/ is well formed` must name that id and that field.
- `tree.txt`: the files the paths of the entries point to; the test creates them in the generated project.

The clock is fixed with `--today 2026-10-31`. Regenerate nothing by hand: edit the file of the rule and keep the `expect` line true.
