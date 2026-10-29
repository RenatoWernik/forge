// Validates the framework. Usage, from the project root: node .claude/check.cjs [--env]   (exit code 1 if there is a FAIL)
//   default: .claude/forge.json + a simulation of both workflows (no model is called) + the manual/bootstrap examples that exist
//   --env:   also the machine and project setup (ai-memory, Spec-Kit, Graphify, git, hooks, skills); versions are forge's doctor job
// .claude/forge.json: { "language": "English", "langTag": "en", "mode": "rigorous", "models": { "developer": R, "developerUi": R, "critic": R, "tester": R, "aux": R }, "escalation": { <condition>: { "value", "description" } } }
//   with R = { model, effort, reason, label?, match? }
//   mode   = rigorous | accelerated
//   model  = alias or ID passed to agent() (sonnet, opus, ...); effort = low | medium | high | xhigh | max; reason = why this model and effort
//   label  = name shown on the panel (default: model); match = regex the model ID declared by an agent must satisfy (default: model)
//   escalation = sameCriterionFailures and minutesWithoutProgress (integer, 1 or more), attacksRedOnDelivery and visualBelowReference (true or false), each with a description
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm'), { spawnSync } = require('node:child_process')
process.chdir(path.join(__dirname, '..'))
const H = os.homedir(), AIM = 'ai-memory', ENV = process.argv.includes('--env')
const sh = (exe, args, input) => spawnSync(exe, args, { input, encoding: 'utf8' })
const out = (...a) => { const r = sh(...a); return r.error ? '' : r.stdout + r.stderr }
const has = (...p) => fs.existsSync(path.join(...p))
const get = url => fetch(url, { signal: AbortSignal.timeout(3000) })
let bad = 0
async function chk(name, f) {
  let ok = false
  try { ok = !!(await f()) } catch (e) {}
  console.log((ok ? 'ok    ' : 'FAIL  ') + name)
  if (!ok) bad = 1
}

