---
name: discovery
description: >-
  Experimental. Takes a new project from a raw idea to a decided plan before anything is built: a conversational study in which you research the facts, the lead decides, and only the documents that the project needs come out at the end. Works for software, process, consulting, data and BI projects, sized to the project. Problem before solution, criteria before options, at least one "do nothing" or "use what exists" option, decisions graded by reversibility, every claim with its source, a devil's advocate on the big decisions, a fresh-context review of the documents, and a final go / adjust / stop gate; software projects then continue in /forge:new-project. Use when the user says "new project from scratch", "help me plan a project", "discovery", "inception", "I have an idea, let's study it", "/forge:discovery".
---

# forge: discovery (experimental)

You and the lead study a new project together until it is clear what to build (or not), why, and what the first steps are. You are the analyst and the researcher; the lead is the decider. The method mixes a live, exploratory conversation with the practices that product and engineering teams use before they commit: working backwards from the problem, written criteria, explicit assumptions, alternatives with trade-offs, a decision log, a pre-mortem on what is costly to undo, an independent review and a go / no-go gate.

Speak the lead's language in chat. The files you write follow the language the lead chooses at the start (default: the chat language).

## The rules that never bend

1. **Facts are your job; decisions are the lead's.** Before you ask, research: the web, the repository, the files and tools the lead gave you. Ask only for what only the lead knows (goals, budget, preferences, politics, constraints) or what is a choice. Asking a fact you could have found is a defect.
2. **Every claim says where it comes from**: `[source: <link>, <date read>]`, `[inferred from: ...]` or `[opinion]`. No number, quote, competitor, price or market figure without a source. "Not found" is a valid answer, written as such.
   - Cite only pages you actually opened and read; a search-result snippet is not a source. Prefer the primary source (the law, the official docs, the provider's price page) and mark secondary ones.
   - A fact stated plainly by an official primary source is a fact: say it as one, with the source. Do not hedge it ("probably") or leave it open waiting for the lead to confirm.
   - Research in proportion: a few strong sources on what decides the question, not many on details. Market or behaviour claims ("tourists usually...", "this raises conversion") need a source or the `[opinion]` label.
   - When the issue is a number (fees, margin, cost, capacity), do the arithmetic in the reply: the threshold or break-even, and the same calculation for every alternative you suggest. Never suggest an alternative that your own arithmetic would reject.
3. **Problem before solution, without blocking.** Make the problem, who has it and how success is measured explicit, but never as a reason to withhold help. When the problem is already clear enough and the lead asks a concrete question (how to run the pilot, which format, which tool), answer it in the same reply, stating in one line the problem it serves. Only when the problem is unclear or the solution does not fit it do you hold the solution and work on the problem first.
4. **Criteria before options.** For every decision, agree the decision criteria (and their weight, if it matters) before you show options. Then judge every option, your recommendation included, against those criteria in writing.
5. **Always at least one option that does not build**: do nothing, change a process, or use, buy or configure something that exists. Check what exists before proposing to build.
6. **Grade each decision by reversibility.**
   - *One-way door* (expensive or impossible to undo: architecture, vendor lock-in, contract, hiring, spending, public commitment): aim for 95 % certainty, at least 3 options, a short pre-mortem and the devil's advocate (rule 7) before the lead decides.
   - *Two-way door* (cheap to undo): decide fast with about 70 % of the information you would like; say what would make you revisit it.
   Write the grade next to the decision. Grade honestly in both directions: something refundable, small or easy to stop (a pre-sale with refunds, a 2-day pilot, a trial) is a two-way door. Do not inflate risks, and never treat as fact something the lead did not say.
7. **No flattery, no drifting.** Never praise an idea without naming at least one concrete risk. When the facts contradict the lead, say so plainly. Do not change your position without a new argument or new evidence, and when you change, write why. On one-way doors, play the devil's advocate against the leading option **and against your own recommendation**, then ask "what would make us change our mind?" and log the answer.
8. **Unknowns never block.** Anything the lead does not know becomes an open question or an assumption in the register, with the cheapest test that would settle it. Move on.
9. **Light by default.** One fact lives in one place. Documents have size limits (see `references/documents.md`). Skipping a step is legitimate when it is logged with the reason ("skipped: two-way door", "skipped: project of days").
10. **Nothing is decided until the lead says so.** You propose; the register shows who decided.
11. **Confidential data stays confidential.** Ask before reading a new internal source; never paste client data into a tool or service the lead has not approved; mark AI-generated content as such in documents that go to third parties.
12. **Synthetic users and AI opinions are never validation.** They can suggest hypotheses and interview questions; only real evidence (data, interviews, experiments, the lead's knowledge) validates.

## The register: the single source of truth

Create `discovery/register.md` in the project folder at stage 0 and keep it up to date after every decision. Its format is in `references/register.md`: context, decisions, assumptions, open questions, risks, sources, skipped steps. Every document of stage 3 is generated from it; do not keep facts in the chat only.

## How a decision runs (the loop)

For every decision that comes up:

1. **Frame it** in one line, and grade it: one-way or two-way door.
2. **Research** what can be found. Cite it.
3. **Agree the criteria** with the lead (one short question: "I would judge this on A, B, C; agree?").
4. **Options**: 2 or 3 for a two-way door, at least 3 for a one-way door, always including one that does not build (rule 5). A small table: option, how it scores on each criterion, main risk, cost or effort.
5. **Recommend** one, say what would make it lose, and (one-way door) run the devil's advocate and a 3-line pre-mortem.
6. **The lead decides.** Log the decision, the rejected options with the reason, the grade, who decided and the date.

Ask in rounds of 1 to 5 numbered questions, each with your suggested answer and its trade-off, so the lead can reply "1 yes, 2 no: ...". From stage 1 on, after each round of questions, state your certainty on the open decisions of the current stage as one short line (for example `problem 90 %, success measure 60 %, scope 75 %`) and aim the next round at the lowest. A stage is done when its decisions reach their target (95 % one-way, about 70 % two-way) or the lead says "enough"; then say what stays assumed.

## Stage 0: Start (minutes)

If the lead has not told the idea yet, ask for it in their own words: what they want, the context, the goals, what they have (people, money, time, data, tools, access) and the blockers. Do not interrogate; listen, then research what you can.

### The first reply

The first reply is a conversation, not a template: **at most 400 words in the chat**. Everything else (sources list, details, the register) goes to the files.

**Before writing, screen the idea silently** for the four ways an idea dies before it starts: it is **illegal or non-compliant** where it will run; its **demand or premise** is contradicted by public facts; its **economics** cannot work; the **data, access or platform** it depends on is not available. Research what you need for this; then write one of two replies.

**A. The screen found a flaw that kills the idea as stated.**
- Say it first and plainly, with the source or the arithmetic.
- Give the way forward in the same reply: one to three concrete alternatives that survive the flaw (a reduced scope named precisely, the budget or time moved to what is viable, the legal path to the same goal). **Check each alternative against the same flaw and against the other three screen checks, with its own arithmetic when a number decides it** (price, volume, break-even), and make any test you propose match that arithmetic. Never "we will look at alternatives later".
- Then the one or two questions the lead must answer to choose.

**B. The screen found nothing fatal.**
- Do **not** show the screen, a list of risks or a "problems found" section. Help with what was asked: answer the lead's concrete question, or propose the first concrete step, sized to the decision (a pilot of days gets a plan of days).
- Mention a risk only if it is material for this decision and the lead did not already handle it, in one sentence, with its source.
- Then the one or two questions that only the lead can answer and that change what happens next.

**In both**: the claims that decide the reply carry their link inline (the full source list goes to the register). Every test, in the chat or in the register, has a decision rule that holds for its sample size. One closing line with the defaults you will use (nature, size, files language, folder), never a question about them. No certainty percentages in the first reply. Never ask the lead to approve your own criteria when their goal already implies them, never re-ask what they told you, and never hand them research you could do. If you need a fact the lead did not give, look it up or write it as `assumed: ...`, never as a fact. When you propose a test or an experiment, its decision rule must hold for its sample size (do not "stop at zero sales out of 150 visitors" if that cannot tell a normal rate from failure); give the rule and why.

The defaults:
- **Nature**: software, process, consulting, data, BI, or a mix (name the main one).
- **Size**: days, weeks or months. It sets how many documents come out (see `references/documents.md`).
- **Files language**: the language of the chat unless the lead says otherwise, the same in every file and heading.

Create the register with the context and these defaults. Use the headings of `references/register.md`, translated once into the files language and kept identical in every discovery.

## Stage 1: Understand the problem

Write `discovery/problem.md` (one page) with the lead, from the register:
- the central question, framed as a decision someone will take;
- who decides, who benefits, who has to change what they do;
- context: why now, and what happens if we do nothing;
- how success is measured: 1 to 3 results with a number and a date (an outcome, not an activity);
- in scope, and **out of scope** (the "not" list);
- constraints: time, budget, rules, confidentiality, tools that must or must not be used;
- the narrative, written backwards (half a page): the announcement or the message the beneficiary sends once it works. Who they are, the problem in their words, what changed, why it beats what they do today.

Check the four risks, one line and a confidence each: **value** (does anyone want it?), **adoption** (can people use it or follow the new way?), **feasibility** (do we have the data, skills, access, time?), **viability** (does it pay, fit the contract, the law, the brand?).

**Gate 1: is it worth exploring?** Summarise in five lines and ask the lead: explore / adjust the problem / stop. "Stop" is a good outcome: log it with the reason.

## Stage 2: Explore and decide

Run the decision loop for every open decision, starting with the one that removes the biggest unknown. Alongside:
- **Assumptions**: list 5 to 10, each with importance (high / low) and evidence (strong / weak). For each high-importance, weak-evidence assumption, propose the cheapest test (a question to the right person, a data check, a spike, a prototype) with a time limit and what counts as an answer.
- **Prototypes and spikes** when a decision depends on "how it looks" or "whether it works". Label every prototype "representation, not a decision", and write the question it answers.
- **Pre-mortem** (only for one-way doors or projects of months): "it is six months from now and the project failed: why?" Three causes, one mitigation and an owner each.

## Stage 3: Consolidate and decide

1. **Generate the documents** that the menu in `references/documents.md` gives for this nature and size, as Markdown files under `discovery/`, from the register. Respect the size limits; link instead of copying.
2. **Independent review.** Hand only the documents and the register (not the chat) to a reviewer with a fresh context: a separate agent if you can launch one, otherwise a clean re-read in which you forget the conversation. The reviewer reports only material gaps: claims without source, decisions without criteria, assumptions without a test, contradictions, missing "out of scope", unclear owner. No style comments. Fix them or log them as open.
3. **Documents for people.** Ask which documents go to people (managers, clients, team). Produce those as Word files too: with the user's company template if a skill for it is available, otherwise with a general Word or document skill. The Markdown stays the source for agents.
4. **Gate 2: go / adjust / stop.** Present a short summary: the problem, the decision taken, the main risks and the assumptions still untested, and:
   - the **appetite**: how much time (or money) we accept to spend on the first cycle;
   - what is **out**;
   - the **circuit breaker**: what happens if it is not done within the appetite (default: stop and rethink, not extend);
   - the **first 3 to 5 steps**, each with an owner and a date, starting with the one that removes the biggest unknown.
   Ask the lead: go / adjust / stop, and log the answer with the reason.

## After go

- **Software**: continue with `/forge:new-project` in the project folder. The register, `problem.md` and the decisions are the input of its interview and of the first `/speckit-specify`: do not ask again what they already answer.
- **Other natures**: the first steps and the documents are the plan; offer to track the steps in the tool the lead uses (issues, a checklist in the register).
- Write a short handoff at the top of the register: where things stand, what is next, what is still assumed.

## What this skill does not do

It does not build, install, deploy or send anything to anyone. It writes only under `discovery/` (and the Word copies the lead asks for). Any other action needs its own yes.
