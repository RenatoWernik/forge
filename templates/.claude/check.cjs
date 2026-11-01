// Validates the framework. Usage, from the project root: node .claude/check.cjs [--env]   (exit code 1 if there is a FAIL)
//   default: .claude/forge.json + a simulation of both workflows (no model is called) + the manual/bootstrap examples that exist
//   --env:   also the machine and project setup (ai-memory, Spec-Kit, Graphify, git, hooks, skills); versions are forge's doctor job
// .claude/forge.json: { "language": "English", "langTag": "en", "mode": "rigorous", "models": { "developer": R, "developerUi": R, "critic": R, "tester": R, "aux": R }, "escalation": { <condition>: { "value", "description" } } }
//   with R = { model, effort, reason, label?, match? }
//   mode   = rigorous | accelerated
//   model  = alias or ID passed to agent() (sonnet, opus, ...); effort = low | medium | high | xhigh | max; reason = why this model and effort
//   label  = name shown on the panel (default: model); match = regex the model ID declared by an agent must satisfy (default: model)
//   escalation = sameCriterionFailures (integer, 2 or 3) and minutesWithoutProgress (integer, 1 or more), attacksRedOnDelivery and visualBelowReference (true or false), each with a description
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm'), { spawnSync } = require('node:child_process')
process.chdir(path.join(__dirname, '..'))
const H = os.homedir(), ENV = process.argv.includes('--env')
const sh = (exe, args, input) => spawnSync(exe, args, { input, encoding: 'utf8' })
const out = (...a) => { const r = sh(...a); return r.error ? '' : r.stdout + r.stderr }
const has = (...p) => fs.existsSync(path.join(...p))
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
    if (!(t === 'bool' ? typeof v.value === 'boolean' : Number.isInteger(v.value) && v.value >= (c === 'sameCriterionFailures' ? 2 : 1) && (c !== 'sameCriterionFailures' || v.value <= 3))) problems.push('escalation.' + c + '.value')
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
    // ai-memory: the binary where forge installs it, and a server that is proven to be this project's (its data dir), never just "something answers on the port"
    let aim = null // shortcut: any load error reads as missing; upgrade: tell a broken module from an absent one
    try { aim = require('./ai-memory.cjs') } catch (e) {}
    const L_CAP = 'ai-memory: .ai-memory.toml admits capture in this project', L_PAGE = 'ai-memory: page _rules/framework.md seeded'
    const L_AUTO = 'ai-memory: autostart', L_CP = 'ai-memory: one page checkpoints/cp-N.md per cp-N tag'
    if (!aim) for (const n of ['ai-memory: binary', "ai-memory: server answers and is this project's", L_CAP, L_PAGE, L_AUTO, L_CP]) await chk(n + ' (.claude/ai-memory.cjs missing)', () => false)
    else {
      const cfg = aim.readConfig('.'), { bin, version } = aim.resolveBin({ env: process.env, home: H, run: aim.run }), ready = !!(bin && cfg.serverUrl && cfg.dataDir)
      await chk(bin ? 'ai-memory: binary ' + bin + ' (' + version + ')' : 'ai-memory: binary not found (looked in: AI_MEMORY_BIN, PATH, %LOCALAPPDATA%/ai-memory/ai-memory.exe, ~/Applications/ai-memory/ai-memory, ~/.local/bin/ai-memory)', () => !!bin)
      let st
      try { st = !cfg.serverUrl || !cfg.dataDir ? { detail: '(not set up: .ai-memory.toml has no [forge] server_url and data_dir)' } : !bin ? { detail: '(no binary)' } : await aim.serverState({ serverUrl: cfg.serverUrl, dataDir: cfg.dataDir, bin, run: aim.run }) } catch (e) { st = { detail: '(error: ' + e.message + ')' } }
      await chk("ai-memory: server answers at " + (cfg.serverUrl || '(no server url)') + " and is this project's" + (st.state === 'on' ? '' : ' ' + st.detail), () => st.state === 'on')
      const base = ['--data-dir', cfg.dataDir]
      await chk(L_CAP, () => { if (!ready) return false; const r = aim.run(bin, [...base, 'hook', '--event', 'user-prompt-submit', '--agent', 'claude-code', '--server-url', cfg.serverUrl, '--check-capture'], { input: JSON.stringify({ cwd: process.cwd().replace(/\\/g, '/') }) }); return (r.stdout + r.stderr).includes('"admits_capture":true') })
      await chk('ai-memory: the 9 capture hooks and enabledMcpjsonServers in .claude/settings.local.json, the MCP server in .mcp.json, all three files in .gitignore (memoria.mjs --apply)', () => {
        const rd = f => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')), s = rd('.claude/settings.local.json'), g = fs.readFileSync('.gitignore', 'utf8'), fw = p => String(p).replace(/\\/g, '/').toLowerCase()
        const after = (a, k) => a[a.indexOf(k) + 1] // the hooks and the MCP server must point at the url and the data dir of the [forge] table, the bind of config.toml at its port
        const mine = ev => (s.hooks[ev] || []).flatMap(x => x.hooks || []).some(h => { const a = h.args || []; return a.includes('hook') && fw(after(a, '--data-dir')) === fw(cfg.dataDir) && after(a, '--server-url') === cfg.serverUrl })
        const mcp = (rd('.mcp.json').mcpServers || {})['ai-memory'], bind = fs.readFileSync(path.join(cfg.dataDir, 'config.toml'), 'utf8').split(/\r?\n/).filter(l => /^\s*bind\s*=/.test(l)).map(l => l.replace(/\s/g, ''))
        return !!cfg.dataDir && !!cfg.serverUrl && ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PreCompact', 'Stop', 'SessionEnd', 'SubagentStart', 'SubagentStop'].every(mine) && s.enabledMcpjsonServers.includes('ai-memory')
          && !!mcp && after(mcp.args || [], '--server-url') === cfg.serverUrl + '/mcp' && fw(after(mcp.args || [], '--data-dir')) === fw(cfg.dataDir)
          && bind.length === 1 && bind[0] === 'bind="' + new URL(cfg.serverUrl).host + '"' && ['.claude/settings.local.json', '.mcp.json', '.ai-memory.local.toml'].every(r => aim.isIgnored(g, r))
      })
      await chk(L_PAGE, () => ready && cfg.workspace && cfg.project && aim.run(bin, [...base, 'read-page', '--path', '_rules/framework.md', '--workspace', cfg.workspace, '--project', cfg.project], { env: { ...process.env, AI_MEMORY_SERVER_URL: cfg.serverUrl } }).code === 0)
      const au = aim.autostartState({ cfg, bin, platform: process.platform, env: process.env, home: H })
      await chk(L_AUTO + (au.detail ? ' ' + au.detail : ''), () => au.ok)
      // A5: every cp-N tag has its page checkpoints/cp-N.md in this project's memory (the tags are git's own, never the files of .git/refs/tags)
      const tags = (aim.run('git', ['tag', '--list', 'cp-*']).stdout || '').split(/\r?\n/).map(t => t.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
      const noPage = ready && cfg.workspace && cfg.project ? tags.filter(t => aim.run(bin, [...base, 'read-page', '--path', 'checkpoints/' + t + '.md', '--workspace', cfg.workspace, '--project', cfg.project], { env: { ...process.env, AI_MEMORY_SERVER_URL: cfg.serverUrl } }).code !== 0) : tags
      await chk(L_CP + (!tags.length ? ' (no cp-* tags)' : noPage.length ? ' (missing: ' + noPage.join(', ') + ')' : ''), () => !noPage.length)
    }
    await chk('Spec-Kit: .specify/ and the /speckit-* skills installed', () => has('.specify/memory/constitution.md') && ['constitution', 'specify', 'clarify', 'plan', 'tasks', 'analyze', 'converge'].every(n => has('.claude/skills/speckit-' + n, 'SKILL.md')))
    await chk('Matt Pocock: /setup done (docs/agents/ and an "## Agent skills" block in CLAUDE.md)', () => has('docs/agents/issue-tracker.md') && fs.readFileSync('CLAUDE.md', 'utf8').includes('## Agent skills'))
    await chk('Graphify: post-commit and post-checkout hooks installed', () => { const s = out('graphify', ['hook', 'status']); return s.includes('post-commit: installed') && s.includes('post-checkout: installed') })
    // freshness: the commit the graph was built at is the head of the seal graph.mjs writes after each graphify update (forge-fresh.json) or, without a seal, built_at_commit of graph.json (graphify leaves graph.json untouched when the code did not change); only an exact match with HEAD is fresh. This line never rebuilds the graph.
    let fresh = ''
    {
      const r = sh('git', ['rev-parse', '--verify', '-q', 'HEAD']), head = r.status === 0 ? r.stdout.trim() : ''
      let built, readable = true
      let seal = ''
      try { const s = JSON.parse(fs.readFileSync(path.join('graphify-out', 'forge-fresh.json'), 'utf8').replace(/^\uFEFF/, '')); if (s && typeof s.head === 'string') seal = s.head } catch (e) {} // a missing or unreadable seal falls back to built_at_commit
      if (!has('graphify-out', 'graph.json')) fresh = '(missing: run node .claude/graph.mjs update)'
      else {
        try { const g = JSON.parse(fs.readFileSync(path.join('graphify-out', 'graph.json'), 'utf8').replace(/^﻿/, '')); if (!g || typeof g !== 'object' || Array.isArray(g)) throw new Error('not an object'); built = typeof g.built_at_commit === 'string' ? g.built_at_commit : '' } catch (e) { readable = false }
        const at = seal || built
        fresh = !readable ? '(unreadable)' : !head ? '(no commit yet)' : at === head ? '' : '(stale: built at ' + (at || 'no commit') + ', HEAD is ' + head + '; run node .claude/graph.mjs update)'
      }
      await chk('Graphify: graph.json built at HEAD' + (fresh ? ' ' + fresh : ''), () => !fresh || fresh === '(no commit yet)')
    }
    await chk('git: repository and .gitignore with .gauntlet/ and graphify-out/', () => { const g = fs.readFileSync('.gitignore', 'utf8').split(/\r?\n/); return has('.git') && g.includes('.gauntlet/') && g.includes('graphify-out/') })
    // protection hooks: "installed" means an entry of the script is in the project's .claude/settings.json (not only in the answers); the script file must be there too
    const HOOKS = { killByName: 'forge-matar-por-nome.mjs', backgroundTests: 'forge-testes-em-primeiro-plano.mjs', idleWatch: 'forge-vigia-de-agentes.mjs' }
    let wired = ''
    try { wired = JSON.stringify(JSON.parse(fs.readFileSync('.claude/settings.json', 'utf8').replace(/^﻿/, '')).hooks || {}).replace(/\\\\/g, '/') } catch (e) {}
    const hooksOn = Object.keys(HOOKS).filter(k => wired.includes('.claude/hooks/' + HOOKS[k]))
    await chk('hooks installed in .claude/settings.json: ' + (hooksOn.join(', ') || 'none') + ' (each script must exist in .claude/hooks/)', () => hooksOn.every(k => has('.claude/hooks', HOOKS[k])))
    // checkpoints (FRAMEWORK.md section 12): every agent of painel.json on an open ticket saved its checkpoint less than 10 min ago, and the orchestrator has its own; the clock is FORGE_VIGIA_NOW_MS, as in .claude/retoma.mjs
    let ck = { ok: false, note: ' (.claude/retoma.mjs missing)' }
    try {
      const inj = Number(process.env.FORGE_VIGIA_NOW_MS), r = (await import(require('node:url').pathToFileURL(path.resolve('.claude/retoma.mjs')).href)).ativos(process.cwd(), inj > 0 ? inj : Date.now())
      if (r.erro) ck = { ok: false, note: ' (painel.json: ' + r.erro + ')' }
      else {
        const stale = r.ativos.filter(a => a.vida !== 'ativo'), noOrch = r.ativos.length > 0 && !has('.checkpoints/orchestrator.md')
        const why = [stale.length ? 'stale: ' + stale.map(a => a.nome + (a.minutos === null ? ' no checkpoint' : ' ' + a.minutos + ' min')).join(', ') : '', noOrch ? '.checkpoints/orchestrator.md missing' : ''].filter(Boolean)
        ck = { ok: !why.length, note: why.length ? ' (' + why.join('; ') + ')' : r.ativos.length ? '' : ' (no active agents)' }
      }
    } catch (e) {}
    await chk('checkpoints: every active agent of painel.json saved its checkpoint less than 10 min ago' + ck.note, () => ck.ok)
    await chk('global skills (ponytail*, graphify, tdd) and the mattpocock-skills plugin', () => ['ponytail', 'ponytail-review', 'ponytail-audit', 'ponytail-debt', 'graphify', 'tdd'].every(s => has(H, '.claude/skills', s, 'SKILL.md')) && Object.keys(JSON.parse(fs.readFileSync(path.join(H, '.claude/plugins/installed_plugins.json'), 'utf8')).plugins).some(k => k.startsWith('mattpocock-skills@')))
    const cst = has('.specify/memory/constitution.md') ? fs.readFileSync('.specify/memory/constitution.md', 'utf8') : ''
    console.log('info  constitution: ' + (!cst ? 'missing' : cst.includes('[PROJECT_NAME]') ? 'still the template (run /speckit-constitution)' : 'filled in'))
    console.log('info  cp-* tags: ' + (out('git', ['tag', '--list', 'cp-*']).trim().split(/\s+/).join(' ') || 'none'))
    console.log('info  CP0: ' + (has('BOOTSTRAP.md') ? 'open (follow BOOTSTRAP.md)' : 'closed'))
  }
  const DOCS = ['CLAUDE.md', 'AGENTS.md', 'FRAMEWORK.md', 'BOOTSTRAP.md']
  const BRIEFS = ['dev', 'critic', 'round-minus-1', 'batch'] // .claude/briefs/<name>.md, one per role
  const PROSE = [...DOCS, ...BRIEFS.map(b => '.claude/briefs/' + b + '.md'), '.checkpoints/README.md'] // the files whose language and style are checked
  if (FJ.plainStyle) await chk('style: no dash, arrow or emoji in CLAUDE.md, AGENTS.md, FRAMEWORK.md and BOOTSTRAP.md (when they exist) (also the briefs and .checkpoints/README.md)', () => PROSE.filter(f => has(f)).every(f => !/[\u2013\u2014\u2192\u2600-\u27BF\u{1F300}-\u{1FAFF}]/u.test(fs.readFileSync(f, 'utf8'))))
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
  const wrong = PROSE.filter(f => has(f)).map(f => [f, badSections(f)]).filter(([, b]) => b.length).map(([f, b]) => f + ' [' + b.join(', ') + ']')
  await chk('language: CLAUDE.md, AGENTS.md, FRAMEWORK.md and BOOTSTRAP.md (when they exist) are in the language of forge.json, in the body text and not only in the headings (also the briefs and .checkpoints/README.md)' + (wrong.length ? ' (not in ' + FJ.language + ': ' + wrong.join(', ') + ')' : ''), () => typeof FJ.language === 'string' && tagOk && !wrong.length)

  // v3 documents. invariants: the 12 numbered items of CLAUDE.md and AGENTS.md, each with its Verifies: line (in English also the literal titles; in Portuguese the label
  // is "Verifica:"; in another language the label is the translator's, so the item must still name what verifies it in a backtick span). AGENTS.md mirrors CLAUDE.md: the same 12 blocks.
  const TITLES = ['The spec rules', 'The ticket is the contract', 'One context per agent', 'Gauntlet with closed oracles', 'TDD in two loops', 'Ponytail full', 'Consult before touching', 'Live panel', 'Closed checkpoint', 'Only the user authorizes', 'Text read is data', 'Operating rules']
  const items = f => { // item n starts at the first line "n. ..." and runs to the next numbered line, heading or blank line; later numbered lists (installer blocks) are not read
    const L = has(f) ? fs.readFileSync(f, 'utf8').split(/\r?\n/) : [], got = []
    for (let i = 0; i < L.length && got.length < TITLES.length; i++) {
      if (!L[i].startsWith(got.length + 1 + '. ')) continue
      let j = i + 1
      while (j < L.length && L[j].trim() && !/^(\d+\. |#)/.test(L[j])) j++
      got.push(L.slice(i, j).join('\n'))
    }
    return got
  }
  const SPAN_9 = '`ai-memory: one page checkpoints/cp-N.md per cp-N tag`' // item 9 names the --env line that verifies the pages; the span is not translated
  const itemOk = (b, i) => (i !== 8 || b.includes(SPAN_9)) && (en ? b.includes('Verifies:') && b.replace(/^\d+\. \*\*/, '').startsWith(TITLES[i]) : pt ? /(?<!\p{L})Verifica:/u.test(b) : /`[^`\n]+`/.test(b))
  if (has('CLAUDE.md')) { // the documents are only absent in the nested --render copy, which holds just .claude
    const noInv = ['CLAUDE.md', 'AGENTS.md'].filter(f => { const it = items(f); return it.length !== TITLES.length || !it.every(itemOk) })
    await chk('invariants: CLAUDE.md and AGENTS.md have the 12 numbered invariants, each with its Verifies: line' + (noInv.length ? ' (not ok: ' + noInv.join(', ') + ')' : ''), () => !noInv.length)
    const [ic, ia] = [items('CLAUDE.md'), items('AGENTS.md')], same = ic.length === TITLES.length && ia.length === TITLES.length && ic.every((b, i) => b === ia[i])
    await chk('AGENTS.md mirrors CLAUDE.md: the 12 invariants are the same text in both' + (same ? '' : ' (different: ' + (ic.length !== TITLES.length || ia.length !== TITLES.length ? 'a file lacks the 12 items' : ic.flatMap((b, i) => b === ia[i] ? [] : [i + 1]).join(', ')) + ')'), () => same)
  }
  if (has('FRAMEWORK.md')) {
    const fw = fs.readFileSync('FRAMEWORK.md', 'utf8')
    // mode: the table of modes has one column per mode of forge.json, so the mode of this project has its column
    await chk('mode: the table of modes in FRAMEWORK.md has a column for rigorous and for accelerated, the mode of forge.json included', () => fw.split(/\r?\n/).some(l => /^\s*\|/.test(l) && ['rigorous', 'accelerated'].every(m => new RegExp('\\b' + m + '\\b').test(l))))
  }
  // the contract of each piece is the GitHub issue: no generated document points to a contract file of the project (the contracts/ of Spec-Kit are API contracts),
  // and the three that carry the rules (CLAUDE.md, AGENTS.md, FRAMEWORK.md) read it with gh
  // a contract file is a file reference (in a code span or not) whose name is a contract's: contract(s), ticket(s), issue(s), <n> (or <id>, <number>), a number or an id such as T012, whatever its folder;
  // a folder called tickets/ or the code of a ticketing feature (src/tickets/api.ts) is not one
  const GH = '`gh issue view <n> --json body,comments`', FILES = /[\w.\/<>#-]+\.(?:md|txt|json|ya?ml)\b/gi
  const LOCAL = { test: t => (t.match(FILES) || []).some(f => /^(?:contracts?|tickets?|issues?|<(?:n|id|num|number|ticket|issue)>|\d+|[A-Z]\d{2,})$/i.test(f.split('/').pop().replace(/\.[^.]+$/, ''))) }
  const here = DOCS.filter(f => has(f)), text = f => fs.readFileSync(f, 'utf8')
  if (here.length) await chk('ticket contract: GitHub Issues (CLAUDE.md, AGENTS.md, FRAMEWORK.md and BOOTSTRAP.md read it with ' + GH + ', with no contract file in the project)', () => here.every(f => !LOCAL.test(text(f))) && here.filter(f => f !== 'BOOTSTRAP.md').every(f => text(f).includes(GH)))

  // briefs: the 4 role briefs of .claude/briefs/. Each has what every brief has (the hook warning in its first 5 lines, the operating rules, the contract in the issue, the rule of the real sessions)
  // and the clauses of its role. A rule is [what the FAIL line says, literals that survive a translation (code spans), English prose patterns, true when only the first 5 lines are read]: in English both are read, in another language
  // only the literals, because the prose is the translator's. The FAIL line names the brief and the rule that is missing.
  // ponytail: the prose of another language is not read, upgrade: add the patterns of a language here when a translation of the briefs is checked by words
  const BRIEF_ALL = [
    ['hook warning in the first 5 lines', ['CONTEXT WARNING', 'CONTEXT CRITICAL'], [/orchestrator/i, /\b(never|not|no)\b[^\n]{0,80}\b(stop|halt|pause)/i], true],
    ['kill by PID rule (never by name)', ['taskkill /IM', 'killall', 'pkill'], [/\bPID\b/]],
    ['foreground tests rule (never in the background)', ['run_in_background'], [/foreground/i, /\b9\s*min(utes)?\b|\b540\s*s\b/i]],
    ['checkpoint rule (after each step)', ['.checkpoints/'], [/after (each|every)\s+(step|stage)/i]],
    ['contract rule (the issue, read with gh issue view)', ['gh issue view <n> --json body,comments'], [/\bbody\b/i, /orchestrator'?s?\b[^.\n]{0,30}\bcomments|comments\b[^.\n]{0,30}\borchestrator/i, /critics?'?s?\b[^.\n]{0,20}\bcomments\b[^.\n]{0,60}\bcontext/i, /\bQUESTION\b/, /\bcomment/i]],
    ['real sessions rule', ['claude -p', 'claude plugin validate', 'DISABLE_AUTOUPDATER=1'], [
      /subagents?\b[^.\n]{0,80}\borchestrator|orchestrator\b[^.\n]{0,80}\bsubagents?/i, /(new|another|separate|second)\s+(`?claude`?\s+)?(window|session)/i, /fake\b[^.\n]{0,15}(`?claude`?|runtime)/i,
      /object of (a |the )?test|test object|under test/i, /final (verification|check)/i, /once (per|a|for each|for every) (ticket|piece)/i,
      /\b(critics?)\b[^.\n]{0,30}\b(or|and)\b[^.\n]{0,15}\btesters?\b|\btesters?\b[^.\n]{0,15}\b(or|and)\b[^.\n]{0,30}\b(critics?)\b/i, /headless/i, /haiku/i,
      /\b(3|three)\b[^.\n]{0,30}\bcalls\b|(at most|no more than|max(imum)?|up to)\s+(3|three)\b/i, /bypass/i,
      /(never|do not|don't)\s+(kill|stop|interrupt|abort)\w*\b[^.\n]{0,40}\b(mid|middle|halfway|half-way|partway|before it (ends|finishes))|wait (for it )?(to|until it) (finish|end)/i,
      /(record|log|register|note|write)\w*\b[^.\n]{0,60}\bcheckpoint/i]],
  ]
  const BRIEF_ROLE = {
    dev: [
      ['fix by class with a test of the class', [], [/(fix|correct)\w*\b[^.\n]{0,60}\bby class|\bclass of inputs/i, /\btest\b[^.\n]{0,20}\bclass\b/i]],
      ['/ponytail-review with the Must fix and Should fix corrected before delivering', ['/ponytail-review'], [/Must fix/i, /Should fix/i, /before (you )?(deliver|hand)|before (the )?(delivery|handing)/i]],
      ['the Round -1 attacks green', [], [/Round [−-]1/i, /attacks?\b[^.\n]{0,80}\bgreen\b/i]],
      ['the contract wins over an attack', [], [/contract wins/i]],
      ['Round 0', [], [/\bRound 0\b/i]],
      ['answer each finding with fixed or contested, and the reason', ['contested'], [/\bfixed\b/i, /\breason\b/i]],
    ],
    critic: [
      ['materiality test with its 3 criteria', [], [/materiality/i, /always[- ]fails?|fails? always|always[- ]rejects?/i, /(goal|objective|purpose|intent)\b[^.\n]{0,20}\bcriteri(on|a)|criterion'?s (goal|objective|purpose)/i, /reproducib\w*/i, /oracle/i]],
      ['the list of what is MINOR', [], [/\bMINOR\b/, /cosmetic/i, /literal (reading|read)|read(ing)? literally/i, /ambigu/i, /\b(own|your)\b[^.\n]{0,10}\battacks?\b/i]],
      ['the verdict format', [], [/\bVERDICT\b/, /\bBLOCKING\b|\bBLOCKERS\b/, /\bMINOR\b/, /QUESTIONS (TO|FOR|ON|ABOUT) THE BAR|BAR QUESTIONS/, /\bFOLLOW-?UPS?\b/]],
      ['R1 exhaustive and short later rounds', [], [/\bR1\b|\bround 1\b|\bfirst round\b/i, /exhaustive/i, /(later|following|subsequent|next|other)\s+rounds\b[^.\n]{0,100}\b(short|only)\b/i]],
      ['PRE-EXISTING defects dated by git blame, and the seguimento label', ['PRE-EXISTING', 'seguimento'], [/git blame/i]],
    ],
    'round-minus-1': [
      ['exactly the oracle, without adding requirements', [], [/exactly\b[^.\n]{0,20}\boracles?/i, /(without|never|no|not)\s+add\w*\b[^.\n]{0,40}\b(requirements?|demands?)/i]],
      ['BAR GAPS', [], [/BAR GAPS|GAPS (IN|OF|ON) THE BAR/]],
      ['prove that the attacks fail on the base', [], [/\b(prove|show|confirm|demonstrate)\w*\b[^.\n]{0,80}\b(fails?|failing|red)\b/i, /\bbase\b|\bmain\b|before the code/i]],
      ['do not edit the product code', [], [/(do not|don't|never|not)\s+(edit|change|touch|modify|write)\w*\b[^.\n]{0,40}\b(product|production)\b[^.\n]{0,10}\bcode/i]],
    ],
    batch: [
      ['additive merge', [], [/additiv\w*/i, /\bmerg\w*/i]],
      ['the flaky rule', [], [/flaky/i, /isolated/i, /\bdiff\b/i]],
      ['a regression goes back to the piece that caused it', [], [/regressions?\b[^.\n]{0,120}\b(piece|ticket)\b[^.\n]{0,20}\b(that )?caused/i]],
      ['no push, PR or merge without the yes of the user', [], [/^(?=.*\bpush\b)(?=.*\bPRs?\b)(?=.*\bmerge\b)(?=.*\b(user|utilizador|usu[áa]rio)\b)(?=.*\b(never|no|not|without)\b).*$/im]],
    ],
  }
  const lacks = BRIEFS.flatMap(b => {
    const f = '.claude/briefs/' + b + '.md'
    if (!has(f)) return [b + '.md: the file is missing']
    const all = fs.readFileSync(f, 'utf8'), top = all.split(/\r?\n/).slice(0, 5).join('\n')
    const miss = [...BRIEF_ALL, ...BRIEF_ROLE[b]].filter(([, lits, res, onTop]) => { const s = onTop ? top : all; return !lits.every(l => s.includes(l)) || (en && !res.every(re => re.test(s))) }).map(r => r[0])
    return miss.length ? [b + '.md: ' + miss.join(', ')] : []
  })
  await chk('briefs (' + (lacks.length ? 'not ok: ' + lacks.join('; ') : 'the 4 role briefs of .claude/briefs/') + ')', () => !lacks.length)

  // workflows: simulation with a fake runtime (no model is called) of the invariants the manual promises and of the Workflow API contract.
  // The script runs in a vm context that only has the API hooks the workflows use (args, agent, parallel, phase, log; no Node, no files,
  // no clock); Date.now, Math.random and new Date() without an argument throw, and so does the 1001st agent(), as in the runtime.
  // If a workflow starts using another hook (pipeline, budget, workflow), the ReferenceError says to extend this runtime on purpose.
  // wf never throws: the script failure stays in run.err and every check that depends on it prints its own FAIL.
  const seen = {}, compiled = {} // compiled: each workflow is compiled once and run in a new context for every simulation (the file does not change while the check runs)
  const wf = async (file, args, impl) => {
    const run = { calls: [], logs: [], phases: [] }
    ;(seen[file] ||= []).push(run)
    try {
      const script = compiled[file] ||= new vm.Script('(async () => {' + fs.readFileSync('.claude/workflows/' + file, 'utf8').replace(/^export const meta\s*=/m, 'const meta =') + '\n})()')
      const agent = async (prompt, opts) => { if (run.calls.push({ prompt, opts }) > 1000) throw new Error('limit of 1000 agents'); return impl(prompt, opts) }
      const parallel = ts => Promise.all(ts.map(t => t().catch(() => null)))
      const ctx = vm.createContext({ args, agent, parallel, phase: t => run.phases.push(t), log: m => run.logs.push(m) })
      vm.runInContext('Date.now = Math.random = () => { throw new Error("forbidden in Workflow") }; Date = new Proxy(Date, { construct: (T, a) => a.length ? new T(...a) : Date.now() })', ctx)
      run.out = await script.runInContext(ctx)
    } catch (e) { run.err = e }
    return run
  }
  const rejects = async (file, args) => { let n = 0; const x = await wf(file, args, () => ++n); return n === 0 && /incomplete args/.test(x.err?.message) }
  const [D, C, X] = WFR.map(k => F[k]), T = F.tester
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Round -1 result of a piece as gauntlet-attacks returns it and gauntlet-build gets it in args.attacks: an attack that fails on the base and a guard that already passes
  const r0 = (id, over = {}) => ({ id, attacks: [{ id: id + '-a1', file: 'tests/critico/' + id + '-r0/a1.test.mjs', passesOnBase: false }, { id: id + '-g1', file: 'tests/critico/' + id + '-r0/g1.test.mjs', guard: true, passesOnBase: true }], failingOnBase: true, gaps: [], ...over })
  const base = { checkpoint: { n: 1, title: 'T' }, root: 'C:\\p', dashboardUrl: 'https://x', context: 'CTX-SPEC-PLAN-TASKS', models: F, language: FJ.language }
  base.attacks = [r0('p'), r0('q')] // the Round -1 results the build workflow needs for pieces p and q
  Object.assign(base, { mode: 'rigorous', escalation: { ...FJ.escalation, sameCriterionFailures: { ...FJ.escalation.sameCriterionFailures, value: 2 } } }) // the build workflow takes both from forge.json, like the models; the simulations below assume the shipped sameCriterionFailures 2 (a project may set 3, which the lines of the escalation pin down apart)
  const rn = o => +o.label.match(/:r(\d+)$/)[1]
  const flip = l => (l === 'A' ? 'B' : 'A')
  const only = (calls, re) => calls.filter(c => re.test(c.opts.label))
  const stuck = calls => calls.filter(c => c.prompt.includes('-stuck'))
  const veto = c => ['Do not consult memory', 'do not open FRAMEWORK.md or .claude/workflows/', 'unless the context above allows it', 'you edit no file'].every(t => c.prompt.includes(t)) // what invariant 3 forbids the critic
  const key = r => r.model + ',' + r.effort
  const ROLE = { build: key(D), pony: key(D), critic: key(C), 'pony-critic': key(C), attacks: key(C), batch: key(T), panel: key(X) } // invariant 3: model,effort of each role by label prefix, from forge.json
  const rolesOk = (calls, roles = ROLE) => calls.every(c => roles[c.opts.label.split(':')[0]] === c.opts.model + ',' + c.opts.effort)
  const ver = (calls, l) => only(calls, new RegExp('^panel:verdict:' + l + '$'))[0].prompt // what the workflow tells the panel to record at the end of a round (only it knows whether ours really won)
  const LOST = ['"verdict":"perdeu"', '"status":"building"', '"kind":"fail"'], WON = ['"verdict":"ganhou"', '"status":"won"', '"kind":"ok"'] // "ganhou"/"perdeu" are fixed panel values the dashboard reads
  const verdictOk = (p, n, gap, yes, no) => [...yes, `"rounds":${n},`].every(t => p.includes(t)) && !no.some(t => p.includes(t)) && p.split(`"gap":"${gap}"`).length === 3 // the gap goes twice: on the agent and on the piece
  const contract = { issue: 7, objective: 'OBJ-P', input: 'branch main, files src/a.js', criteria: [{ text: 'The export returns 3 rows', oracle: 'corpus', command: 'node --test src/a.test.js' }, { text: 'The header has 4 columns', command: 'node --test src/h.test.js' }], fails: 'a criterion that fails', outOfScope: 'the PDF export', env: 'Node 20', output: 'a draft PR' }
  const piece = { id: 'p', title: 'P', goal: 'META-P', bar: 'BAR-X', owns: ['src/a.js', 'src/only-owns.js'], tdd: true, ...contract } // only-owns.js reaches the agents through owns alone: the fake developer changes only src/a.js
  const MARKS = [piece.goal, piece.bar, base.context, base.root, 'src/only-owns.js'] // what the piece args hand to the developer and to the critic
  const dev = { summary: 'DEV-REASONING', filesChanged: ['src/a.js'], testCommand: 'TEST-DEV', redEvidence: 'RED-EV', greenEvidence: 'GREEN-EV', model: declared(D) }
  const item = (n, c = n, m = 2, cat = 'criterion') => ({ criterion: 'C' + c, materiality: m, category: cat, description: 'DESC-' + n, repro: 'BLOCK-' + n }) // one blocking failure of the critic's verdict (criterion C<c>, materiality m, repro BLOCK-<n>)
  // The verdict of the critic as the brief shapes it: the winner, blocking (empty when it approves), the other sections and one result per Round -1 attack (all green here).
  const critic = (p, o, at = 3, over = {}) => { const ours = /^A: .*src\/a\.js/m.test(p) ? 'A' : 'B', win = rn(o) >= at; return { winner: win ? ours : flip(ours), testsPass: true, blocking: win ? [] : [item(rn(o))], minor: [], barQuestions: [], followUp: [], visualBelowReference: false, attacks: JSON.parse(p.match(/as you measured it: (\[.*\])/)[1]).map(a => ({ id: a.id, passesOnDelivery: true })), biggestGap: 'GAP-' + rn(o), reasoning: 'CRITIC-REASONING-' + rn(o), model: declared(C), ...over } }
  const build = (p, o, at) => o.label.startsWith('build:') ? dev : o.label.startsWith('critic:') ? critic(p, o, at) : 'ok'
  const win = (p, o) => build(p, o, 1) // wins already in round 1
  // Invariant 4 for the ponytail workflow, which keeps its loop: no round cap; the critic only picks the current version in round 300 (1 seed + 3 agents per round = 901 of the 1000 agents) and the workflow must get there; a `round < N` in the while fails here.
  // ponytail: only catches caps below 300 rounds (the runtime allows at most 333); raise the 300 and the 901 (1 + 3 per round) if a larger cap ever matters.
  const noCap = async (file, args, impl) => { const x = await wf(file, args, (p, o) => impl(p, o, 300)); return x.out.results[0].won && x.out.results[0].rounds === 300 && x.calls.length === 901 }

  let r = await wf('gauntlet-build.js', { ...base, pieces: [piece] }, build)
  const seedB = r.calls[0]?.prompt
  const crit = only(r.calls, /^critic:/), devs = only(r.calls, /^build:/)
  const lose = (p, o) => { const x = build(p, o, 0); return o.label.startsWith('critic:') ? { ...x, winner: flip(x.winner) } : x } // the critic picks the other candidate in every round
  await chk('build: rounds are capped by the mode: a 3rd failed round of the rigorous mode returns contract and a 2nd failed round of the accelerated mode returns maxRounds, with no round beyond the cap and the measures in metrics', async () => {
    const [x, y] = await Promise.all(['rigorous', 'accelerated'].map(mode => wf('gauntlet-build.js', { ...base, mode, pieces: [piece] }, lose)))
    const [a, b] = [x.out.results[0], y.out.results[0]]
    return only(x.calls, /^build:/).length === 3 && only(x.calls, /^critic:/).length === 3 && a.stopped === 'contract' && !a.won && a.metrics.rounds === 3
      && only(y.calls, /^build:/).length === 2 && only(y.calls, /^critic:/).length === 2 && b.stopped.reason === 'maxRounds' && !b.won && b.metrics.rounds === 2
  })
  await chk('build: the results[] return has id, stopped, files, testCommand, models, the measures, followUps and the last round\'s lastVerdict', () => { const x = r.out.results[0]; return x.id === 'p' && x.won && x.rounds === 3 && !x.stopped && x.files.join() === 'src/a.js' && x.testCommand === 'TEST-DEV' && x.models.builder === declared(D) && x.models.critic === declared(C) && x.lastVerdict.biggestGap === 'GAP-3' && Array.isArray(x.followUps) && ['rounds', 'sameCriterionFailures', 'attacksRedOnDelivery', 'minutesWithoutProgress'].every(k => k in x.metrics) })
  await chk('panel: build: the verdict records perdeu/building/fail or ganhou/won/ok, plus the round and the gap (rounds 1 and 3 here)', () => verdictOk(ver(r.calls, 'p:r1'), 1, 'GAP-1', LOST, WON) && verdictOk(ver(r.calls, 'p:r3'), 3, 'GAP-3', WON, LOST))
  await chk('build: each round calls, in separate agent() calls and in this order, the developer, the critic and the panel', () => r.calls.length === 10 && r.calls.slice(0, 4).map(c => c.opts.label).join() === 'panel:seed,build:p:r1,critic:p:r1,panel:verdict:p:r1' && r.calls.slice(-3).map(c => c.opts.label).join() === 'build:p:r3,critic:p:r3,panel:verdict:p:r3')
  await chk('build: the gap and blocking failures of round N reach the developer of round N+1, and the round 1 developer gets nothing', () => devs.length === 3 && !devs[0].prompt.includes('GAP-') && !devs[0].prompt.includes('BLOCK-') && ['GAP-1', 'BLOCK-1'].every(t => devs[1].prompt.includes(t)) && !devs[1].prompt.includes('BLOCK-2') && devs[2].prompt.includes('BLOCK-2'))
  await chk('build: the critic gets neither the developer\'s reasoning (summary) nor the reasoning and gap of earlier rounds', () => crit.length === 3 && crit.every(c => !/REASONING|GAP-/.test(c.prompt)))
  await chk('build: from round 2 the critic gets the failures that the critic of the previous round listed (criterion, materiality, repro), and the round 1 critic gets none', () => crit.length === 3 && !crit[0].prompt.includes('BLOCK-') && crit[1].prompt.includes('BLOCK-1') && /\bC1\b/.test(crit[1].prompt) && crit[2].prompt.includes('BLOCK-2') && !crit[2].prompt.includes('BLOCK-1'))
  await chk('build: the critic gets what the developer declared (test command, red and green)', () => crit.length > 0 && crit.every(c => ['TEST-DEV', 'RED-EV', 'GREEN-EV'].every(t => c.prompt.includes(t))))
  await chk('build: the critic is told not to consult memory, not to open FRAMEWORK.md or .claude/workflows/ (unless the context allows it) and not to edit files; the developer, to use memory_query and graphify', () => crit.length > 0 && crit.every(veto) && devs.length > 0 && devs.every(d => ['memory_query', 'graphify query', 'graphify affected'].every(t => d.prompt.includes(t))))
  await chk('build: roles use the models and effort from forge.json (developer, critic, aux); no other model', () => devs.length > 0 && crit.length > 0 && rolesOk(r.calls))
  await chk('build: the critic gets the goal, bar, context, root and owns of the piece; the prompt does not say which candidate is ours and the label alternates', () => crit.every(c => MARKS.every(t => c.prompt.includes(t)) && !/\bours\b|Project code:|Reference:/i.test(c.prompt)) && new Set(crit.map(c => /^A: .*src\/a\.js/m.test(c.prompt))).size === 2)
  await chk('build: the developer gets the goal, bar, context, root and owns of the piece', () => devs.length > 0 && devs.every(d => MARKS.every(t => d.prompt.includes(t))))
  // The delivery names its commit (head, diffHash) and answers each finding; the verdict names the commit it judged (sha) and the PRE-EXISTING defects. head/diffHash/sha are valid hex of the right length.
  const HEAD = n => 'c'.repeat(39) + n, HASH = n => 'd'.repeat(63) + n, none = () => ({})
  const rich = (p, o, at, cx = none, dx = none) => o.label.startsWith('build:') ? { ...dev, head: HEAD(rn(o)), diffHash: HASH(rn(o)), responses: [], ...dx(rn(o)) } : o.label.startsWith('critic:') ? critic(p, o, at, { sha: HEAD(rn(o)), preExisting: [], ...cx(rn(o)) }) : 'ok'
  const go = (impl, over = {}) => wf('gauntlet-build.js', { ...base, ...over, pieces: [piece] }, impl)
  await chk('build: the PRE-EXISTING items and the followUp lines of the verdict of each round reach followUps (kind pre-existing and follow-up, with the round) in both modes, and a PRE-EXISTING item never blocks or counts as a failed criterion', async () => {
    const pe = n => ({ preExisting: [{ description: 'PRE-' + n, blame: HEAD(n) + ' src/a.js:' + n }, { description: 'PRE-' + n + 'b', blame: HEAD(n) + ' src/b.js:' + n }], followUp: ['FU-' + n] })
    const rs = await Promise.all(['rigorous', 'accelerated'].map(mode => go((p, o) => rich(p, o, 2, pe), { mode })))
    const one = await go((p, o) => rich(p, o, 1, pe))
    const has = (f, k, n, d) => f.some(i => i.kind === k && i.round === n && i.description === d)
    return rs.every(x => { const y = x.out.results[0], f = y.followUps; return y.won && y.rounds === 2 && y.metrics.sameCriterionFailures === 1 && [1, 2].every(n => has(f, 'pre-existing', n, 'PRE-' + n) && has(f, 'pre-existing', n, 'PRE-' + n + 'b') && has(f, 'follow-up', n, 'FU-' + n)) && f.find(i => i.description === 'PRE-1').blame === HEAD(1) + ' src/a.js:1' })
      && one.out.results[0].won && one.out.results[0].rounds === 1 && one.out.results[0].followUps.length === 3
  })
  await chk('build: the verdict is tied to the commit: a sha other than the delivered head never wins and log() says so, the critic is told the head of its round and to read the sha with git rev-parse HEAD, the result has head and sha, and the schemas require head, diffHash and sha', async () => {
    const bad = 'e'.repeat(40), x = await go((p, o) => rich(p, o, 1, () => ({ sha: bad }))), y = await go((p, o) => rich(p, o, 1))
    const c = only(y.calls, /^critic:/)[0], d = only(y.calls, /^build:/)[0], z = y.out.results[0]
    const req = (s, k, re) => s.required.includes(k) && s.properties[k].type === 'string' && s.properties[k].pattern === re
    return !x.out.results[0].won && x.logs.includes(`WARNING p r1: the verdict is for ${bad} but the delivery is ${HEAD(1)}`) && z.won && z.head === HEAD(1) && z.sha === HEAD(1)
      && c.prompt.includes(HEAD(1)) && c.prompt.includes('git rev-parse HEAD') && req(d.opts.schema, 'head', '^[0-9a-f]{40}$') && req(d.opts.schema, 'diffHash', '^[0-9a-f]{64}$') && req(c.opts.schema, 'sha', '^[0-9a-f]{40}$')
  })
  await chk('build: a diffHash equal to the one of the previous round does not call the critic: the round counts as failed with the previous verdict (the criterion fails again) and log() says so; an absent or invalid diffHash never skips the critic', async () => {
    const same = () => ({ diffHash: HASH(1) }), x = await go((p, o) => rich(p, o, 9, none, same)), r1 = x.out.results[0]
    const bad = await Promise.all([() => ({ diffHash: 'x' }), () => ({ diffHash: 'D'.repeat(64) }), () => ({ diffHash: undefined })].map(f => go((p, o) => rich(p, o, 3, none, f))))
    return only(x.calls, /^critic:/).length === 1 && only(x.calls, /^build:/).length === 2 && r1.rounds === 2 && !r1.won && r1.stopped === 'redesign' && r1.criterion === 'C1' && r1.metrics.sameCriterionFailures === 2
      && x.logs.includes('p r2: diff unchanged since r1, critic not rerun') && only(x.calls, /^panel:verdict:p:r2$/).length === 1
      && bad.every(y => only(y.calls, /^critic:/).length === 3 && y.out.results[0].won)
  })
  await chk('build: each blocking failure gets the id F<round>-<n> that the developer of the next round sees (the one of round 1 sees none), a contested answer reaches results[].contested with the round of the finding, the critic never gets the answer or its reason, and a missing answer gives a WARNING', async () => {
    const two = n => n === 1 ? { blocking: [item(11, 1), item(12, 3)] } : {}, ans = n => n === 2 ? { responses: [{ finding: 'F1-1', answer: 'contested', reason: 'REASON-CONTESTED-1' }] } : {}
    const x = await go((p, o) => rich(p, o, 2, two, ans)), ds = only(x.calls, /^build:/), cs = only(x.calls, /^critic:/), [c] = x.out.results[0].contested
    return ds.length === 2 && !/\bF\d+-\d+\b/.test(ds[0].prompt) && ['F1-1', 'F1-2', 'BLOCK-11', 'BLOCK-12'].every(t => ds[1].prompt.includes(t)) && x.out.results[0].contested.length === 1
      && c.finding === 'F1-1' && c.round === 1 && c.reason === 'REASON-CONTESTED-1' && c.criterion === 'C1' && cs.length === 2 && cs.every(k => !k.prompt.includes('REASON-CONTESTED-1'))
      && x.logs.includes('WARNING p r2: no answer to F1-2') && !x.logs.some(l => l.includes('no answer to F1-1'))
  })
  r = await wf('gauntlet-build.js', { ...base, pieces: [piece] }, (p, o) => o.label === 'critic:p:r2' ? null : build(p, o))
  await chk('build: an agent without an answer ends the piece (stopped) instead of spinning, and log() says which round', () => !r.out.results[0].won && r.out.results[0].stopped && r.out.results[0].rounds === 2 && r.logs.some(l => l.startsWith('p r2:') && l.includes('without an answer')))
  r = await wf('gauntlet-build.js', { ...base, pieces: [piece] }, (p, o) => o.label === 'build:p:r1' ? null : build(p, o))
  await chk('build: a developer without an answer ends the piece (stopped) without calling the critic, and log() says so', () => !r.out.results[0].won && r.out.results[0].stopped && r.out.results[0].rounds === 1 && only(r.calls, /^critic:/).length === 0 && r.logs.some(l => l.startsWith('p r1:') && l.includes('without an answer')))
  r = await wf('gauntlet-build.js', { ...base, pieces: [piece] }, (p, o) => { const x = win(p, o); return typeof x === 'object' ? { ...x, model: 'zz-not-configured-zz' } : x })
  await chk('build: a declared model outside the request gives a WARNING and shows in models', () => r.logs.filter(l => l.startsWith('WARNING')).length === 2 && r.out.results[0].models.builder === 'zz-not-configured-zz' && r.out.results[0].models.critic === 'zz-not-configured-zz')
  const fault = f => (p, o) => { const x = win(p, o); return o.label === 'critic:p:r1' ? { ...x, ...(typeof f === 'function' ? f(x) : f) } : x } // a verdict that would win, with one fault in round 1 (fields to swap, or a function of the verdict)
  await chk('build: winning needs everything together: ours chosen, testsPass and no blocking failure; with one missing the loop goes on to the next round', async () => (await Promise.all([{ testsPass: false }, { blocking: [item(1)] }, x => ({ winner: flip(x.winner) })].map(f => wf('gauntlet-build.js', { ...base, pieces: [piece] }, fault(f))))).every(x => x.out.results[0].won && x.out.results[0].rounds === 2))
  // build v2 (F-08, process v3 sections 1, 4 and 8): REDESIGN, CONTRACT, followUps, always-fails and ESCALATION, each with its closed oracle. mode and escalation come from forge.json
  // through args, like the models; the signals come from the orchestrator (args.vida, piece.redesigns) and from the critic's verdict, never from the developer.
  const scene = (plans, dv = {}) => (p, o) => { // plans[n - 1] = what the critic of round n adds to an approving verdict ({ lost: true } makes it pick the other candidate); no plan, no failure
    if (!o.label.startsWith('critic:')) return o.label.startsWith('build:') ? { ...dev, ...dv } : 'ok'
    const x = critic(p, o, 0), { lost, ...v } = plans[rn(o) - 1] || {}
    return { ...x, ...v, ...(lost ? { winner: flip(x.winner) } : {}) }
  }
  const v2 = async (over, plans, dv) => { const x = await wf('gauntlet-build.js', { ...base, pieces: [piece], ...over }, scene(plans, dv)); return { x, r: x.out.results[0], devs: only(x.calls, /^build:/).length } }
  const fl = (...bs) => ({ blocking: bs.map(b => item(...b)) }) // fl([n, c, m, category]): failures of criterion C<c>
  const pcen = (...ks) => ({ ...piece, criteria: piece.criteria.map((c, i) => ({ ...c, ...(ks.includes(i + 1) ? { central: true } : {}) })) }) // marks criteria C<k> as central
  await chk('build: the same criterion failed in two rounds returns redesign with the criterion and the measures (rounds 2, sameCriterionFailures 2), in both modes, with no round 3 and with sameCriterionFailures 2 in args.escalation', async () => (await Promise.all(['rigorous', 'accelerated'].map(async mode => {
    const { r, devs } = await v2({ mode, pieces: [pcen(1)] }, [fl([1, 1]), fl([2, 1])])
    return devs === 2 && r.stopped === 'redesign' && r.criterion === 'C1' && !r.won && !r.condition && r.metrics.rounds === 2 && r.metrics.sameCriterionFailures === 2
  }))).every(Boolean))
  await chk('build: in the rigorous mode the 3rd failed round, of any kind (3 different criteria; tests failing, comparison lost and a regression), returns contract with the measures and no round 4 runs', async () => (await Promise.all([[fl([1, 1]), fl([2, 2]), fl([3, 3])], [{ testsPass: false }, { lost: true }, fl([4, 4, 1, 'regression'])]].map(async plans => {
    const { r, devs } = await v2({}, plans)
    return devs === 3 && r.stopped === 'contract' && !r.won && r.metrics.rounds === 3 && r.metrics.sameCriterionFailures <= 1
  }))).every(Boolean))
  // The literal table of the accelerated mode: [kind of failure, round, does it fail the piece?]. The failure is always on C1; round 1 failing leads to a clean round 2.
  const KINDS = { always: [[], [7, 1, 1, 'secret']], central: [[1], [7, 1, 2]], 'non-central, materiality 2': [[], [7, 1, 2]], 'non-central, materiality 3': [[], [7, 1, 3]] }
  const TABLE = [['always', 1, true], ['always', 2, true], ['central', 1, true], ['central', 2, true], ['non-central, materiality 2', 1, true], ['non-central, materiality 2', 2, false], ['non-central, materiality 3', 1, true], ['non-central, materiality 3', 2, false]]
  await chk('build: in the accelerated mode there is never a round 3, and in round 2 a failure that is neither an always-fail nor a central criterion goes to followUps and does not fail the piece (the table of 8 cases: kind of failure by round)', async () => (await Promise.all(TABLE.map(async ([kind, round, fails]) => {
    const [central, spec] = KINDS[kind]
    const { r, devs } = await v2({ mode: 'accelerated', pieces: [pcen(2, ...central)] }, round === 1 ? [fl(spec)] : [fl([1, 2, 2]), fl(spec)])
    return devs === 2 && (round === 1 ? r.won && !r.stopped : fails ? !r.won && r.stopped.reason === 'maxRounds' : r.won && !r.stopped && JSON.stringify(r.followUps).includes('BLOCK-7'))
  }))).every(Boolean))
  const CATS = ['secret', 'security', 'data-loss', 'false-alarm', 'regression', 'no-evidence']
  await chk('build: an always-fail fails the piece in any round and in any mode (6 categories by round 1 or 2 by mode: 24 cases, as materiality 1 on a criterion that is not central)', async () => (await Promise.all(CATS.flatMap(cat => [1, 2].flatMap(round => ['rigorous', 'accelerated'].map(async mode => {
    const { r, devs } = await v2({ mode, pieces: [pcen(2)] }, round === 1 ? [fl([7, 1, 1, cat])] : [fl([1, 2, 2]), fl([7, 1, 1, cat])])
    return round === 1 || mode === 'rigorous' ? devs === round + 1 && r.won && !r.stopped : devs === 2 && !r.won && r.stopped.reason === 'maxRounds'
  }))))).every(Boolean))
  const FE = FJ.escalation, escOf = o => Object.fromEntries(Object.entries(FE).map(([k, c]) => [k, { ...c, value: k in o ? o[k] : c.value }])) // forge.json with the values of o
  const ON = { sameCriterionFailures: 2, attacksRedOnDelivery: true, minutesWithoutProgress: 30, visualBelowReference: true }
  const RED = [{ id: 'p-a1', passesOnDelivery: false }, { id: 'p-g1', passesOnDelivery: true }]
  await chk('build: each condition of escalation returns escalate with its condition and the measures (4 cases), and the value in args.escalation turns it off (4 more)', async () => {
    const ok = async (cond, over, plans, devsWant, key, want) => { const { r, devs } = await v2({ escalation: escOf(ON), ...over }, plans); return r.stopped === 'escalate' && r.condition === cond && !r.won && devs === devsWant && r.metrics[key] === want }
    const quiet = async (over, plans, pieceWon) => { const { r } = await v2(over, plans); return pieceWon ? r.won && !r.stopped : r.stopped === 'redesign' }
    return (await Promise.all([
      ok('sameCriterionFailures', { pieces: [{ ...piece, redesigns: 1 }] }, [fl([1, 1]), fl([2, 1])], 2, 'sameCriterionFailures', 2),
      ok('attacksRedOnDelivery', {}, [{ attacks: RED }], 1, 'attacksRedOnDelivery', 1),
      ok('minutesWithoutProgress', { vida: { p: { minutos: 45, vida: 'parado?' } } }, [], 0, 'minutesWithoutProgress', 45),
      ok('visualBelowReference', {}, [{ visualBelowReference: true }], 1, 'rounds', 1),
      quiet({ escalation: escOf({ ...ON, attacksRedOnDelivery: false }) }, [{ attacks: RED }], true),
      quiet({ escalation: escOf({ ...ON, visualBelowReference: false }) }, [{ visualBelowReference: true }], true),
      quiet({ escalation: escOf({ ...ON, minutesWithoutProgress: 60 }), vida: { p: { minutos: 45, vida: 'parado?' } } }, [], true),
      quiet({ escalation: escOf(ON), pieces: [{ ...piece, redesigns: 0 }] }, [fl([1, 1]), fl([2, 1])], false),
    ])).every(Boolean)
  })
  await chk('build: the escalation signals never come from the developer: a developer that claims red attacks, 5000 minutes and a visual result below the reference escalates nothing', async () => { const { r, devs } = await v2({ escalation: escOf(ON) }, [], { attacksRedOnDelivery: 1, attacksRed: ['p-a1'], minutesWithoutProgress: 5000, visualBelowReference: true }); return r.won && devs === 1 && !r.stopped })
  await chk('build: an attack of the piece that the critic does not report with a boolean passesOnDelivery (no list, one missing, a text instead of a boolean) leaves the piece blocked with gaps, in both modes, and the piece never wins', async () => (await Promise.all(['rigorous', 'accelerated'].flatMap(mode => [[], [{ id: 'p-a1', passesOnDelivery: true }], [{ id: 'p-a1', passesOnDelivery: 'true' }, { id: 'p-g1', passesOnDelivery: true }]].map(async attacks => {
    const { r, devs } = await v2({ mode }, [{ attacks }])
    return !r.won && r.blocked?.reason === 'gaps' && r.blocked.gaps.length > 0 && devs === 1
  })))).every(Boolean))
  await chk('panel: build: the verdict is recorded after the escalation or the block is decided, and never says ganhou/won/ok for a piece that escalated or was blocked', async () => (await Promise.all([v2({ escalation: escOf(ON) }, [{ attacks: RED }]), v2({ escalation: escOf(ON) }, [{ visualBelowReference: true }]), v2({}, [{ attacks: [] }])])).every(({ x }) => verdictOk(ver(x.calls, 'p:r1'), 1, 'GAP-1', LOST, WON)))
  await chk('build: with sameCriterionFailures 3 (forge.json takes 2 or 3) the same criterion failed twice does not stop the piece, and the 3rd time returns contract in rigorous', async () => { const { r, devs } = await v2({ escalation: escOf({ sameCriterionFailures: 3 }) }, [fl([1, 1]), fl([2, 1]), fl([3, 1])]); return devs === 3 && r.stopped === 'contract' && r.metrics.sameCriterionFailures === 3 })
  await chk('build: in the rigorous mode the same criterion failed for the 3rd time returns contract, not redesign (2nd failure: redesign; 3rd: the contract is rewritten)', async () => { const { r, devs } = await v2({}, [fl([1, 1]), fl([2, 2]), fl([3, 1])]); return devs === 3 && r.stopped === 'contract' && !r.criterion && r.metrics.sameCriterionFailures === 2 })
  await chk('build: a mode other than rigorous or accelerated (or none), an escalation without its 4 conditions or with a wrong type, and a wrong ui, redesigns or central are refused with incomplete args naming the field, before any agent', async () => {
    const bads = [['mode', { mode: undefined }], ['mode', { mode: 'fast' }], ['escalation', { escalation: undefined }], ...Object.keys(FE).map(k => ['escalation.' + k, { escalation: { ...FE, [k]: undefined } }]), ['escalation.sameCriterionFailures', { escalation: { ...FE, sameCriterionFailures: { value: '2' } } }],
      ['ui', { pieces: [{ ...piece, ui: 'yes' }] }], ['redesigns', { pieces: [{ ...piece, redesigns: -1 }] }], ['central', { pieces: [{ ...piece, criteria: [{ ...piece.criteria[0], central: 1 }] }] }]]
    return (await Promise.all(bads.map(async ([f, patch]) => { let n = 0; const x = await wf('gauntlet-build.js', { ...base, pieces: [piece], ...patch }, () => ++n), m = x.err?.message || ''; return n === 0 && /incomplete args/.test(m) && m.includes(f) }))).every(Boolean)
  })
  await chk('build: a piece with ui:true runs its developer with models.developerUi and any other piece with models.developer', async () => {
    const x = await wf('gauntlet-build.js', { ...base, pieces: [{ ...piece, ui: true }, { ...piece, id: 'q', title: 'Q', owns: ['src/b.js'], issue: 8 }] }, win), d = id => only(x.calls, new RegExp('^build:' + id + ':')), U = F.developerUi
    return d('p').length > 0 && d('q').length > 0 && d('p').every(c => c.opts.model === U.model && c.opts.effort === U.effort) && d('q').every(c => c.opts.model === D.model && c.opts.effort === D.effort)
  })
  await chk('build: the prompts point the developer to .claude/briefs/dev.md and the critic to .claude/briefs/critic.md, both to the issue of the piece (#7), and the critic gets the Round -1 attacks to run on the delivery', () => has('.claude/briefs/dev.md') && has('.claude/briefs/critic.md') && devs.length > 0 && devs.every(d => d.prompt.includes('.claude/briefs/dev.md') && d.prompt.includes('#7')) && crit.every(c => c.prompt.includes('.claude/briefs/critic.md') && c.prompt.includes('#7') && c.prompt.includes('p-a1')))
  await chk('build: the verdict schema has the sections of the critic brief: blocking (criterion, materiality 1, 2 or 3, repro), minor, barQuestions and followUp', () => { const s = crit[0].opts.schema, b = s.properties.blocking; return s.required.includes('blocking') && b.type === 'array' && ['criterion', 'materiality', 'repro'].every(k => b.items.required.includes(k)) && b.items.properties.materiality.enum.join() === '1,2,3' && ['minor', 'barQuestions', 'followUp'].every(k => s.properties[k] && s.properties[k].type === 'array') })
  r = await wf('gauntlet-build.js', { ...base, pieces: [{ ...piece, tdd: false }] }, win)
  await chk('build: tdd:false swaps the red and green requirement for "no testable seam"; with tdd:true the developer gets the behavior-test rule', () => only(r.calls, /^build:/)[0].prompt.includes('no testable seam') && !only(r.calls, /^build:/)[0].prompt.includes('write ONE behavior test') && devs[0].prompt.includes('write ONE behavior test') && !devs[0].prompt.includes('no testable seam'))
  r = await wf('gauntlet-build.js', { ...base, parallel: true, pieces: [piece, { ...piece, id: 'q', title: 'Q', owns: ['src/b.js'] }] }, (p, o) => o.label.startsWith('build:q:') ? Promise.reject(new Error('agent failure')) : win(p, o))
  await chk('build: parallel:true runs the pieces together; the one that throws leaves the result and log() records it (ATTENTION), without taking the other down', () => r.calls[1].opts.label === 'build:p:r1' && r.calls[2].opts.label === 'build:q:r1' && r.out.results.length === 1 && r.out.results[0].id === 'p' && r.out.results[0].won && r.logs.some(l => l.startsWith('ATTENTION')))
  await chk('build: args without root, dashboardUrl or pieces, or a piece without id, title, goal, bar or owns, bring the workflow down with incomplete args, before spending an agent', async () => (await Promise.all([{ root: '' }, { dashboardUrl: '' }, { pieces: [] }, ...['id', 'title', 'goal', 'bar', 'owns'].map(k => ({ pieces: [{ ...piece, [k]: undefined }] }))].map(a => rejects('gauntlet-build.js', { ...base, pieces: [piece], ...a })))).every(Boolean))
  // args.models missing or wrong: the workflow stops with an error that names the role and points to forge.json, before spending an agent
  const badModels = [...WFR, 'tester'].flatMap(k => [{ ...F, [k]: undefined }, { ...F, [k]: { ...F[k], model: '' } }, { ...F, [k]: { ...F[k], effort: 'ultra' } }, { ...F, [k]: { ...F[k], effort: undefined } }, { ...F, [k]: { ...F[k], match: '(' } }].map(m => [k, m]))
  const rejectsModels = async (file, args, roles = WFR) => (await Promise.all([[null, undefined], [null, {}], ...badModels.filter(([k]) => roles.includes(k))].map(async ([k, m]) => { let n = 0; const x = await wf(file, { ...args, models: m }, () => ++n), msg = x.err?.message || ''; return n === 0 && /incomplete args/.test(msg) && msg.includes('.claude/forge.json') && (!k || msg.includes('(review: ' + k + ')')) }))).every(Boolean)
  await chk('build: args without models, or with a role missing model or a valid effort, or with a match that is not a valid regex, bring the workflow down with incomplete args naming the role and pointing to forge.json, before spending an agent', () => rejectsModels('gauntlet-build.js', { ...base, pieces: [piece] }))
  const big = 'x'.repeat(100000)
  r = await wf('gauntlet-build.js', { ...base, pieces: [piece] }, (p, o) => o.label === 'build:p:r1' ? { ...dev, redEvidence: big } : win(p, o))
  await chk('build: evidence over the limit reaches the critic cut, flagged there and recorded with log() (only the cut field)', () => { const c = only(r.calls, /^critic:/)[0].prompt; return !c.includes(big) && c.includes('[cut') && r.logs.some(l => l.includes('p r1 red') && l.includes('100000')) && !r.logs.some(l => l.includes('p r1 green')) })

  // Round -1 (process v3): the contract of each piece is validated before any agent() is spent, in gauntlet-build and in gauntlet-attacks;
  // gauntlet-attacks runs one critic per piece; gauntlet-build never launches the developer of a piece without a clean Round -1 (args.attacks).
  const attImpl = (over = {}) => (p, o) => { // the Round -1 critic answers from a table: attacks by piece, the failingOnBase it claims, gaps by piece
    if (!o.label.startsWith('attacks:')) return 'ok'
    const id = o.label.split(':')[1]
    return { attacks: (over.attacks || {})[id] || r0(id).attacks, failingOnBase: over.claim ?? true, gaps: (over.gaps || {})[id] || [], model: declared(C) }
  }
  const [A1, G1] = r0('p').attacks, q = { ...piece, id: 'q', title: 'Q', owns: ['src/b.js'], issue: 8 }
  const C0 = contract.criteria[0], many = n => Array.from({ length: n }, (_, i) => ({ text: 'Step ' + i + ' returns 3 rows', command: 'node --test t' + i }))
  const NAMED = [['issue', { issue: undefined }], ['issue', { issue: 0 }], ['issue', { issue: 'abc' }], ['criteria', { criteria: undefined }], ['criteria', { criteria: [] }], ['criteria', { criteria: many(7) }],
    ['criteria[0].command', { criteria: [{ ...C0, command: ' ' }] }], ['criteria[0].text', { criteria: [{ ...C0, text: '' }] }], ['criteria[0].oracle', { criteria: [{ ...C0, oracle: 'vibes' }] }],
    ...['objective', 'input', 'fails', 'outOfScope', 'env', 'output'].flatMap(k => [[k, { [k]: undefined }], [k, { [k]: '  ' }]])]
  const refuses = async (file, pieces, field, id) => { let n = 0; const x = await wf(file, { ...base, pieces }, () => ++n), m = x.err?.message || ''; return n === 0 && /invalid contract/.test(m) && new RegExp('(?<![\\w.-])' + esc(field) + '(?![\\w])').test(m) && (!id || m.includes('piece ' + id + ',')) }
  const accepts = async (file, p) => { const x = await wf(file, { ...base, pieces: [p] }, file === 'gauntlet-attacks.js' ? attImpl() : win); return !x.err && x.calls.length > 0 }
  for (const file of ['gauntlet-attacks.js', 'gauntlet-build.js']) {
    const tag = file.replace('gauntlet-', '').replace('.js', '')
    await chk(`${tag}: each invalid contract (issue, objective, input, fails, outOfScope, env, output, criteria, and per criterion text, command and oracle; more than 6 criteria) is refused before any agent(), and the error names the field (and the piece to split)`, async () => (await Promise.all(NAMED.map(([f, patch]) => refuses(file, [{ ...piece, ...patch }], f, 'p')))).every(Boolean) && await refuses(file, [piece, { ...q, issue: undefined }], 'issue', 'q') && await refuses(file, [{ ...q, ...NAMED[5][1] }, piece], 'criteria', 'q'))
    await chk(`${tag}: a criterion with an absolute word (never, always, any, all, every, nunca, sempre, qualquer, todos, todas, nenhum, nenhuma) and no oracle is refused, in English and in Portuguese; words that only contain them, and the same criterion with an oracle, are not`, async () => {
      const pos = ['The export never drops a row', 'Always redirect to HTTPS', 'Rejects any file over 10 MB', 'ALL rows are imported', 'Every request is signed', 'O relatório nunca perde uma linha', 'A página carrega sempre', 'Qualquer ficheiro', 'Todos os testes passam', 'Todas as páginas têm título', 'Nenhum segredo sai', 'Nenhuma fatura fica por emitir']
      const neg = ['Install the plugin in a temp folder', 'Many small files are merged', 'The company name is in the footer', 'Everyday usage stays small', 'Allocate 2 workers per batch', 'The alloy price has 2 decimals', 'Os métodos aceites são 2', 'Uma sempreviva decora o cabeçalho']
      const on = (text, oracle) => ({ ...piece, criteria: [{ text, command: 'node --test t', ...(oracle ? { oracle } : {}) }] })
      return (await Promise.all(pos.map(s => refuses(file, [on(s)], 'criteria[0].oracle')))).every(Boolean) && (await Promise.all([...neg.map(s => accepts(file, on(s))), ...pos.map(s => accepts(file, on(s, 'property')))])).every(Boolean)
    })
  }
  r = await wf('gauntlet-attacks.js', { ...base, pieces: [piece, q] }, attImpl({ gaps: { q: ['GAP-Q'] } }))
  const ac = only(r.calls, /^attacks:/)
  await chk('attacks: one critic per piece, with the model and effort of forge.json (critic, aux) and no developer; each prompt reads its own issue with gh issue view <n> --json body,comments and points to the Round -1 brief that the project has', () => ac.length === 2 && rolesOk(r.calls) && !only(r.calls, /^build:/).length && ac[0].prompt.includes('gh issue view 7 --json body,comments') && !ac[0].prompt.includes('issue view 8') && ac[1].prompt.includes('gh issue view 8 --json body,comments') && !ac[1].prompt.includes('issue view 7') && ac.every(c => c.prompt.includes('.claude/briefs/round-minus-1.md')) && has('.claude/briefs/round-minus-1.md'))
  await chk('attacks: the return has, per piece, id, attacks (id, file, guard and passesOnBase as the critic gave them), failingOnBase and gaps', () => { const [x, y] = r.out.results; return r.out.results.length === 2 && x.id === 'p' && JSON.stringify(x.attacks) === JSON.stringify(r0('p').attacks) && x.failingOnBase === true && x.gaps.length === 0 && y.id === 'q' && y.gaps.join() === 'GAP-Q' })
  const CALC = [[[A1, G1], true], [[{ ...A1, passesOnBase: true }, G1], false], [[A1, { ...A1, id: 'p-a2', passesOnBase: true }], false], [[A1, { ...G1, passesOnBase: false }], true], [[G1], false], [[], false], [[{ ...A1, passesOnBase: undefined }], false]]
  await chk('attacks: failingOnBase is computed (true only if some attack without guard exists and none of them passes on the base), whatever boolean the critic claims', async () => (await Promise.all(CALC.flatMap(([list, want]) => [true, false].map(async claim => (await wf('gauntlet-attacks.js', { ...base, pieces: [piece] }, attImpl({ attacks: { p: list }, claim }))).out.results[0].failingOnBase === want)))).every(Boolean))
  r = await wf('gauntlet-attacks.js', { ...base, pieces: [piece, q], parallel: true }, (p, o) => o.label === 'attacks:q' ? Promise.reject(new Error('agent failure')) : attImpl()(p, o))
  const rn0 = await wf('gauntlet-attacks.js', { ...base, pieces: [piece] }, (p, o) => o.label.startsWith('attacks:') ? null : 'ok')
  await chk('attacks: a critic without an answer leaves open gaps and log() says so; parallel:true runs the pieces together and a piece that throws leaves the result with ATTENTION in log()', () => rn0.out.results[0].gaps.length > 0 && rn0.out.results[0].failingOnBase === false && rn0.logs.some(l => l.startsWith('p:') && l.includes('no answer')) && r.out.results.length === 1 && r.out.results[0].id === 'p' && r.logs.some(l => l.startsWith('ATTENTION')))
  const gate = async res => { const x = await wf('gauntlet-build.js', { ...base, pieces: [piece, q], attacks: res }, win); return { won: id => !!x.out.results.find(y => y.id === id).won, why: id => x.out.results.find(y => y.id === id).blocked, devs: id => only(x.calls, new RegExp('^build:' + id + ':')).length } }
  const alreadyPasses = { ...A1, passesOnBase: true }, noState = { id: 'q-a1', file: 'tests/critico/q-r0/a1.test.mjs' }
  await chk('build: a piece without a clean Round -1 returns blocked and never reaches the developer: open gaps, no result, an attack that already passes on the base (failingOnBase:true claimed or not), an attack without passesOnBase, only guards; failing guards do not block', async () => {
    const [gaps, none, pass, state, guards, ok, off] = await Promise.all([gate([r0('p'), r0('q', { gaps: ['G'] })]), gate([r0('p')]), gate([r0('p'), { ...r0('q'), attacks: [{ ...A1, id: 'q-a1', passesOnBase: true }, { ...A1, id: 'q-a2' }] }]), gate([r0('p'), r0('q', { attacks: [noState, G1] })]), gate([r0('p'), r0('q', { attacks: [G1] })]), gate([r0('p'), r0('q', { attacks: [A1, { ...G1, passesOnBase: false }] })]), gate(undefined)])
    return [gaps, none, state, guards].every(g => g.why('q').reason === 'gaps' && g.devs('q') === 0 && g.won('p')) && pass.why('q').reason === 'failingOnBase' && pass.why('q').attacks.join() === 'q-a1' && pass.devs('q') === 0 && pass.won('p')
      && ok.won('p') && ok.won('q') && !ok.why('q') && [off.why('p'), off.why('q')].every(b => b.reason === 'gaps') && off.devs('p') + off.devs('q') === 0
  })
  const order = [], track = impl => (p, o) => { order.push(o.label); return impl(p, o) }
  const ra = await wf('gauntlet-attacks.js', { ...base, pieces: [piece, q] }, track(attImpl({ gaps: { q: ['GAP-Q'] } })))
  const rb = await wf('gauntlet-build.js', { ...base, pieces: [piece, q], attacks: ra.out.results }, track(win))
  await chk('checkpoint: the output of gauntlet-attacks goes as it is to gauntlet-build in args.attacks; the first developer of a piece comes after its Round -1 agent(), and a piece with open gaps never reaches the developer', () => order.indexOf('attacks:p') >= 0 && order.indexOf('build:p:r1') > order.indexOf('attacks:p') && order.indexOf('attacks:q') >= 0 && !order.some(l => l.startsWith('build:q:')) && rb.out.results.find(y => y.id === 'p').won && rb.out.results.find(y => y.id === 'q').blocked.reason === 'gaps')

  if (has('FRAMEWORK.md')) await chk('manual: the args example in FRAMEWORK.md (section 5, step 2) is accepted by gauntlet-build and by gauntlet-attacks', async () => {
    const ex = JSON.parse(fs.readFileSync('FRAMEWORK.md', 'utf8').match(/```json\r?\n([\s\S]*?)\r?\n```/)[1])
    const [x, y] = [await wf('gauntlet-build.js', { ...ex, models: F, mode: FJ.mode, escalation: FJ.escalation }, win), await wf('gauntlet-attacks.js', { ...ex, models: F }, attImpl())]
    return x.out.results[0].won && x.out.results[0].rounds === 1 && y.out.results.length === ex.pieces.length
  })

  // Batch (F-09): one tester declares data (runs, isolated, main) and the workflow works out the class of each failure from it, never from a label of the tester.
  // The fake tester declares from a table: f = { test, files, suite: [executions 1-2 where it fails], e2e: [executions 1-3], alone: passes alone, main: 'all' | 'some' | 'none' }
  const bpn = n => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, title: 'P' + i, owns: ['src/p' + i + '.js'] }))
  const bp = ['pa', 'pb', 'pc'].map(id => ({ id, title: id.toUpperCase(), owns: ['src/' + id + '.js', 'tests/' + id + '.test.js'] }))
  const bargs = (over = {}) => ({ ...base, mode: 'rigorous', pieces: bp, testCommand: 'SUITE-CMD', e2eCommand: 'E2E-CMD', ...over })
  const decl = (fs = [], n = { suite: 2, e2e: 3 }) => ({
    runs: ['suite', 'e2e'].flatMap(k => Array.from({ length: n[k] }, (_, i) => ({ kind: k, command: k === 'suite' ? 'SUITE-CMD' : 'E2E-CMD', failures: fs.filter(f => (f[k] || []).includes(i + 1)).map(f => ({ test: f.test, files: f.files, output: 'OUT<' + f.test + '>' })) }))),
    isolated: fs.map(f => ({ test: f.test, passed: !!f.alone, output: 'ISO' })),
    main: fs.filter(f => f.main).map(f => ({ test: f.test, results: [0, 1].map(i => f.main === 'none' ? true : f.main === 'all' ? false : i === 0), output: 'MAIN' })),
  })
  const LIE = { batch: { verdict: 'pass', failures: [] }, regressions: [], flaky: [], verdict: 'pass', passed: true, approved: true }
  const bt = (d, lie) => (p, o) => o.label === 'batch:tester' ? { ...d, ...(lie ? LIE : {}), model: declared(T) } : o.label === 'batch:flaky' ? { issues: JSON.parse(p.match(/Tests \(data\): (\[.*\])/)[1]).map(x => ({ test: x.test, issue: '#' + x.test })), model: declared(T) } : 'ok'
  const bwf = (d, over, lie) => wf('gauntlet-batch.js', bargs(over), bt(d, lie))
  const sum = x => !x.out ? 'refused' : x.out.batch.failures.map(f => f.test + '=' + f.class).sort().join() + '|' + x.out.regressions.map(g => g.piece + '/' + g.test).sort().join() + '|' + x.out.batch.verdict
  const core = ['tests/core.test.js', 'src/core.js'], ta = ['tests/pa.test.js', 'src/pa.js']
  // One batch declares many failing tests, each one a case of its own: the class and the regression of each test are read per test, and the verdict in the runs below it
  const FX = {
    ta: { test: 'ta', files: ['/proj/tests/pa.test.js', '/PROJ/src/pa.js'], suite: [1, 2] }, // a file written with the project path in front is the same file as in owns
    tc: { test: 'tc', files: ['src/pc.js'], e2e: [1, 2, 3] },
    both: { test: 'both', files: [...core, 'src/pa.js', 'src/pb.js'], suite: [1, 2] },
    alone: { test: 'alone', files: core, suite: [2], alone: true },
    notAlone: { test: 'notAlone', files: core, suite: [1] },
    touches: { test: 'touches', files: ta, suite: [1], alone: true },
    e2e: { test: 'e2e', files: core, e2e: [3], alone: true },
    mAll: { test: 'mAll', files: core, suite: [1, 2], main: 'all' },
    mSome: { test: 'mSome', files: core, suite: [1, 2], main: 'some' },
    mNone: { test: 'mNone', files: core, suite: [1, 2], main: 'none' },
    noMain: { test: 'noMain', files: core, suite: [1, 2] },
    eSome: { test: 'eSome', files: core, e2e: [1, 2, 3], alone: true, main: 'some' },
    eAll: { test: 'eAll', files: core, e2e: [1, 2, 3], alone: true, main: 'all' },
    eNone: { test: 'eNone', files: core, e2e: [1, 2, 3], alone: true, main: 'none' },
    eNoMain: { test: 'eNoMain', files: core, e2e: [1, 2, 3], alone: true },
    pb: { test: 'pb', files: ['src/pb.js'], suite: [1, 2] },
  }
  const ALL = 'alone=c,both=a,e2e=c,eAll=b,eNoMain=a,eNone=a,eSome=c,mAll=b,mNone=a,mSome=c,noMain=a,notAlone=a,pb=a,ta=a,tc=a,touches=a|pa/both,pa/ta,pa/touches,pb/both,pb/pb,pc/tc'
  const VERDICTS = [[[], '||pass'], [[FX.mAll, FX.eAll, FX.alone, FX.mSome], 'alone=c,eAll=b,mAll=b,mSome=c||pass'], [[FX.mAll, FX.pb], 'mAll=b,pb=a|pb/pb|fail'], [[FX.notAlone], 'notAlone=a||fail']]
  const NESTED = !!process.env.FORGE_CHECK_NESTED // the render round trip below runs this check again in temp folders: there the batch runs once, to fill seen for the contract lines, and the invariants above run only in the real check
  const bok = await bwf(decl()), bTest = only(bok.calls, /^batch:tester$/), bFlaky = await bwf(decl([FX.alone]))
  if (!NESTED) {
  const SIZES = [['rigorous', 3, true], ['rigorous', 4, false], ['rigorous', 5, false], ['rigorous', 6, false], ['accelerated', 3, true], ['accelerated', 4, true], ['accelerated', 5, true], ['accelerated', 6, false]]
  await chk('batch: a batch over the size of its mode (more than 3 pieces in rigorous, more than 5 in accelerated) is refused before any agent(), and the error says so; up to the limit the tester runs (3, 4, 5 and 6 pieces in both modes)', async () => (await Promise.all(SIZES.map(async ([mode, n, ok]) => { const x = await bwf(decl(), { mode, pieces: bpn(n) }); return ok ? !x.err && x.calls.length > 0 && !!x.out.batch : x.calls.length === 0 && /batch too large/.test(x.err?.message) && !x.out }))).every(Boolean))
  await chk('batch: args without root, dashboardUrl or testCommand, with no mode or a mode that is not rigorous or accelerated, with no pieces, a piece without id, title or owns, or two pieces with the same id, bring the workflow down with incomplete args, before spending an agent', async () => (await Promise.all([{ root: '' }, { dashboardUrl: '' }, { testCommand: '' }, { testCommand: ' ' }, { mode: undefined }, { mode: 'turbo' }, { pieces: [] }, ...['id', 'title', 'owns'].map(k => ({ pieces: [{ ...bp[0], [k]: undefined }] })), { pieces: [bp[0], bp[0]] }].map(a => rejects('gauntlet-batch.js', bargs(a))))).every(Boolean))
  await chk('batch: args without models, or with the tester or the aux missing a model or a valid effort, or with a match that is not a valid regex, bring the workflow down with incomplete args naming the role and pointing to forge.json, before spending an agent', () => rejectsModels('gauntlet-batch.js', bargs(), ['tester', 'aux']))
  const [s1, e2, none, no2e, mute] = await Promise.all([bwf(decl([], { suite: 1, e2e: 3 })), bwf(decl([], { suite: 2, e2e: 2 })), bwf(decl([], { suite: 0, e2e: 0 })), bwf(decl([], { suite: 2, e2e: 0 }), { e2eCommand: undefined }), wf('gauntlet-batch.js', bargs(), () => null)])
  await chk('batch: one tester with the model and effort of forge.json runs the suite 2x and the E2E 3x with the testCommand and the e2eCommand of the args, and no other agent gets them; the batch is approved only with those executions declared (suite 1x, E2E 2x, none or no answer: not approved, reason "runs"); without e2eCommand the E2E is n/a', () => bTest.length === 1 && rolesOk(bok.calls) && bok.out.batch.verdict === 'pass' && bok.out.runs.suite === 2 && bok.out.runs.e2e === 3 && bTest[0].prompt.includes('SUITE-CMD') && bTest[0].prompt.includes('E2E-CMD') && bok.calls.every(c => c === bTest[0] || !/SUITE-CMD|E2E-CMD/.test(c.prompt))
    && [s1, e2, none, mute].every(x => x.out.batch.verdict === 'fail' && x.out.batch.reason === 'runs') && no2e.out.batch.verdict === 'pass' && no2e.out.runs.e2e === 'n/a' && !/undefined|null/.test(only(no2e.calls, /^batch:tester$/)[0].prompt))
  await chk('batch: the class of each failing test comes only from the data declared: a (touches the files of a piece, or out of the diff with no proof that main fails the same), b (out of the diff and every execution on main fails too), c (flaky); only a fails the batch, one regression per piece the test touches; a tester that writes verdict, passed, class, flaky or regressions changes nothing; a file written with the project path in front is the same file as in owns', async () => (await Promise.all([false, true].map(async lie => sum(await bwf(decl(Object.values(FX)), { root: '/proj/' }, lie)) === ALL + '|fail'))).every(Boolean) && (await Promise.all(VERDICTS.flatMap(([fs, want], i) => (i === 1 ? [false, true] : [false]).map(async lie => sum(await bwf(decl(fs), {}, lie)) === want)))).every(Boolean))
  // a command split in blocks (each block an entry with the number of its pass): an execution is a pass that holds every block, and "failed in every execution" is measured over the passes of the block the test lives in
  const ent = (command, pass, failures = []) => ({ kind: 'suite', command, pass, failures }), ft = { test: 't', files: core, output: 'x' }
  const E3 = decl().runs.filter(r => r.kind === 'e2e'), blk = (suite, extra) => ({ runs: [...suite, ...E3], isolated: [], main: [], ...extra })
  const proof = { isolated: [{ test: 't', passed: true, output: '' }], main: [{ test: 't', results: [true, true], output: '' }] }
  const PF = ['tests/a.test.js', 'tests/b.test.js'], A = 'SUITE-CMD ' + PF[0], B = 'SUITE-CMD ' + PF[1] // the blocks are the testCommand followed by files that exist in args.projectFiles
  const [k1, kOnce, kShort, kAll, kSome] = await Promise.all([blk([ent(A, 1), ent(B, 1), ent(A, 2), ent(B, 2)]), blk([ent(A, 1), ent(B, 1)]), blk([ent(A, 1), ent(B, 1), ent(A, 2)]), blk([ent(A, 1, [ft]), ent(B, 1), ent(A, 2, [ft]), ent(B, 2)], proof), blk([ent(A, 1, [ft]), ent(B, 1), ent(A, 2), ent(B, 2)], proof)].map(d => bwf(d, { projectFiles: PF })))
  await chk('batch: a command split in blocks counts by pass: a full execution is a pass with every block (2 passes of 2 blocks approve; 1 pass, or a pass that lacks a block, gives not approved with reason "runs"), and a test that fails in every pass of its block, passes alone and never fails on main is class a, not flaky (class c only if it fails in some passes)', () => k1.out.batch.verdict === 'pass' && k1.out.runs.suite === 2 && [kOnce, kShort].every(x => x.out.batch.verdict === 'fail' && x.out.batch.reason === 'runs' && x.out.runs.suite === 1) && sum(kAll) === 't=a||fail' && sum(kSome) === 't=c||pass')
  const portD = decl([{ test: 'x', files: core, suite: [1], alone: true }, { test: 'y', files: core, suite: [2], alone: true }, { test: 'z', files: core, e2e: [1], alone: true }])
  portD.runs.forEach(r => r.failures.forEach(f => { f.output = 'Error: listen EADDRINUSE: address already in use :::' + (f.test === 'z' ? 4808 : 4807) }))
  const bPort = await bwf(portD)
  await chk('batch: the tester is told to look for fixed ports repeated between tests (EADDRINUSE), and two failing tests with EADDRINUSE on the same port come back in fixedPorts with the port (a port that only one test hits does not)', () => /EADDRINUSE/.test(only(bPort.calls, /^batch:tester$/)[0].prompt) && JSON.stringify(bPort.out.fixedPorts) === '[{"port":4807,"tests":["x","y"]}]')
  // pass numbers on every execution, as the schema asks: a kind with a single block is the whole command, so it must be the testCommand (suite) or the e2eCommand (E2E)
  const numbered = (swap = {}) => { const d = decl(); return { ...d, runs: ['suite', 'e2e'].flatMap(k => d.runs.filter(r => r.kind === k).map((r, i) => ({ ...r, pass: i + 1, command: swap[k] ?? r.command }))) } }
  await chk('batch: with pass numbers, an execution whose single block is not the testCommand (suite) or the e2eCommand (E2E) does not count: the batch fails with reason runs; with the right commands it passes', async () => (await Promise.all([[{}, 'pass'], [{ suite: 'echo ok' }, 'fail'], [{ suite: 'E2E-CMD' }, 'fail'], [{ suite: 'SUITE' }, 'fail'], [{ e2e: 'echo ok' }, 'fail']].map(async ([swap, want]) => { const x = await bwf(numbered(swap)); return x.out && x.out.batch.verdict === want && (want === 'pass' || x.out.batch.reason === 'runs') }))).every(Boolean))
  const bNoIssue = await wf('gauntlet-batch.js', bargs(), (p, o) => o.label === 'batch:flaky' ? { issues: [], model: declared(T) } : bt(decl([FX.alone]))(p, o))
  await chk('batch: a flaky failure (class c) is passed to a tester call that must open an issue with the label flaky for it, and the return has that issue; a batch without flaky failures makes no such call, and a flaky without an issue gets a WARNING in log() and does not fail the batch', () => only(bFlaky.calls, /^batch:flaky$/).length === 1 && only(bFlaky.calls, /^batch:flaky$/)[0].prompt.split('\n').some(l => /\bissues?\b/.test(l) && /\bflaky\b/.test(l)) && rolesOk(bFlaky.calls) && JSON.stringify(bFlaky.out.flaky.map(f => [f.test, f.issue])) === '[["alone","#alone"]]' && bFlaky.out.batch.verdict === 'pass'
    && !only(bok.calls, /^batch:flaky$/).length && bNoIssue.out.flaky[0].issue === null && bNoIssue.logs.some(l => l.startsWith('WARNING no issue')) && bNoIssue.out.batch.verdict === 'pass')
  // the line of the prompt that forbids push, PR and merge without the yes of the user, in every prompt of the tester (the three forms of removing it are in the corpus)
  const NO_MERGE = /^(?=.*\bpush\b)(?=.*\bPRs?\b)(?=.*\bmerge\b)(?=.*\b(user|utilizador|usu[áa]rio)\b)(?=.*\b(never|no|not|without|nunca|sem|nenhum)\b).*$/im
  await chk('batch: no merge: every prompt of the tester forbids, in one line, push, PR and merge without the yes of the user', () => bTest.length > 0 && [...bTest, ...only(bFlaky.calls, /^batch:/)].every(c => NO_MERGE.test(c.prompt)))
  const bpd = await wf('gauntlet-batch.js', bargs({ models: { ...F, tester: { model: 'probe-tester', effort: 'medium', label: 'Probe Tester 4.0' }, aux: { model: 'probe-aux', effort: 'max' } }, language: 'Probe-Language' }), (p, o) => o.label === 'batch:tester' ? { ...decl(), model: 'probe-tester Probe Tester 4.0' } : 'ok')
  seen['gauntlet-batch.js'].pop() // the probe run is not part of the contract checks below (its aux model differs from the meta phases)
  await chk('models: with distinct probe models in args.models, every agent() of gauntlet-batch uses them (model and effort), warns about none, and the prompts carry the language, whatever forge.json says', () => bpd.calls.length === 2 && bpd.calls.every(c => (c.opts.label === 'batch:tester' ? 'probe-tester,medium' : 'probe-aux,max') === c.opts.model + ',' + c.opts.effort && c.prompt.includes('Probe-Language')) && !bpd.logs.some(l => l.startsWith('WARNING')) && /Probe Tester 4\.0/.test(bpd.calls[1].prompt))

  }
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
  await chk('ponytail: the developer prompt points to .claude/briefs/dev.md and the critic prompt to .claude/briefs/critic.md', () => has('.claude/briefs/dev.md') && has('.claude/briefs/critic.md') && pd.length > 0 && pc.length > 0 && pd.every(c => c.prompt.includes('.claude/briefs/dev.md')) && pc.every(c => c.prompt.includes('.claude/briefs/critic.md')))
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
  // FRAMEWORK.md section 6: whoever writes painel.json writes its exact copy in painel/estado right after it, in the same step (the panel page reads only that copy)
  const sameData = t => /painel\.json[\s\S]{0,400}painel\/estado/.test(t)
  const panelCalls = f => seen[f].flatMap(x => x.calls).filter(c => c.opts.label.startsWith('panel:'))
  await chk('panel: same data: FRAMEWORK.md and every panel agent of both workflows say that whoever writes .checkpoints/painel.json writes its exact copy in painel/estado right after it, in the same step', () => (!has('FRAMEWORK.md') || sameData(fs.readFileSync('FRAMEWORK.md', 'utf8'))) && ['gauntlet-attacks.js', 'gauntlet-batch.js', 'gauntlet-build.js', 'gauntlet-ponytail.js'].every(f => panelCalls(f).length > 0 && panelCalls(f).every(c => sameData(c.prompt))))
  const rec =(role, m) => new RegExp(`"role":"${role}","loop":"\\w+","model":"${esc(label(m))}","effort":"${esc(m.effort)}"`)
  const [dv, ct, pB, pC] = [[...devs, ...pd], [...crit, ...pc], rec('builder', D), rec('critic', C)]
  await chk('panel: the panel records say the model and effort of each role from forge.json (developer, critic), in the seed and in every agent of both workflows', () => dv.length > 0 && ct.length > 0 && dv.every(c => pB.test(c.prompt)) && ct.every(c => pC.test(c.prompt)) && [seedB, r.calls[0].prompt].every(s => pB.test(s) && pC.test(s)))
  // probe: distinct models per role. A workflow that ignores args.models fails here even when forge.json equals what it hardcodes.
  const PROBE = { developer: { model: 'probe-dev', effort: 'xhigh', label: 'Probe Dev 1.0' }, critic: { model: 'probe-critic', effort: 'low', label: 'Probe Critic 2.0' }, aux: { model: 'probe-aux', effort: 'max', label: 'Probe Aux 3.0' } }
  const PR = { build: 'probe-dev,xhigh', pony: 'probe-dev,xhigh', critic: 'probe-critic,low', 'pony-critic': 'probe-critic,low', attacks: 'probe-critic,low', panel: 'probe-aux,max' }
  const probe = async (file, args, impl) => {
    const x = await wf(file, { ...args, models: PROBE, language: 'Probe-Language', memory: { workspace: 'probe-ws', project: 'probe-proj' } }, (p, o) => { const y = impl(p, o); return typeof y === 'object' ? { ...y, model: declared(PROBE[/^(build|pony):/.test(o.label) ? 'developer' : 'critic']) } : y })
    seen[file].pop() // the probe runs are not part of the contract checks below (their aux model differs from the meta phases)
    return x
  }
  const [PB, PP] = [await probe('gauntlet-build.js', { ...base, pieces: [piece] }, win), await probe('gauntlet-ponytail.js', u2, pony)]
  const [pbD, pbC, ppD, ppC] = [only(PB.calls, /^build:/), only(PB.calls, /^critic:/), only(PP.calls, /^pony:/), only(PP.calls, /^pony-critic:/)]
  await chk('models: with distinct probe models in args.models, every agent() of both workflows uses them (model, effort and panel text) and warns about none, whatever forge.json says', () => [PB, PP].every(x => x.out.results[0].won && rolesOk(x.calls, PR) && !x.logs.some(l => l.startsWith('WARNING')) && [rec('builder', PROBE.developer), rec('critic', PROBE.critic)].every(re => re.test(x.calls[0].prompt))) && [...pbD, ...ppD].every(c => rec('builder', PROBE.developer).test(c.prompt)) && [...pbC, ...ppC].every(c => rec('critic', PROBE.critic).test(c.prompt)) && pbD.length > 0 && ppD.length > 0 && pbC.length > 0 && ppC.length > 0)
  await chk('args: language reaches every agent() prompt of both workflows and memory reaches the build developer (ai-memory workspace and project), whatever forge.json says', () => [PB, PP].every(x => x.calls.length > 3 && x.calls.every(c => c.prompt.includes('Probe-Language'))) && pbD.length > 0 && pbD.every(c => c.prompt.includes('workspace "probe-ws", project "probe-proj"')) && devs.every(c => !c.prompt.includes('probe-ws') && c.prompt.includes('.ai-memory.toml')))
  const PA = await probe('gauntlet-attacks.js', { ...base, pieces: [piece] }, attImpl())
  await chk('models: with distinct probe models in args.models, every agent() of gauntlet-attacks uses them (model and effort), warns about none, and the panel text names them, whatever forge.json says', () => PA.out.results.length === 1 && PA.calls.length === 2 && rolesOk(PA.calls, PR) && !PA.logs.some(l => l.startsWith('WARNING')) && rec('critic', PROBE.critic).test(PA.calls[1].prompt))
  await chk('attacks: args without root, dashboardUrl or pieces, or a piece without id, title, goal, bar or owns, bring the workflow down with incomplete args, before spending an agent', async () => (await Promise.all([{ root: '' }, { dashboardUrl: '' }, { pieces: [] }, ...['id', 'title', 'goal', 'bar', 'owns'].map(k => ({ pieces: [{ ...piece, [k]: undefined }] }))].map(a => rejects('gauntlet-attacks.js', { ...base, pieces: [piece], ...a })))).every(Boolean))
  await chk('attacks: args without models, or with a role missing model or a valid effort, or with a match that is not a valid regex, bring the workflow down with incomplete args naming the role and pointing to forge.json, before spending an agent', () => rejectsModels('gauntlet-attacks.js', { ...base, pieces: [piece] }, ['critic', 'aux']))
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
  // CP0 only exists while BOOTSTRAP.md exists; its three json blocks (in this order: pieces for attacks and build, batch, ponytail) are the args of step 8, one line per workflow
  if (has('BOOTSTRAP.md')) {
    const blk = i => JSON.parse([...fs.readFileSync('BOOTSTRAP.md', 'utf8').matchAll(/```json\r?\n([\s\S]*?)\r?\n```/g)][i][1])
    const ownsOk = ps => { const owns = ps.flatMap(x => x.owns); return owns.every(f => has(f)) && new Set(owns).size === owns.length }
    const cp0 = x => x.calls[0].prompt.includes('"checkpoint":"0"') && !/"checkpoint":[^"]/.test(x.calls[0].prompt)
    await chk('bootstrap: args: gauntlet-attacks (step 8 block of the pieces: files exist, owns disjoint, one result per piece)', async () => { const b = blk(0), x = await wf('gauntlet-attacks.js', { ...b, models: F }, attImpl()); return x.out.results.length === b.pieces.length && ownsOk(b.pieces) })
    await chk('bootstrap: args: gauntlet-build (step 8 block of the pieces: files exist, owns disjoint, checkpoint 0 as text)', async () => { const b = blk(0), x = await wf('gauntlet-build.js', { ...b, models: F, mode: FJ.mode, escalation: FJ.escalation }, win); return x.out.results.every(y => y.won) && cp0(x) && ownsOk(b.pieces) })
    await chk('bootstrap: args: gauntlet-batch (step 8 block of the batch: files exist, owns disjoint, the suite of CP0 twice, checkpoint 0 as text)', async () => {
      const c = blk(1), x = await wf('gauntlet-batch.js', { ...c, models: F, mode: FJ.mode }, (p, o) => o.label === 'batch:tester' ? { runs: [1, 2].map(n => ({ kind: 'suite', command: c.testCommand, pass: n, failures: [] })), isolated: [], main: [], model: declared(T) } : 'ok')
      return x.out.batch.verdict === 'pass' && c.testCommand === 'node .claude/check.cjs' && x.calls[0].prompt.includes('Checkpoint 0:') && ownsOk(c.pieces)
    })
    await chk('bootstrap: args: gauntlet-ponytail (step 8 block of the units: files exist, checkpoint 0 as text)', async () => { const p = blk(2), x = await wf('gauntlet-ponytail.js', { ...p, models: F }, pony); return x.out.results.every(y => y.won) && cp0(x) && p.units.flatMap(u => u.paths).every(f => has(f)) && p.testCommand === 'node .claude/check.cjs' })
  }

  // Workflow API contract (skill workflow-authoring), proven over the simulations above: three lines per workflow
  const OPTS = ['label', 'phase', 'schema', 'model', 'effort', 'isolation', 'agentType']
  const RUN = { attacks: ['gauntlet-attacks.js', { ...base, pieces: [piece, q, ...[3, 4, 5].map(n => ({ ...piece, id: 'x' + n, title: 'X' + n, owns: ['src/x' + n + '.js'], issue: 20 + n }))] }, attImpl()], build: ['gauntlet-build.js', { ...base, pieces: [piece] }, build], batch: ['gauntlet-batch.js', bargs(), bt(decl([{ test: 'x', files: core, suite: [2], alone: true }, { test: 'y', files: ta, suite: [1, 2] }]))], ponytail: ['gauntlet-ponytail.js', uAll, pony] }
  for (const [tag, [file, args, impl]] of Object.entries(RUN)) {
    const raw = () => fs.readFileSync('.claude/workflows/' + file, 'utf8'), lit = () => raw().match(META)[1], meta = () => vm.runInNewContext('(' + lit() + ')')
    const used = new Set(seen[file].flatMap(x => x.phases)), calls = seen[file].flatMap(x => x.calls)
    await chk(`${tag}: the script starts with a pure literal meta (only strings, objects and lists), with name = file name, a non-empty single-line description and meta.phases = the phase() calls`, () => raw().startsWith('export const meta = ') && !/[^\s{}\[\],:]/.test(lit().replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\w+(?=\s*:)/g, '')) && meta().name === file.replace('.js', '') && /^[^\n]+$/.test(meta().description) && meta().phases.length === used.size && meta().phases.every(p => used.has(p.title) && p.detail))
    await chk(`${tag}: the meta text names the developer and critic model and effort from forge.json, the panel phase runs the aux model and no token is left unrendered (fill them with: node .claude/check.cjs --render)`, () => !raw().includes('{{') && matches(raw()))
    await chk(`${tag}: every agent() uses only API opts (label, phase from meta.phases with the model it declares, effort), and the schema has an object root and required inside properties; only the panel agent runs without a schema`, () => { const ph = meta().phases; return calls.length > 0 && calls.every(c => typeof c.prompt === 'string' && Object.keys(c.opts).every(k => OPTS.includes(k)) && typeof c.opts.label === 'string' && ph.some(p => p.title === c.opts.phase && (!p.model || p.model === c.opts.model)) && (!c.opts.effort || EFF.includes(c.opts.effort)) && (c.opts.schema ? c.opts.schema.type === 'object' && c.opts.schema.required.every(k => k in c.opts.schema.properties) : c.opts.label.startsWith('panel:'))) })
    await chk(`${tag}: resume: with Date.now, Math.random and new Date() throwing, the same args and answers repeat exactly the agent() calls (prompt and opts)`, async () => { const [a, b] = [await wf(file, args, impl), await wf(file, args, impl)]; return a.calls.length > (tag === 'batch' ? 1 : 5) && JSON.stringify(a.calls) === JSON.stringify(b.calls) })
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

  // learnings/: the error register (FRAMEWORK.md section 11), read by .claude/learnings.cjs. The clock is the UTC date, or --today YYYY-MM-DD; a past REVIEW-BY on an open entry is a warning, never a FAIL.
  // ponytail: a register under 1 MB per file (the default buffer of git show); upgrade: pass maxBuffer to spawnSync if one ever grows past it
  {
    const L_FORM = 'learnings: every entry of learnings/ is well formed', L_GROW = 'learnings: learnings/ only grows (only STATUS lines change)'
    let lib = null
    try { lib = require('./learnings.cjs') } catch (e) {}
    const eq = process.argv.find(a => a.startsWith('--today=')), ti = process.argv.indexOf('--today'), given = eq !== undefined || ti >= 0 // --today X or --today=X
    const today = eq !== undefined ? eq.slice(8) : ti >= 0 ? process.argv[ti + 1] : new Date().toISOString().slice(0, 10)
    let names = []
    try { names = fs.readdirSync('learnings').filter(n => n !== 'README.md') } catch (e) {}
    const texts = {}
    for (const n of names) try { texts[n] = fs.readFileSync(path.join('learnings', n), 'utf8') } catch (e) { texts[n] = '' }
    const git = (...a) => { const r = sh('git', a); return r.error || r.status ? null : r.stdout }
    let head = null // the register at git HEAD, or null: no git, no commit
    const listed = git('ls-tree', '--name-only', 'HEAD', 'learnings/')
    if (listed !== null) {
      head = {}
      for (const f of listed.split(/\r?\n/).filter(f => /^learnings\/[^/]+\.md$/.test(f) && f !== 'learnings/README.md')) { const t = git('show', 'HEAD:./' + f); if (t === null) { head = null; break } head[f.slice(10)] = t }
    }
    const parsed = lib ? names.map(n => lib.parse(texts[n], n)) : [], clockOk = !!lib && lib.isDay(today)
    const r = lib ? lib.validate(parsed.flatMap(p => p.entries), { today: clockOk ? today : undefined, exists: p => has(p), headTexts: head || undefined, texts }) : { fails: [], warns: [] }
    const form = [...(given && !clockOk && lib ? ['--today ' + today + ' is not a date YYYY-MM-DD'] : []), ...parsed.flatMap(p => p.problems), ...r.fails.filter(f => f.kind === 'form').map(f => f.message)]
    const grow = r.fails.filter(f => f.kind === 'grow').map(f => f.message)
    if (!lib && names.length) form.push('.claude/learnings.cjs is missing')
    await chk(L_FORM + (form.length ? ' (' + form.join('; ') + ')' : parsed.every(p => !p.entries.length) ? ' (no entries)' : ''), () => !form.length)
    await chk(L_GROW + (grow.length ? ' (' + grow.join('; ') + ')' : head === null ? ' (no history)' : ''), () => !grow.length)
    const late = r.warns.filter(w => w.kind === 'review-by'), again = r.warns.filter(w => w.kind === 'recurred-test')
    if (late.length) console.log('warn  learnings: open entries past their REVIEW-BY (today ' + today + '): ' + late.map(w => w.message).join(', '))
    if (again.length) console.log('warn  learnings: recurrence in the strongest layer, the test was not enough, review it (redesign): ' + again.map(w => w.message).join(', '))
  }

  console.log(bad ? '\nThere is a FAIL above.' : '\nAll ok.')
  process.exit(bad)
})()