;(async () => {
  // forge.json: the models every role runs on. Without a valid one nothing below can be simulated.
  const ROLES = ['developer', 'developerUi', 'critic', 'tester', 'aux'], WFR = ['developer', 'critic', 'aux'] // WFR: the roles the workflows read from args.models
  const EFF = ['low', 'medium', 'high', 'xhigh', 'max'], TEXT = ['developer', 'developerUi', 'critic', 'tester'] // TEXT: the roles whose "<label> <effort>" the meta can show
  const label = r => r.label || r.model
  const declared = r => r.model + ' ' + label(r) // the model ID a fake agent declares: it must satisfy the role's own match
  let FJ = {}
  try { FJ = JSON.parse(fs.readFileSync('.claude/forge.json', 'utf8').replace(/^﻿/, '')) } catch (e) {}
  const F = FJ.models || {}
  const matchOk = r => { try { return (r.match === undefined || typeof r.match === 'string') && new RegExp(r.match || r.model, 'i').test(declared(r)) } catch (e) { return false } }
  const isObj = x =>!!x && typeof x === 'object' && !Array.isArray(x)
  const LIMITS = { sameCriterionFailures: 'int', attacksRedOnDelivery: 'bool', minutesWithoutProgress: 'int', visualBelowReference: 'bool' }
  const problems = [] // what is wrong in forge.json, by field, for the detail of the line below
  if (!['rigorous', 'accelerated'].includes(FJ.mode)) problems.push('mode')
  for (const k of ROLES) {
    const r = F[k]
    if (!isObj(r)) { problems.push('models.' + k); continue }
    if (typeof r.model !== 'string' || !r.model) problems.push('models.' + k + '.model')
    else if (!matchOk(r)) problems.push('models.' + k + '.match')
    if (!EFF.includes(r.effort)) problems.push('models.' + k + '.effort')
    if (typeof r.reason !== 'string' || !r.reason.trim()) problems.push('models.' + k + '.reason')
  }
  const E = FJ.escalation
  if (!isObj(E)) problems.push('escalation')
  else for (const [c, t] of Object.entries(LIMITS)) {
    const v = isObj(E[c]) ? E[c] : {}
    if (!(t === 'bool' ? typeof v.value === 'boolean' : Number.isInteger(v.value) && v.value >= 1)) problems.push('escalation.' + c + '.value')
    if (typeof v.description !== 'string' || !v.description.trim()) problems.push('escalation.' + c + '.description')
  }
  await chk('forge.json: mode (rigorous or accelerated), the 5 roles (model, effort low, medium, high, xhigh or max, reason, and a match that accepts their own label) and the escalation (4 conditions, each with a value and a description)' + (problems.length ? ' (invalid: ' + problems.join(', ') + ')' : ''), () => !problems.length)
  if (bad) { console.log('\nFix .claude/forge.json first: the workflow simulation needs it.'); process.exit(1) }
  const fill = { developer: label(F.developer) + ' ' + F.developer.effort, developerUi: label(F.developerUi) + ' ' + F.developerUi.effort, critic: label(F.critic) + ' ' + F.critic.effort, tester: label(F.tester) + ' ' + F.tester.effort, 'aux.model': F.aux.model }
  const REC = /^\/\/ forge render:((?: \w+ <[^>\r\n]+>)+)/m, recOf = src => { const m = src.match(REC); return m ? [...m[1].matchAll(/(\w+) <([^>\r\n]+)>/g)].map(x => [x[1], x[2]]) : [] } // the roles the render line records, in the order their texts appear in the meta description
  const META = /^export const meta = (\{[\s\S]*?^\})/m, matches = src => { const m = src.match(META); if (!m) return false; const meta = vm.runInNewContext('(' + m[1] + ')'); return [...new Set(['developer', 'critic', ...recOf(src).map(x => x[0])])].every(k => fill[k] && meta.description.includes(fill[k])) && (meta.phases.find(p => p.title === 'Panel') || {}).model === fill['aux.model'] }
  if (process.argv.includes('--render')) { // brings the model and effort texts of the workflow meta in line with forge.json, as often as forge.json changes: fills the {{tokens}} of a fresh template copy, or swaps the texts recorded in the "// forge render:" line of an already rendered file
    const unsafe = ROLES.filter(k => !/^[\p{L}\p{N} ._\[\]-]{1,64}$/u.test(label(F[k])) || !/^[A-Za-z0-9][A-Za-z0-9._\[\]-]{0,63}$/.test(F[k].model)) // these texts are written into JS source: a plain charset only
    if (unsafe.length) { console.log('FAIL  render: .claude/forge.json models.' + unsafe.join(', models.') + ' has a model or label with characters outside letters, digits, space, dot, dash, underscore and brackets; nothing was written'); process.exit(1) }
    const renderOne = src => {
      if (src.includes('{{')) {
        const lit = (src.match(META) || [, ''])[1], at = k => lit.indexOf('{{' + k + '}}')
        const used = TEXT.filter(k => at(k) >= 0).sort((a, b) => at(a) - at(b)) // the roles whose text the meta shows, in the order it shows them
        src = src.replace(/\{\{([\w.]+)\}\}/g, (m, k) => fill[k] ?? m)
        if (REC.test(src)) src = src.replace(REC, () => '// forge render:' + used.map(k => ' ' + k + ' <' + fill[k] + '>').join(''))
      } else {
        const rec = recOf(src), m = src.match(META)
        if (!m || (!rec.length && matches(src))) return src
        if (!rec.length) throw new Error('the meta text does not match .claude/forge.json and the file holds neither {{tokens}} nor its "// forge render:" line, so forge cannot tell which texts to replace; restore the file from the forge templates and run --render again')
        // ponytail: finds each recorded text by position in the description (in the order of the render line), so a role text that also appears in the fixed prose would be misplaced; the check below refuses that, upgrade: wrap each token in a unique delimiter if templates ever need it
        let at = m[1].indexOf('description:'), meta = '', from = 0
        for (const [k, old] of rec) {
          const i = at < 0 || !fill[k] ? -1 : m[1].indexOf(old, at)
          if (i < 0) throw new Error('the texts recorded in its "// forge render:" line (' + rec.map(x => x[1]).join(', ') + ') are not in the meta description any more, or name a role forge.json does not have; restore the file from the forge templates and run --render again')
          meta += m[1].slice(from, i) + fill[k]
          from = at = i + old.length
        }
        meta = (meta + m[1].slice(from)).replace(/(title: 'Panel'[^}]*?model: ')[^']*'/, (x, a) => a + fill['aux.model'] + "'")
        src = src.slice(0, m.index) + 'export const meta = ' + meta + src.slice(m.index + m[0].length)
        src = src.replace(REC, () => '// forge render:' + rec.map(([k]) => ' ' + k + ' <' + fill[k] + '>').join(''))
      }
      if (!matches(src)) throw new Error('after rendering, the meta text still does not match .claude/forge.json; nothing was written')
      return src
    }
    const dir = '.claude/workflows', files = fs.readdirSync(dir).filter(f => f.endsWith('.js')), next = {}, errs = []
    for (const f of files) try { const src = fs.readFileSync(path.join(dir, f), 'utf8'), out = renderOne(src); if (out !== src) next[f] = out } catch (e) { errs.push(f + ': ' + e.message) }
    if (errs.length) { console.log('FAIL  render:\n  ' + errs.join('\n  ') + '\nnothing was written'); process.exit(1) }
    for (const f in next) fs.writeFileSync(path.join(dir, f), next[f])
    console.log(Object.keys(next).length ? 'rendered ' + Object.keys(next).join(', ') + ' from .claude/forge.json' : 'nothing to render: the workflow meta already matches .claude/forge.json')
    return
  }

  if (ENV) {
    const toml = k => (fs.readFileSync('.ai-memory.toml', 'utf8').match(new RegExp('^' + k + '\\s*=\\s*"([^"]+)"', 'm')) || [])[1]
    const url = process.env.AI_MEMORY_URL || 'http://127.0.0.1:49374' // ponytail: default port of ai-memory, override with AI_MEMORY_URL; read the port from the ai-memory config if it ever moves
    await chk('ai-memory: server answers at ' + url, async () => (await get(url + '/')).status > 0)
    await chk('ai-memory: .ai-memory.toml admits capture in this project', () => out(AIM, ['hook', '--event', 'user-prompt-submit', '--agent', 'claude-code', '--server-url', url, '--check-capture'], JSON.stringify({ cwd: process.cwd().replace(/\\/g, '/') })).includes('"admits_capture":true'))
    await chk('ai-memory: page _rules/framework.md seeded', () => sh(AIM, ['read-page', '--path', '_rules/framework.md', '--workspace', toml('workspace'), '--project', toml('project')]).status === 0)
    await chk('Spec-Kit: .specify/ and the /speckit-* skills installed', () => has('.specify/memory/constitution.md') && ['constitution', 'specify', 'clarify', 'plan', 'tasks', 'analyze', 'converge'].every(n => has('.claude/skills/speckit-' + n, 'SKILL.md')))
    await chk('Matt Pocock: /setup done (docs/agents/ and an "## Agent skills" block in CLAUDE.md)', () => has('docs/agents/issue-tracker.md') && fs.readFileSync('CLAUDE.md', 'utf8').includes('## Agent skills'))
    await chk('Graphify: post-commit and post-checkout hooks installed', () => { const s = out('graphify', ['hook', 'status']); return s.includes('post-commit: installed') && s.includes('post-checkout: installed') })
    await chk('git: repository and .gitignore with .gauntlet/ and graphify-out/', () => { const g = fs.readFileSync('.gitignore', 'utf8').split(/\r?\n/); return has('.git') && g.includes('.gauntlet/') && g.includes('graphify-out/') })
    // protection hooks: "installed" means an entry of the script is in the project's .claude/settings.json (not only in the answers); the script file must be there too
    const HOOKS = { killByName: 'forge-matar-por-nome.mjs', backgroundTests: 'forge-testes-em-primeiro-plano.mjs', idleWatch: 'forge-vigia-de-agentes.mjs' }
    let wired = ''
    try { wired = JSON.stringify(JSON.parse(fs.readFileSync('.claude/settings.json', 'utf8').replace(/^﻿/, '')).hooks || {}).replace(/\\\\/g, '/') } catch (e) {}
    const hooksOn = Object.keys(HOOKS).filter(k => wired.includes('.claude/hooks/' + HOOKS[k]))
    await chk('hooks installed in .claude/settings.json: ' + (hooksOn.join(', ') || 'none') + ' (each script must exist in .claude/hooks/)', () => hooksOn.every(k => has('.claude/hooks', HOOKS[k])))
    await chk('global skills (ponytail*, graphify, tdd) and the mattpocock-skills plugin', () => ['ponytail', 'ponytail-review', 'ponytail-audit', 'ponytail-debt', 'graphify', 'tdd'].every(s => has(H, '.claude/skills', s, 'SKILL.md')) && Object.keys(JSON.parse(fs.readFileSync(path.join(H, '.claude/plugins/installed_plugins.json'), 'utf8')).plugins).some(k => k.startsWith('mattpocock-skills@')))
    const cst = has('.specify/memory/constitution.md') ? fs.readFileSync('.specify/memory/constitution.md', 'utf8') : ''
    console.log('info  constitution: ' + (!cst ? 'missing' : cst.includes('[PROJECT_NAME]') ? 'still the template (run /speckit-constitution)' : 'filled in'))
    console.log('info  cp-* tags: ' + (out('git', ['tag', '--list', 'cp-*']).trim().split(/\s+/).join(' ') || 'none'))
    console.log('info  CP0: ' + (has('BOOTSTRAP.md') ? 'open (follow BOOTSTRAP.md)' : 'closed'))
  }
  if (FJ.plainStyle) await chk('style: no dash, arrow or emoji in CLAUDE.md, FRAMEWORK.md and BOOTSTRAP.md (when they exist)', () => ['CLAUDE.md', 'FRAMEWORK.md', 'BOOTSTRAP.md'].filter(f => has(f)).every(f => !/[\u2013\u2014\u2192\u2600-\u27BF\u{1F300}-\u{1FAFF}]/u.test(fs.readFileSync(f, 'utf8'))))
  // language: the three documents follow "language" of forge.json. Their prose (outside code blocks, backtick spans, links and URLs) is scored by the share of very common
  // function words per language, so any correct translation passes whatever it calls its headings, and a translation of the headings alone does not (no network, no model).
  // English must be mostly English words; any other language must have almost none left; Portuguese must also show its own words.
  // ponytail: two built-in word lists (English, Portuguese); the Portuguese list leaves out the words Spanish shares (que, para, por, ...); another language is only checked for "not English any more", upgrade: add its list here when a third one ships
  const WORDS = { en: 'the and of is are to in that it for with be this by on or not from each when an at if which before after only every any all was were has have its their your our does can must may', pt: 'não uma com das são ao pelo pela também mais quando sem os um é da em seu sua nas há ou isso ele ela pode deve já o seus suas nem só ainda depois apenas sempre' }
  const share = (ws, list) => ws.filter(w => list.includes(w)).length / (ws.length || 1)
  const clean = f => fs.readFileSync(f, 'utf8').replace(/^\s*```[\s\S]*?^\s*```/gm, ' ').replace(/`[^`\n]*`/g, ' ').replace(/\]\([^)]*\)/g, ']').replace(/https?:\/\/\S+/g, ' ')
  // The language is read from the BCP 47 "langTag" (forge writes it next to the English name, whatever spelling the user typed).
  // ponytail: a forge.json from before langTag falls back to the name (English, Portuguese or "und"); upgrade: drop the fallback once no such project is left
  const tag = FJ.langTag === undefined ? (/^en/i.test(FJ.language) ? 'en' : /portugu|^pt\b/i.test(FJ.language) ? 'pt-BR' : 'und') : FJ.langTag
  const tagOk = typeof tag === 'string' && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(tag)
  const en = tagOk && /^en(-|$)/i.test(tag), pt = tagOk && /^pt(-|$)/i.test(tag)
  // Scored per section (the text before the first heading and each block under a "##" or deeper heading), so English left in a few sections cannot hide behind a long translated rest; only sections with 30+ words are scored (all of them when none has),
  // The blocks the installers append (## graphify, ## Agent skills) are English by construction and are skipped.
  // ponytail: a section under 30 words is not scored, upgrade: lower the floor if short English sections slip through
  const badSections = f => {
    let own = false // the sub-headings (###) of an installer block belong to it
    const all = clean(f).split(/^(?=#{2,} )/m).map(t => {
      const [, hashes, h] = t.split(/\n/)[0].match(/^(#*)\s*(.*)/)
      if (hashes.length < 3) own = /^(graphify|agent skills)$/i.test(h)
      return [h, t.toLowerCase().match(/\p{L}+/gu) || [], own]
    })
    const big = all.filter(([, w]) => w.length >= 30)
    const off = ([, w]) => { const e = share(w, WORDS.en.split(' ')), p = share(w, WORDS.pt.split(' ')); return en ? e < 0.15 || p > 0.03 : e > 0.1 || (pt && p < 0.05) }
    return (big.length ? big : all).filter(x => !x[2] && off(x)).map(([t]) => t)
  }
  const wrong = ['CLAUDE.md', 'FRAMEWORK.md', 'BOOTSTRAP.md'].filter(f => has(f)).map(f => [f, badSections(f)]).filter(([, b]) => b.length).map(([f, b]) => f + ' [' + b.join(', ') + ']')
  await chk('language: CLAUDE.md, FRAMEWORK.md and BOOTSTRAP.md (when they exist) are in the language of forge.json, in the body text and not only in the headings' + (wrong.length ? ' (not in ' + FJ.language + ': ' + wrong.join(', ') + ')' : ''), () => typeof FJ.language === 'string' && tagOk && !wrong.length)

  // workflows: simulation with a fake runtime (no model is called) of the invariants the manual promises and of the Workflow API contract.
  // The script runs in a vm context that only has the API hooks the workflows use (args, agent, parallel, phase, log; no Node, no files,
  // no clock); Date.now, Math.random and new Date() without an argument throw, and so does the 1001st agent(), as in the runtime.
  // If a workflow starts using another hook (pipeline, budget, workflow), the ReferenceError says to extend this runtime on purpose.
  // wf never throws: the script failure stays in run.err and every check that depends on it prints its own FAIL.
  const seen = {}
  const wf = async (file, args, impl) => {
    const run = { calls: [], logs: [], phases: [] }
    ;(seen[file] ||= []).push(run)
    try {
      const src = fs.readFileSync('.claude/workflows/' + file, 'utf8').replace(/^export const meta\s*=/m, 'const meta =')
      const agent = async (prompt, opts) => { if (run.calls.push({ prompt, opts }) > 1000) throw new Error('limit of 1000 agents'); return impl(prompt, opts) }
      const parallel = ts => Promise.all(ts.map(t => t().catch(() => null)))
      const ctx = vm.createContext({ args, agent, parallel, phase: t => run.phases.push(t), log: m => run.logs.push(m) })
      vm.runInContext('Date.now = Math.random = () => { throw new Error("forbidden in Workflow") }; Date = new Proxy(Date, { construct: (T, a) => a.length ? new T(...a) : Date.now() })', ctx)
      run.out = await vm.runInContext('(async () => {' + src + '\n})()', ctx)
    } catch (e) { run.err = e }
    return run
  }
  const rejects = async (file, args) => { let n = 0; const x = await wf(file, args, () => ++n); return n === 0 && /incomplete args/.test(x.err?.message) }
  const [D, C, X] = WFR.map(k => F[k])
  const base = { checkpoint: { n: 1, title: 'T' }, root: 'C:\\p', dashboardUrl: 'https://x', context: 'CTX-SPEC-PLAN-TASKS', models: F, language: FJ.language }
  const rn = o => +o.label.match(/:r(\d+)$/)[1]
  const flip = l => (l === 'A' ? 'B' : 'A')
  const only = (calls, re) => calls.filter(c => re.test(c.opts.label))
  const stuck = calls => calls.filter(c => c.prompt.includes('-stuck'))
  const veto = c => ['Do not consult memory', 'do not open FRAMEWORK.md or .claude/workflows/', 'unless the context above allows it', 'you edit no file'].every(t => c.prompt.includes(t)) // what invariant 2 forbids the critic
  const key = r => r.model + ',' + r.effort
  const ROLE = { build: key(D), pony: key(D), critic: key(C), 'pony-critic': key(C), panel: key(X) } // invariant 2: model,effort of each role by label prefix, from forge.json
  const rolesOk = (calls, roles = ROLE) => calls.every(c => roles[c.opts.label.split(':')[0]] === c.opts.model + ',' + c.opts.effort)
  const ver = (calls, l) => only(calls, new RegExp('^panel:verdict:' + l + '$'))[0].prompt // what the workflow tells the panel to record at the end of a round (only it knows whether ours really won)
  const LOST = ['"verdict":"perdeu"', '"status":"building"', '"kind":"fail"'], WON = ['"verdict":"ganhou"', '"status":"won"', '"kind":"ok"'] // "ganhou"/"perdeu" are fixed panel values the dashboard reads
  const verdictOk = (p, n, gap, yes, no) => [...yes, `"rounds":${n},`].every(t => p.includes(t)) && !no.some(t => p.includes(t)) && p.split(`"gap":"${gap}"`).length === 3 // the gap goes twice: on the agent and on the piece
  const piece = { id: 'p', title: 'P', goal: 'META-P', bar: 'BAR-X', owns: ['src/a.js', 'src/only-owns.js'], tdd: true } // only-owns.js reaches the agents through owns alone: the fake developer changes only src/a.js
  const MARKS = [piece.goal, piece.bar, base.context, base.root, 'src/only-owns.js'] // what the piece args hand to the developer and to the critic
  const dev = { summary: 'DEV-REASONING', filesChanged: ['src/a.js'], testCommand: 'TEST-DEV', redEvidence: 'RED-EV', greenEvidence: 'GREEN-EV', model: declared(D) }
  const critic = (p, o, at = 9) => { const ours = /^A: .*src\/a\.js/m.test(p) ? 'A' : 'B'; return { winner: rn(o) >= at ? ours : flip(ours), testsPass: true, blockingErrors: rn(o) >= at ? [] : ['BLOCK-' + rn(o)], biggestGap: 'GAP-' + rn(o), reasoning: 'CRITIC-REASONING-' + rn(o), model: declared(C) } }
  const build = (p, o, at) => o.label.startsWith('build:') ? dev : o.label.startsWith('critic:') ? critic(p, o, at) : 'ok'
  const win = (p, o) => o.label.startsWith('critic:') ? { ...critic(p, o), winner: /^A: .*src\/a\.js/m.test(p) ? 'A' : 'B', blockingErrors: [] } : build(p, o) // wins already in round 1
  // Invariant 3, no round cap: the critic only picks ours in round 300 (1 seed + 3 agents per round = 901 of the 1000 agents) and the workflow must get there; a `round < N` in the while fails here.
  // ponytail: only catches caps below 300 rounds (the runtime allows at most 333); raise the 300 and the 901 (1 + 3 per round) if a larger cap ever matters.
  const noCap = async (file, args, impl) => { const x = await wf(file, args, (p, o) => impl(p, o, 300)); return x.out.results[0].won && x.out.results[0].rounds === 300 && x.calls.length === 901 }

  let r = await wf('gauntlet-build.js', { ...base, pieces: [piece] }, build)
  const seedB = r.calls[0]?.prompt
  const crit = only(r.calls, /^critic:/), devs = only(r.calls, /^build:/)
  await chk('build: wins in round 9, after escalateAfter (6), and only at 300 (901 of 1000 agents): no exit by number of rounds', async () => r.out.results[0].won && r.out.results[0].rounds === 9 && await noCap('gauntlet-build.js', { ...base, pieces: [piece] }, build))
  await chk('build: the results[] return has id, stopped, files, testCommand, models and the last round\'s lastVerdict', () => { const x = r.out.results[0]; return x.id === 'p' && !x.stopped && x.files.join() === 'src/a.js' && x.testCommand === 'TEST-DEV' && x.models.builder === declared(D) && x.models.critic === declared(C) && x.lastVerdict.biggestGap === 'GAP-9' })
  await chk('panel: build: the verdict records perdeu/building/fail or ganhou/won/ok, plus the round and the gap (rounds 1 and 9 here)', () => verdictOk(ver(r.calls, 'p:r1'), 1, 'GAP-1', LOST, WON) && verdictOk(ver(r.calls, 'p:r9'), 9, 'GAP-9', WON, LOST))
  await chk('build: each round calls, in separate agent() calls and in this order, the developer, the critic and the panel', () => r.calls.length === 28 && r.calls.slice(0, 4).map(c => c.opts.label).join() === 'panel:seed,build:p:r1,critic:p:r1,panel:verdict:p:r1' && r.calls.slice(-3).map(c => c.opts.label).join() === 'build:p:r9,critic:p:r9,panel:verdict:p:r9')
  await chk('build: "stuck" question exactly once, in round 6', () => stuck(r.calls).length === 1 && stuck(r.calls)[0].opts.label.endsWith(':r6'))
  await chk('build: the "stuck" question offers to change the bar, narrow the scope or stop', () => /change the bar.*narrow the scope.*stop/.test(stuck(r.calls)[0].prompt) && stuck(r.calls)[0].prompt.includes('"kind":"pergunta"'))
  await chk('build: the gap and blocking errors of round N reach the developer of round N+1, and the round 1 developer gets nothing', () => devs.length === 9 && !devs[0].prompt.includes('GAP-') && !devs[0].prompt.includes('BLOCK-') && ['GAP-1', 'BLOCK-1'].every(t => devs[1].prompt.includes(t)) && !devs[1].prompt.includes('BLOCK-2') && devs[8].prompt.includes('BLOCK-8'))
  await chk('build: the critic gets neither the developer\'s reasoning (summary) nor the reasoning, gap and errors of earlier rounds', () => crit.length === 9 && crit.every(c => !/REASONING-|GAP-|BLOCK-/.test(c.prompt)))
  await chk('build: the critic gets what the developer declared (test command, red and green)', () => crit.length > 0 && crit.every(c => ['TEST-DEV', 'RED-EV', 'GREEN-EV'].every(t => c.prompt.includes(t))))
  await chk('build: the critic is told not to consult memory, not to open FRAMEWORK.md or .claude/workflows/ (unless the context allows it) and not to edit files; the developer, to use memory_query and graphify', () => crit.length > 0 && crit.every(veto) && devs.length > 0 && devs.every(d => ['memory_query', 'graphify query', 'graphify affected'].every(t => d.prompt.includes(t))))
  await chk('build: roles use the models and effort from forge.json (developer, critic, aux); no other model', () => devs.length > 0 && crit.length > 0 && rolesOk(r.calls))
  await chk('build: the critic gets the goal, bar, context, root and owns of the piece; the prompt does not say which candidate is ours and the label alternates', () => crit.every(c => MARKS.every(t => c.prompt.includes(t)) && !/\bours\b|Project code:|Reference:/i.test(c.prompt)) && new Set(crit.map(c => /^A: .*src\/a\.js/m.test(c.prompt))).size === 2)
  await chk('build: the developer gets the goal, bar, context, root and owns of the piece', () => devs.length > 0 && devs.every(d => MARKS.every(t => d.prompt.includes(t))))
  r = await wf('gauntlet-build.js', { ...base, pieces: [piece] }, (p, o) => o.label === 'critic:p:r2' ? null : build(p, o))
  await chk('build: an agent without an answer ends the piece (stopped) instead of spinning, and log() says which round', () => !r.out.results[0].won && r.out.results[0].stopped && r.out.results[0].rounds === 2 && r.logs.some(l => l.startsWith('p r2:') && l.includes('without an answer')))
  r = await wf('gauntlet-build.js', { ...base, pieces: [piece] }, (p, o) => o.label === 'build:p:r1' ? null : build(p, o))
  await chk('build: a developer without an answer ends the piece (stopped) without calling the critic, and log() says so', () => !r.out.results[0].won && r.out.results[0].stopped && r.out.results[0].rounds === 1 && only(r.calls, /^critic:/).length === 0 && r.logs.some(l => l.startsWith('p r1:') && l.includes('without an answer')))
  r = await wf('gauntlet-build.js', { ...base, pieces: [piece] }, (p, o) => { const x = win(p, o); return typeof x === 'object' ? { ...x, model: 'zz-not-configured-zz' } : x })
  await chk('build: a declared model outside the request gives a WARNING and shows in models', () => r.logs.filter(l => l.startsWith('WARNING')).length === 2 && r.out.results[0].models.builder === 'zz-not-configured-zz' && r.out.results[0].models.critic === 'zz-not-configured-zz')
  const fault = f => (p, o) => { const x = win(p, o); return o.label === 'critic:p:r1' ? { ...x, ...(typeof f === 'function' ? f(x) : f) } : x } // a verdict that would win, with one fault in round 1 (fields to swap, or a function of the verdict)
  await chk('build: winning needs everything together: ours chosen, testsPass and no blockingErrors; with one missing the loop goes on to the next round', async () => (await Promise.all([{ testsPass: false }, { blockingErrors: ['x'] }, x => ({ winner: flip(x.winner) })].map(f => wf('gauntlet-build.js', { ...base, pieces: [piece] }, fault(f))))).every(x => x.out.results[0].won && x.out.results[0].rounds === 2))
  r = await wf('gauntlet-build.js', { ...base, escalateAfter: 2, pieces: [piece] }, build)
  await chk('build: escalateAfter changes the round of the "stuck" question (2 here) and the loop goes on until it wins', () => stuck(r.calls).length === 1 && stuck(r.calls)[0].opts.label.endsWith(':r2') && r.out.results[0].rounds === 9)
  r = await wf('gauntlet-build.js', { ...base, pieces: [{ ...piece, tdd: false }] }, win)
  await chk('build: tdd:false swaps the red and green requirement for "no testable seam"; with tdd:true the developer gets the behavior-test rule', () => only(r.calls, /^build:/)[0].prompt.includes('no testable seam') && !only(r.calls, /^build:/)[0].prompt.includes('write ONE behavior test') && devs[0].prompt.includes('write ONE behavior test') && !devs[0].prompt.includes('no testable seam'))
  r = await wf('gauntlet-build.js', { ...base, parallel: true, pieces: [piece, { ...piece, id: 'q', title: 'Q', owns: ['src/b.js'] }] }, (p, o) => o.label.startsWith('build:q:') ? Promise.reject(new Error('agent failure')) : win(p, o))
  await chk('build: parallel:true runs the pieces together; the one that throws leaves the result and log() records it (ATTENTION), without taking the other down', () => r.calls[1].opts.label === 'build:p:r1' && r.calls[2].opts.label === 'build:q:r1' && r.out.results.length === 1 && r.out.results[0].id === 'p' && r.out.results[0].won && r.logs.some(l => l.startsWith('ATTENTION')))
  await chk('build: args without root, dashboardUrl or pieces, or a piece without id, title, goal, bar or owns, bring the workflow down with incomplete args, before spending an agent', async () => (await Promise.all([{ root: '' }, { dashboardUrl: '' }, { pieces: [] }, ...['id', 'title', 'goal', 'bar', 'owns'].map(k => ({ pieces: [{ ...piece, [k]: undefined }] }))].map(a => rejects('gauntlet-build.js', { ...base, pieces: [piece], ...a })))).every(Boolean))
  // args.models missing or wrong: the workflow stops with an error that names the role and points to forge.json, before spending an agent
  const badModels = WFR.flatMap(k => [{ ...F, [k]: undefined }, { ...F, [k]: { ...F[k], model: '' } }, { ...F, [k]: { ...F[k], effort: 'ultra' } }, { ...F, [k]: { ...F[k], effort: undefined } }, { ...F, [k]: { ...F[k], match: '(' } }].map(m => [k, m]))
  const rejectsModels = async (file, args) => (await Promise.all([[null, undefined], [null, {}], ...badModels].map(async ([k, m]) => { let n = 0; const x = await wf(file, { ...args, models: m }, () => ++n), msg = x.err?.message || ''; return n === 0 && /incomplete args/.test(msg) && msg.includes('.claude/forge.json') && (!k || msg.includes('(review: ' + k + ')')) }))).every(Boolean)
  await chk('build: args without models, or with a role missing model or a valid effort, or with a match that is not a valid regex, bring the workflow down with incomplete args naming the role and pointing to forge.json, before spending an agent', () => rejectsModels('gauntlet-build.js', { ...base, pieces: [piece] }))
  const big = 'x'.repeat(100000)
  r = await wf('gauntlet-build.js', { ...base, pieces: [piece] }, (p, o) => o.label === 'build:p:r1' ? { ...dev, redEvidence: big } : win(p, o))
  await chk('build: evidence over the limit reaches the critic cut, flagged there and recorded with log() (only the cut field)', () => { const c = only(r.calls, /^critic:/)[0].prompt; return !c.includes(big) && c.includes('[cut') && r.logs.some(l => l.includes('p r1 red') && l.includes('100000')) && !r.logs.some(l => l.includes('p r1 green')) })

  if (has('FRAMEWORK.md')) await chk('manual: the args example in FRAMEWORK.md (section 5, step 2) is accepted by gauntlet-build', async () => {
    const ex = JSON.parse(fs.readFileSync('FRAMEWORK.md', 'utf8').match(/```json\r?\n([\s\S]*?)\r?\n```/)[1])
    const x = await wf('gauntlet-build.js', { ...ex, models: F }, win)
    return x.out.results[0].won && x.out.results[0].rounds === 1
  })

  const units = [{ id: 'u1', title: 'U1', paths: ['src/a.js'] }, { id: 'u2', title: 'U2', paths: ['src/b.js'] }]
  const cut = { cuts: ['CUT-DEV'], kept: ['KEPT-DEV'], linesBefore: 9, linesAfter: 5, testOutput: 'ok', model: declared(D) }
  const pcritic = (p, o, at = o.label.includes(':u1:') ? 8 : 2) => { const cur = /^A: .*\.gauntlet/m.test(p) ? 'B' : 'A', win = rn(o) >= at; return { winner: win ? cur : flip(cur), testsPass: true, behaviourPreserved: true, wronglyCut: [], remainingCuts: win ? [] : ['CUT-LEFT-' + rn(o)], biggestGap: 'GAP-' + rn(o), model: declared(C) } }
  const pony = (p, o, at) => o.label.startsWith('pony:') ? cut : o.label.startsWith('pony-critic:') ? pcritic(p, o, at) : 'ok'
  const uAll = { ...base, testCommand: 'SUITE-CMD', units }, u1 = { ...uAll, units: [units[0]] }, u2 = { ...uAll, units: [units[1]] }
  r = await wf('gauntlet-ponytail.js', uAll, pony)
  await chk('ponytail: units approved in rounds 8 and 2, no WARNING in log(), critic with context and without a label map', () => r.out.results.map(x => x.rounds).join() === '8,2' && r.out.results.every(x => x.won) && !r.logs.some(l => l.startsWith('WARNING')) && only(r.calls, /^pony-critic:/).every(c => c.prompt.includes(base.context) && !/\b[AB] = /.test(c.prompt)))
  await chk('ponytail: "stuck" question exactly once, in round 6, offering to narrow the scope or stop', () => stuck(r.calls).length === 1 && stuck(r.calls)[0].opts.label.endsWith(':r6') && /narrow the scope or stop/.test(stuck(r.calls)[0].prompt) && stuck(r.calls)[0].prompt.includes('"kind":"pergunta"'))
  await chk('ponytail: the results[] return has id, stopped, cuts, linesBefore, linesAfter, models and the last round\'s lastVerdict', () => { const x = r.out.results[0]; return x.id === 'u1' && !x.stopped && x.cuts.join() === 'CUT-DEV' && x.linesBefore === 9 && x.linesAfter === 5 && x.models.builder === declared(D) && x.models.critic === declared(C) && x.lastVerdict.biggestGap === 'GAP-8' })
  await chk('panel: ponytail: the verdict records perdeu/building/fail or ganhou/won/ok, plus the round and the gap (rounds 1 and 8 of u1 here)', () => verdictOk(ver(r.calls, 'u1:r1'), 1, 'GAP-1', LOST, WON) && verdictOk(ver(r.calls, 'u1:r8'), 8, 'GAP-8', WON, LOST))
  const pd = only(r.calls, /^pony:u1:/), pc = only(r.calls, /^pony-critic:/)
  await chk('ponytail: each round calls, in separate agent() calls and in this order, the developer, the critic and the panel', () => r.calls.length === 31 && r.calls.slice(0, 4).map(c => c.opts.label).join() === 'panel:seed,pony:u1:r1,pony-critic:u1:r1,panel:verdict:u1:r1' && r.calls.slice(-3).map(c => c.opts.label).join() === 'pony:u2:r2,pony-critic:u2:r2,panel:verdict:u2:r2')
  await chk('ponytail: roles use the models and effort from forge.json (developer, critic, aux); no other model', () => pd.length > 0 && pc.length > 0 && rolesOk(r.calls))
  await chk('ponytail: the label of the current version alternates between rounds', () => new Set(pc.map(c => /^A: .*\.gauntlet/m.test(c.prompt))).size === 2)
  await chk('ponytail: the critic is told not to consult memory, not to open FRAMEWORK.md or .claude/workflows/ (unless the context allows it) and not to edit files', () => pc.length > 0 && pc.every(veto))
  await chk('ponytail: the critic gets neither the gap nor the remaining cuts of earlier rounds', () => pc.length === 10 && pc.every(c => !/GAP-|CUT-LEFT-/.test(c.prompt)))
  await chk('ponytail: the critic gets what the developer declared (cuts and kept)', () => pc.length > 0 && pc.every(c => ['CUT-DEV', 'KEPT-DEV'].every(t => c.prompt.includes(t))))
  const u1calls = r.calls.filter(c => /^pony(-critic)?:u1:/.test(c.opts.label))
  await chk('ponytail: the developer and the critic get the unit (paths), the full suite (testCommand), the context and the root', () => u1calls.length > 0 && u1calls.every(c => [units[0].paths[0], uAll.testCommand, base.context, base.root].every(t => c.prompt.includes(t))))
  await chk('ponytail: the gap and remaining cuts of round N reach the developer of round N+1, and the round 1 developer gets nothing', () => pd.length === 8 && !pd[0].prompt.includes('GAP-') && !pd[0].prompt.includes('CUT-LEFT-') && ['GAP-1', 'CUT-LEFT-1'].every(t => pd[1].prompt.includes(t)) && !pd[1].prompt.includes('CUT-LEFT-2') && pd[7].prompt.includes('CUT-LEFT-7'))
  const L = r.calls.map(c => c.opts.label), i2 = L.findIndex(l => l.includes(':u2:'))
  await chk('ponytail: one unit at a time (nothing of u1 after u2 starts)', () => i2 > 0 && L.slice(i2).every(l => !l.includes(':u1:')))
  await chk('panel: the seed of both workflows records pieces.checkpoint as text (a numeric 0 vanishes from the panel)', () => [seedB, r.calls[0].prompt].every(s => s.includes('"checkpoint":"1"') && !/"checkpoint":[^"]/.test(s)))
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rec = (role, m) => new RegExp(`"role":"${role}","loop":"\\w+","model":"${esc(label(m))}","effort":"${esc(m.effort)}"`)
  const [dv, ct, pB, pC] = [[...devs, ...pd], [...crit, ...pc], rec('builder', D), rec('critic', C)]
  await chk('panel: the panel records say the model and effort of each role from forge.json (developer, critic), in the seed and in every agent of both workflows', () => dv.length > 0 && ct.length > 0 && dv.every(c => pB.test(c.prompt)) && ct.every(c => pC.test(c.prompt)) && [seedB, r.calls[0].prompt].every(s => pB.test(s) && pC.test(s)))
  // probe: distinct models per role. A workflow that ignores args.models fails here even when forge.json equals what it hardcodes.
  const PROBE = { developer: { model: 'probe-dev', effort: 'xhigh', label: 'Probe Dev 1.0' }, critic: { model: 'probe-critic', effort: 'low', label: 'Probe Critic 2.0' }, aux: { model: 'probe-aux', effort: 'max', label: 'Probe Aux 3.0' } }
  const PR = { build: 'probe-dev,xhigh', pony: 'probe-dev,xhigh', critic: 'probe-critic,low', 'pony-critic': 'probe-critic,low', panel: 'probe-aux,max' }
  const probe = async (file, args, impl) => {
    const x = await wf(file, { ...args, models: PROBE, language: 'Probe-Language', memory: { workspace: 'probe-ws', project: 'probe-proj' } }, (p, o) => { const y = impl(p, o); return typeof y === 'object' ? { ...y, model: declared(PROBE[/^(build|pony):/.test(o.label) ? 'developer' : 'critic']) } : y })
    seen[file].pop() // the probe runs are not part of the contract checks below (their aux model differs from the meta phases)
    return x
  }
  const [PB, PP] = [await probe('gauntlet-build.js', { ...base, pieces: [piece] }, win), await probe('gauntlet-ponytail.js', u2, pony)]
  const [pbD, pbC, ppD, ppC] = [only(PB.calls, /^build:/), only(PB.calls, /^critic:/), only(PP.calls, /^pony:/), only(PP.calls, /^pony-critic:/)]
  await chk('models: with distinct probe models in args.models, every agent() of both workflows uses them (model, effort and panel text) and warns about none, whatever forge.json says', () => [PB, PP].every(x => x.out.results[0].won && rolesOk(x.calls, PR) && !x.logs.some(l => l.startsWith('WARNING')) && [rec('builder', PROBE.developer), rec('critic', PROBE.critic)].every(re => re.test(x.calls[0].prompt))) && [...pbD, ...ppD].every(c => rec('builder', PROBE.developer).test(c.prompt)) && [...pbC, ...ppC].every(c => rec('critic', PROBE.critic).test(c.prompt)) && pbD.length > 0 && ppD.length > 0 && pbC.length > 0 && ppC.length > 0)
  await chk('args: language reaches every agent() prompt of both workflows and memory reaches the build developer (ai-memory workspace and project), whatever forge.json says', () => [PB, PP].every(x => x.calls.length > 3 && x.calls.every(c => c.prompt.includes('Probe-Language'))) && pbD.length > 0 && pbD.every(c => c.prompt.includes('workspace "probe-ws", project "probe-proj"')) && devs.every(c => !c.prompt.includes('probe-ws') && c.prompt.includes('.ai-memory.toml')))
  await chk('ponytail: args without root, dashboardUrl, testCommand or units, or a unit without id, title or paths, bring the workflow down with incomplete args, before spending an agent', async () => (await Promise.all([{ root: '' }, { dashboardUrl: '' }, { testCommand: '' }, { units: [] }, ...['id', 'title', 'paths'].map(k => ({ units: [{ ...units[0], [k]: undefined }] }))].map(a => rejects('gauntlet-ponytail.js', { ...uAll, ...a })))).every(Boolean))
  await chk('ponytail: args without models, or with a role missing model or a valid effort, or with a match that is not a valid regex, bring the workflow down with incomplete args naming the role and pointing to forge.json, before spending an agent', () => rejectsModels('gauntlet-ponytail.js', uAll))
  // panel down: the seed does not answer (null) and the verdicts answer an error; the work goes on and every failure goes to log()
  const noPanel = impl => (p, o) => o.label === 'panel:seed' ? null : o.label.startsWith('panel:') ? 'error: ArtifactData unavailable' : impl(p, o)
  const [pb, pp, pbOk] = [await wf('gauntlet-build.js', { ...base, pieces: [piece] }, noPanel(win)), await wf('gauntlet-ponytail.js', u2, noPanel(pony)), await wf('gauntlet-build.js', { ...base, pieces: [piece] }, win)]
  const warns = x => x.logs.filter(l => l.startsWith('WARNING panel:')).length
  await chk('panel: build: a panel agent without "ok" (null or error) becomes a WARNING in log() and the piece wins anyway; with "ok" the log stays clean', () => pb.out.results[0].won && warns(pb) === 2 && !pbOk.logs.some(l => l.startsWith('WARNING')))
  await chk('panel: ponytail: a panel agent without "ok" (null or error) becomes a WARNING in log() and the unit is approved anyway', () => pp.out.results[0].won && warns(pp) === 3)
  r = await wf('gauntlet-ponytail.js', u2, (p, o) => o.label.startsWith('pony:') ? { ...cut, beforeDir: 'C:\\elsewhere' } : pony(p, o))
  await chk('ponytail: the developer and the critic get the "before" the workflow computed (.gauntlet/ponytail/cp1/u2/before), never a path the developer declared', () => { const dir = 'C:\\p\\.gauntlet\\ponytail\\cp1\\u2\\before', c = only(r.calls, /^pony-critic:/); return only(r.calls, /^pony:/)[0].prompt.includes(dir) && c.length > 0 && c.every(x => x.prompt.includes(dir) && !x.prompt.includes('C:\\elsewhere')) })
  const trimmed = async (f, other) => { const x = await wf('gauntlet-ponytail.js', u2, (p, o) => o.label === 'pony:u2:r1' ? { ...cut, [f]: [big] } : pony(p, o)), c = only(x.calls, /^pony-critic:/)[0].prompt; return !c.includes(big) && c.includes('[cut') && x.logs.some(l => l.includes('u2 r1 ' + f)) && !x.logs.some(l => l.includes('u2 r1 ' + other)) }
  await chk('ponytail: cuts or kept over the limit reach the critic cut, flagged there and recorded with log() (only the cut field)', async () => (await Promise.all([trimmed('cuts', 'kept'), trimmed('kept', 'cuts')])).every(Boolean))
  const [dn, cn] = [await wf('gauntlet-ponytail.js', u1, (p, o) => o.label === 'pony:u1:r1' ? null : pony(p, o)), await wf('gauntlet-ponytail.js', u1, (p, o) => o.label === 'pony-critic:u1:r2' ? null : pony(p, o))]
  await chk('ponytail: an agent without an answer (developer or critic) ends the unit (stopped) instead of spinning, and log() says so; no developer, no critic', () => [dn, cn].every(x => !x.out.results[0].won && x.out.results[0].stopped) && dn.out.results[0].rounds === 1 && cn.out.results[0].rounds === 2 && only(dn.calls, /^pony-critic:/).length === 0 && dn.logs.some(l => l.startsWith('u1 r1:') && l.includes('without an answer')) && cn.logs.some(l => l.startsWith('u1 r2:') && l.includes('without an answer')))
  r = await wf('gauntlet-ponytail.js', u2, (p, o) => { const x = pony(p, o); return typeof x === 'object' ? { ...x, model: 'zz-not-configured-zz' } : x })
  await chk('ponytail: a declared model outside the request gives a WARNING and shows in models', () => r.logs.filter(l => l.startsWith('WARNING')).length === 4 && r.out.results[0].models.builder === 'zz-not-configured-zz' && r.out.results[0].models.critic === 'zz-not-configured-zz')
  const pwin = (p, o) => o.label.startsWith('pony-critic:') ? { ...pcritic(p, o), winner: /^A: .*\.gauntlet/m.test(p) ? 'B' : 'A', remainingCuts: [] } : pony(p, o) // always picks the current version, clean
  const pfault = f => (p, o) => { const x = pwin(p, o); return o.label === 'pony-critic:u2:r1' ? { ...x, ...(typeof f === 'function' ? f(x) : f) } : x } // ... but with one fault in round 1
  await chk('ponytail: approving needs everything together: the current version chosen, testsPass, behaviourPreserved, wronglyCut and remainingCuts empty; with one missing the loop goes on to the next round', async () => (await Promise.all([{ testsPass: false }, { behaviourPreserved: false }, { wronglyCut: ['x'] }, { remainingCuts: ['x'] }, x => ({ winner: flip(x.winner) })].map(f => wf('gauntlet-ponytail.js', u2, pfault(f))))).every(x => x.out.results[0].won && x.out.results[0].rounds === 2))
  r = await wf('gauntlet-ponytail.js', { ...u2, escalateAfter: 1 }, pony)
  await chk('ponytail: escalateAfter changes the round of the "stuck" question (1 here) and the unit goes on until approved', () => stuck(r.calls).length === 1 && stuck(r.calls)[0].opts.label.endsWith(':r1') && r.out.results[0].won && r.out.results[0].rounds === 2)
  await chk('ponytail: approved only in round 300 (901 of 1000 agents): no exit by number of rounds', () => noCap('gauntlet-ponytail.js', u1, pony))
  // CP0 only exists while BOOTSTRAP.md exists; its two json blocks are the args of step 8
  if (has('BOOTSTRAP.md')) await chk('BOOTSTRAP.md: the step 8 args are accepted by both workflows (files exist, owns disjoint, checkpoint 0 as text)', async () => {
    const [b, p] = [...fs.readFileSync('BOOTSTRAP.md', 'utf8').matchAll(/```json\r?\n([\s\S]*?)\r?\n```/g)].map(m => JSON.parse(m[1]))
    const xb = await wf('gauntlet-build.js', { ...b, models: F }, win), xp = await wf('gauntlet-ponytail.js', { ...p, models: F }, pony)
    const owns = b.pieces.flatMap(x => x.owns)
    return [...owns, ...p.units.flatMap(u => u.paths)].every(f => has(f)) && new Set(owns).size === owns.length && p.testCommand === 'node .claude/check.cjs'
      && [xb, xp].every(x => x.out.results.every(y => y.won) && x.calls[0].prompt.includes('"checkpoint":"0"') && !/"checkpoint":[^"]/.test(x.calls[0].prompt))
  })

  // Workflow API contract (skill workflow-authoring), proven over the simulations above: three lines per workflow
  const OPTS = ['label', 'phase', 'schema', 'model', 'effort', 'isolation', 'agentType']
  const RUN = { build: ['gauntlet-build.js', { ...base, pieces: [piece] }, build], ponytail: ['gauntlet-ponytail.js', uAll, pony] }
  for (const [tag, [file, args, impl]] of Object.entries(RUN)) {
    const raw = () => fs.readFileSync('.claude/workflows/' + file, 'utf8'), lit = () => raw().match(META)[1], meta = () => vm.runInNewContext('(' + lit() + ')')
    const used = new Set(seen[file].flatMap(x => x.phases)), calls = seen[file].flatMap(x => x.calls)
    await chk(`${tag}: the script starts with a pure literal meta (only strings, objects and lists), with name = file name, a non-empty single-line description and meta.phases = the phase() calls`, () => raw().startsWith('export const meta = ') && !/[^\s{}\[\],:]/.test(lit().replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\w+(?=\s*:)/g, '')) && meta().name === file.replace('.js', '') && /^[^\n]+$/.test(meta().description) && meta().phases.length === used.size && meta().phases.every(p => used.has(p.title) && p.detail))
    await chk(`${tag}: the meta text names the developer and critic model and effort from forge.json, the panel phase runs the aux model and no token is left unrendered (fill them with: node .claude/check.cjs --render)`, () => !raw().includes('{{') && matches(raw()))
    await chk(`${tag}: every agent() uses only API opts (label, phase from meta.phases with the model it declares, effort), and the schema has an object root and required inside properties; only the panel agent runs without a schema`, () => { const ph = meta().phases; return calls.length > 0 && calls.every(c => typeof c.prompt === 'string' && Object.keys(c.opts).every(k => OPTS.includes(k)) && typeof c.opts.label === 'string' && ph.some(p => p.title === c.opts.phase && (!p.model || p.model === c.opts.model)) && (!c.opts.effort || EFF.includes(c.opts.effort)) && (c.opts.schema ? c.opts.schema.type === 'object' && c.opts.schema.required.every(k => k in c.opts.schema.properties) : c.opts.label.startsWith('panel:'))) })
    await chk(`${tag}: resume: with Date.now, Math.random and new Date() throwing, the same args and answers repeat exactly the agent() calls (prompt and opts)`, async () => { const [a, b] = [await wf(file, args, impl), await wf(file, args, impl)]; return a.calls.length > 5 && JSON.stringify(a.calls) === JSON.stringify(b.calls) })
  }

  // --render round trip, in a copy of this project's .claude in a temp folder (the nested runs skip this block, or it would recurse)
  if (!process.env.FORGE_CHECK_NESTED) {
    const trip = f => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-render-'))
      try {
        fs.cpSync('.claude', path.join(tmp, '.claude'), { recursive: true, filter: s => path.basename(s) !== 'dashboard' })
        const run = (...a) => { const x = spawnSync(process.execPath, ['.claude/check.cjs', ...a], { cwd: tmp, encoding: 'utf8', env: { ...process.env, FORGE_CHECK_NESTED: '1' } }); return { code: x.status, text: x.stdout + x.stderr } }
        const wfText = () => fs.readdirSync(path.join(tmp, '.claude/workflows')).filter(n => n.endsWith('.js')).map(n => fs.readFileSync(path.join(tmp, '.claude/workflows', n), 'utf8'))
        return f({ run, wfText, tmp })
      } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
    }
    await chk('render: with forge.json unchanged, --render changes nothing and says so; after forge.json changes (developer probe-dev, xhigh), --render rewrites the model and effort in the workflow meta, the check is green in both configurations and a second --render changes nothing again', () => trip(({ run, wfText, tmp }) => {
      const [dev, same] = [{ model: 'probe-dev', effort: 'xhigh', label: 'Probe Dev 9.9', reason: 'probe' }, run('--render')]
      const first = run()
      fs.writeFileSync(path.join(tmp, '.claude/forge.json'), JSON.stringify({ ...FJ, mode: FJ.mode === 'rigorous' ? 'accelerated' : 'rigorous', models: { ...F, developer: dev, developerUi: { ...dev, label: 'Probe UI 9.9' }, tester: { ...dev, label: 'Probe Tester 9.9' } } })) // the other roles and the mode change too: the check stays green, and no meta text of them is written until a workflow shows them
      const [again, second, after, third] = [run('--render'), run(), wfText(), run('--render')]
      return same.code === 0 && /nothing to render/.test(same.text) && !/^rendered/m.test(same.text) && first.code === 0
        && again.code === 0 && /^rendered/m.test(again.text) && after.every(t => t.includes('Probe Dev 9.9 xhigh') && !t.includes(label(D) + ' ' + D.effort + ' builds') && !t.includes(label(D) + ' ' + D.effort + ' cuts'))
        && second.code === 0 && !/FAIL/.test(second.text) && third.code === 0 && /nothing to render/.test(third.text)
    }))
    await chk('render: a workflow whose meta is stale and that holds neither {{tokens}} nor its "forge render" record makes --render fail with a clear error and write nothing', () => trip(({ run, wfText, tmp }) => {
      const f = path.join(tmp, '.claude/workflows/gauntlet-build.js')
      fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/^\/\/ forge render:.*\r?\n/m, '').replace(label(D) + ' ' + D.effort, 'Old Dev 1.0 low'))
      fs.writeFileSync(path.join(tmp, '.claude/forge.json'), JSON.stringify({ ...FJ, models: { ...F, developer: { model: 'probe-dev', effort: 'xhigh', reason: 'probe' } } }))
      const before = wfText(), x = run('--render')
      return x.code === 1 && /gauntlet-build\.js/.test(x.text) && /forge render/.test(x.text) && wfText().join() === before.join()
    }))
  }

  console.log(bad ? '\nThere is a FAIL above.' : '\nAll ok.')
  process.exit(bad)
})()
