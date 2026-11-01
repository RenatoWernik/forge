#!/usr/bin/env node
// The mechanical work of the error register (FRAMEWORK.md section 11), the same for every project and never done by a model. Run it from the project root.
//   node .claude/learn.mjs add --json <file> [--today X]   adds the entry of the file (a JSON object with the fields of the format, no E-NNN) to learnings/YYYY-MM.md
//   node .claude/learn.mjs readout [--today X]             writes the Learned rules block at the end of CLAUDE.md and AGENTS.md
//   node .claude/learn.mjs report                          one line per class, then the counts of escapes and noise
//   node .claude/learn.mjs for <file>...                   the open lessons whose AREA matches the files
//   node .claude/learn.mjs classes --ref <branch>          the known classes, read from git <branch> only
//   node .claude/learn.mjs gotcha <E-NNN>                  the body of the memory page gotchas/<class>.md
// The register is the learnings/YYYY-MM.md files; learnings/README.md is not part of it. Exit: 0 ok, 1 refused or failed, 2 usage, 3 busy.
import { readFileSync, readdirSync, existsSync, mkdirSync, openSync, closeSync, writeFileSync, appendFileSync, unlinkSync, rmdirSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

const lib = createRequire(import.meta.url)('./learnings.cjs')
const { val, isMonthFile, FORCE } = lib
const [cmd, ...args] = process.argv.slice(2)
const out = s => console.log(s)
const stop = (code, ...lines) => { for (const l of lines) console.error(l); process.exit(code) }
const flag = name => { // --name X or --name=X
  const i = args.findIndex(a => a === name || a.startsWith(name + '='))
  return i < 0 ? undefined : args[i].startsWith(name + '=') ? args[i].slice(name.length + 1) : args[i + 1]
}
const eolOf = t => { const i = t.indexOf('\n'); return i > 0 && t[i - 1] === '\r' ? '\r\n' : '\n' }
const pad = n => 'E-' + String(n).padStart(3, '0')
const NEXT = { test: 'none', hook: 'test', check: 'test', contract: 'hook|check', text: 'contract', memory: 'text' } // the layer one rung up; hook and check share the rung below contract

const clock = () => {
  const t = flag('--today')
  if (t !== undefined && !lib.isDay(t)) stop(1, '--today ' + t + ' is not a date YYYY-MM-DD')
  return t
}
// the entries of a list of [file name, text], in file order
const parseAll = files => files.filter(([n]) => isMonthFile(n)).sort((a, b) => a[0] < b[0] ? -1 : 1).map(([n, t]) => lib.parse(t, n))
const register = () => parseAll(existsSync('learnings') ? readdirSync('learnings').filter(isMonthFile).map(n => [n, readFileSync(join('learnings', n), 'utf8')]) : [])
const entriesOf = parsed => parsed.flatMap(p => p.entries)
// per class: the number of entries, the strongest layer (the first one at that force) and the last entry
const classes = entries => {
  const by = new Map()
  for (const e of entries) {
    const c = val(e, 'CLASS')
    if (!c || !Object.hasOwn(FORCE, val(e, 'PREVENTION'))) continue // a malformed entry is the business of check.cjs
    if (!by.has(c)) by.set(c, [])
    by.get(c).push(e)
  }
  return [...by].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([c, es]) => {
    const tiers = es.map(e => val(e, 'PREVENTION')), strongest = tiers.reduce((a, b) => FORCE[b] < FORCE[a] ? b : a)
    return { class: c, entries: es.length, strongest, last: es.reduce((a, b) => b.n > a.n ? b : a).id }
  })
}

