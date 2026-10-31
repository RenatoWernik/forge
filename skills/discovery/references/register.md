# The discovery register (`discovery/register.md`)

The single source of truth of a discovery. Every document is generated from it. Keep it short: one line per item, links instead of copies. Write it in the language the lead chose.

```markdown
# Register: <project name>

## Where we are
Stage <0-3>, <date>. Next: <one line>. Still assumed: <one line>.

## Context
- Idea in the lead's words: <...>
- Nature: <software | process | consulting | data | BI | mix: main one> . Size: <days | weeks | months>
- What we have: <people, money, time, data, tools, access>
- Blockers and constraints: <...>
- Files language: <...>

## Decisions
| # | Decision | Door | Options rejected (why) | Criteria | Decided by | Date | Revisit if |
|---|---|---|---|---|---|---|---|
| D1 | <what was decided> | one-way / two-way | <option: reason> | <A, B, C> | <name> | <date> | <signal> |

## Assumptions
| # | Assumption | Importance | Evidence | Cheapest test (time limit) | Decision rule | Status |
|---|---|---|---|---|---|---|
| A1 | <...> | high / low | strong / weak | <test> (<limit>) | <what result confirms or refutes it; holds for the sample size> | open / confirmed / refuted |

## Open questions
| # | Question | Who can answer | By when |
|---|---|---|---|

## Risks
| # | Risk | Kind (value / adoption / feasibility / viability / other) | Mitigation | Owner |
|---|---|---|---|---|

## Sources
| # | What | Link | Read on | Kind (primary / secondary / vendor) |
|---|---|---|---|---|

## Skipped steps
- <step>: <reason> (<date>)

## Gates
- Gate 1 (worth exploring?): <explore / adjust / stop>, <reason>, <date>
- Gate 2 (go / adjust / stop): <answer>, <reason>, <date>
```

Rules:
- A decision enters the table only after the lead confirms it.
- An assumption leaves "open" only with evidence, written in the Sources table.
- When a decision changes, keep the old line, mark it `superseded by D<n>`, and add the new one.
