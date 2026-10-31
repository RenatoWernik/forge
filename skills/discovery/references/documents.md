# The document menu

Generate only what the nature and the size call for. Every document is a view of the register: no fact that is not in it, links instead of copies, the source label on every claim.

## How many

| Size | What comes out |
|---|---|
| Days | `register.md` and `problem.md` only |
| Weeks | The common core + the first 2 items of the nature |
| Months | The common core + every item of the nature |

The lead can add or drop any document; log it in "Skipped steps".

## The common core (every nature)

| Document | Size limit | Content |
|---|---|---|
| `register.md` | as short as possible | see `register.md` in this folder |
| `problem.md` | 1 page | central question, decider and beneficiaries, why now, success measures, in and out of scope, constraints, the backwards narrative, the four risks |
| `stakeholders.md` | half a page | who decides (one name per decision), who approves, who sponsors, who must change what they do, who must be informed |
| `brief.md` (gate 2) | 1 page | problem, decision, main risks, untested assumptions, appetite, out of scope, circuit breaker, first 3 to 5 steps with owner and date |

## Per nature (ranked by value; take the first N by size)

### Software
1. **Solution sketch and technical risks** (2 pages): the chosen option and the alternatives considered with trade-offs, non-goals, what keeps us up at night, the decisions as ADRs (context, decision, status, consequences).
2. **Requirements for agents** (`requirements.md`): user stories or jobs with acceptance criteria that can be checked, non-functional requirements (security, performance, accessibility), out of scope. Input of `/forge:new-project` and `/speckit-specify`.
3. **Glossary** of the domain terms.
4. **Estimate and what gives way**, and a statement of work if it is for a client.

### Process
1. **Project charter** (1 page): problem, measurable goal, scope, team, sponsor.
2. **SIPOC** (suppliers, inputs, process steps, outputs, customers) as a table.
3. **Voice of the customer to measurable requirements** (what the customer of the process needs, turned into numbers).
4. **Current-state map**, only if the goal is a redesign; baseline metrics with their source.
5. **Change plan**: who gains, who loses, how they are told and trained.

### Consulting
1. **Problem statement** (1 page): the decision the client will take with the result, decider, success criteria, scope and "not", constraints, stakeholders, sources of information.
2. **Issue tree or hypothesis tree** (mutually exclusive, collectively exhaustive) with a provisional "day 1 answer" and, for each branch, the analysis or data that would confirm or kill it.
3. **Proposal or statement of work**: scope, deliverables, client dependencies and assumptions, schedule, team.
4. **Interview plan and guide**: who, why, the questions; syntheses always checked against the notes.
5. **Kick-off deck**, top-down (situation, complication, question, answer).
For agents: the authorised source list (what can be read and quoted) and the confidentiality rules (which data may go to which tool).

### Data (engineering, data science, AI)
1. **Use case** (1 page): business objective, analytical objective, success criteria in business terms and in technical terms with a threshold, what happens when the model or the data is wrong.
2. **Data readiness**: each source with owner, access status, quality, legal basis; the readiness of the data is the biggest unknown, so the first step usually asks for access.
3. **Governance and privacy**: owners, legal basis, access approval, what may go to which tool.
4. **Data product canvas** if it is a platform or a data product (inputs, outputs, semantics, consumers, SLAs).
5. **Proof of concept plan** with a 20 to 30 % contingency.

### BI
1. **Decision audit**: which decisions the dashboard serves, who takes them, how often, how they are taken today.
2. **KPI tree** from the goal down to the measurable metrics.
3. **Metrics dictionary** (for agents and people): formula, grain, filters, source, owner, refresh.
4. **Bus matrix** (business processes by dimensions), prioritised: build one row at a time.
5. **Mock-up linked to the decisions**, and an adoption plan (who uses it, when, for what; how we will know it is used).
For agents: source profiles and quality rules, row-level security rules.

### Mix
Take the core and the first item of each nature involved; ask the lead which nature leads.

## Style

- The top of every document reads in two minutes: the answer first, then the support.
- Plain language. No section left with "TBD": an unknown goes to the register as an open question and the document links to it.
- Documents for people state that they were drafted with AI and reviewed by the lead.