function add() {
  const file = flag('--json'), today = clock()
  if (!file) stop(2, 'usage: node .claude/learn.mjs add --json <file> [--today X]')
  let obj
  try { obj = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')) } catch (e) { stop(1, 'add: ' + file + ': ' + e.message) }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) stop(1, 'add: ' + file + ' must hold a JSON object')
  const refused = []
  for (const [k, v] of Object.entries(obj)) {
    if (!lib.FIELDS.includes(k)) refused.push(k + ': unknown field')
    else if (typeof v !== 'string' || /[\r\n]/.test(v)) refused.push(k + ': must be a text on one line')
  }
  if (refused.length) stop(1, ...refused)
  if (!lib.isDay(obj.DATE)) stop(1, 'DATE: "' + obj.DATE + '" is not a date YYYY-MM-DD')
  const month = obj.DATE.slice(0, 7), name = month + '.md', dir = 'learnings', lock = join(dir, '.lock')
  const made = !existsSync(dir)
  if (made) mkdirSync(dir, { recursive: true })
  let fd
  try { fd = openSync(lock, 'wx') } catch (e) {
    if (made) try { rmdirSync(dir) } catch {}
    stop(e.code === 'EEXIST' ? 3 : 1, e.code === 'EEXIST' ? 'learnings: busy, try again' : 'add: ' + e.message)
  }
  let wrote = false, refusal // stop() would skip the finally: the refusal is reported after the lock is gone
  try {
    const parsed = register()
    const id = pad(Math.max(0, ...entriesOf(parsed).map(e => e.n)) + 1)
    const old = parsed.find(p => p.file === name) && readFileSync(join(dir, name), 'utf8')
    const eol = old === undefined ? '\n' : eolOf(old)
    const entry = ['## ' + id, ...lib.FIELDS.filter(k => k in obj).map(k => '- ' + k + ': ' + obj[k].trim())].join(eol) + eol
    const lead = old === undefined ? '# Learnings ' + month + eol + eol : /(\r?\n){2}$/.test(old) ? '' : old.endsWith('\n') ? eol : eol + eol
    const mine = lib.parse('# Learnings ' + month + '\n\n' + entry, name).entries[0]
    const fails = lib.validate([...entriesOf(parsed), mine], { today, exists: p => existsSync(p) }).fails.filter(f => f.id === id).map(f => f.message)
    if (obj.PREVENTION === 'text') {
      const n = lib.TITLES.findIndex(t => String(obj.SYMPTOM).includes(t))
      if (n >= 0) fails.push('the rule repeats invariant ' + (n + 1) + ': CLAUDE.md already says it')
    }
    const bad = lib.parse((old ?? '') + lead + entry, name).problems // the file stays in the strict format of the register
    if (fails.length || bad.length) refusal = [...fails, ...bad]
    else {
      if (old === undefined) writeFileSync(join(dir, name), lead + entry, { flag: 'wx' })
      else appendFileSync(join(dir, name), lead + entry)
      wrote = true
      out('added ' + id + ' to learnings/' + name)
    }
  } finally {
    closeSync(fd)
    unlinkSync(lock)
    if (made && !wrote) try { rmdirSync(dir) } catch {}
  }
  if (refusal) stop(1, ...refusal)
}

function readout() {
  clock()
  const lines = lib.block(entriesOf(register()))
  const next = ['CLAUDE.md', 'AGENTS.md'].map(f => {
    if (!existsSync(f)) stop(1, 'readout: ' + f + ' not found')
    const text = readFileSync(f, 'utf8'), eol = eolOf(text), cr = eol === '\r\n' ? '\r' : '', arr = text.split('\n'), at = lib.locate(arr)
    if (at && at.end < 0) stop(1, 'readout: ' + f + ' has the start marker of the Learned rules block and no end marker')
    if (at) { arr.splice(at.start + 1, at.end - at.start - 1, ...lines.map(l => l + cr)); return [f, text, arr.join('\n')] }
    const lead = /(\r?\n){2}$/.test(text) ? '' : text.endsWith('\n') ? eol : text ? eol + eol : ''
    return [f, text, text + lead + ['## Learned rules', '', lib.START, ...lines, lib.END].join(eol) + eol]
  })
  for (const [f, was, now] of next) if (now !== was) writeFileSync(f, now)
  out('readout: ' + lines.length + ' lines in CLAUDE.md and AGENTS.md')
}

function report() {
  const entries = entriesOf(register())
  for (const c of classes(entries)) out(c.class + ': ' + c.entries + ' entries, strongest ' + c.strongest + ', next ' + NEXT[c.strongest] + ', last ' + c.last)
  const n = t => entries.filter(e => val(e, 'TRIGGER') === t).length
  out('escapes: ' + n('escape') + ', noise: ' + n('noise'))
}

// a glob of AREA (* does not cross a slash, ** does, **/ may be nothing) as a regular expression
const glob = g => new RegExp('^' + g.trim().replace(/\\/g, '/').replace(/^\.\//, '').split(/(\*\*\/|\*\*|\*)/).map((p, i) => i % 2 ? (p === '*' ? '[^/]*' : p === '**' ? '.*' : '(?:.*/)?') : p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('') + '$')
function lessons() {
  const files = args.map(a => a.replace(/\\/g, '/').replace(/^\.\//, '')).filter(a => a && !a.split('/').includes('..'))
  const hits = entriesOf(register()).filter(e => ['open', 'recurred', 'escalated'].includes(val(e, 'STATUS')) && val(e, 'AREA') && val(e, 'CLASS') && val(e, 'SYMPTOM')
    && val(e, 'AREA').split(',').some(g => g.trim() && files.some(f => glob(g).test(f)))).sort((a, b) => a.n - b.n)
  if (!hits.length) return out('none')
  for (const e of hits) out(e.id + ' ' + val(e, 'CLASS') + ' ' + val(e, 'PREVENTION') + ': ' + val(e, 'SYMPTOM'))
}

function known() {
  const ref = flag('--ref')
  if (!ref || ref.startsWith('-')) stop(2, 'usage: node .claude/learn.mjs classes --ref <branch>')
  const git = (...a) => { const r = spawnSync('git', a, { encoding: 'utf8', maxBuffer: 64 << 20 }); return r.error || r.status ? stop(1, 'classes: git ' + a[0] + ' failed for ' + ref + ': ' + (r.error?.message || r.stderr.trim())) : r.stdout }
  const names = git('ls-tree', '--name-only', ref, 'learnings/').split(/\r?\n/).filter(f => /^learnings\/[^/]+$/.test(f) && isMonthFile(f.slice(10)))
  const parsed = parseAll(names.map(f => [f.slice(10), git('show', ref + ':' + f)]))
  out(JSON.stringify(classes(entriesOf(parsed)).map(({ class: c, entries, strongest }) => ({ class: c, entries, strongest }))))
}

function gotcha() {
  const m = /^E-(\d+)$/.exec(args[0] ?? '')
  const e = m && entriesOf(register()).find(x => x.n === Number(m[1]))
  if (!e || !val(e, 'CLASS')) stop(1, 'gotcha: ' + (args[0] ?? '') + ' is not an entry of learnings/')
  out('# ' + val(e, 'CLASS') + '\nIndex only: the lesson is entry ' + e.id + ' of learnings/' + e.file + ' (node .claude/learn.mjs report).')
}

const COMMANDS = { add, readout, report, for: lessons, classes: known, gotcha }
if (!Object.hasOwn(COMMANDS, cmd)) stop(2, 'usage: node .claude/learn.mjs <add|readout|report|for|classes|gotcha> ...')
COMMANDS[cmd]()
