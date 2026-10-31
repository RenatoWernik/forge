// The error register of the project (FRAMEWORK.md section 11): parses and validates learnings/YYYY-MM.md. CommonJS, standard library only.
// check.cjs runs it; the learn command of forge reuses it.
//   parse(text, file)  -> { file, entries, problems }   file = the base name (2026-10.md); entry = { id, n, file, line, fields: [[KEY, value], ...] }; problems = what is wrong with the file itself (name, title)
//   validate(entries, { today, exists, headTexts, texts }) -> { fails, warns }   entries = the entries of every file
//     today = 'YYYY-MM-DD' (the clock; without it no warning of a past REVIEW-BY), exists = path => boolean (the repository; without it every path "does not exist"), headTexts and texts = { 'YYYY-MM.md': text } at git HEAD and now (without headTexts, the history is not checked)
//     an item = { id, field, message, kind }; message starts with '<id> <field>: '; kind = 'form' | 'grow' for a fail, 'review-by' | 'recurred-test' for a warning
const FIELDS = ['DATE', 'TRIGGER', 'DETECTED-BY', 'SYMPTOM', 'CLASS', 'CAUSE', 'CAUSE-OWNER', 'FAILED-LAYER', 'MISSING-CONTEXT', 'PREVENTION', 'PREVENTION-PATH', 'FAILS', 'REGRESSION', 'CLEAN-CASE', 'AREA', 'SCOPE', 'REVIEW-BY', 'APPROVED', 'STATUS']
const ENUMS = {
  TRIGGER: ['user', 'critic-rejected', 'escape', 'noise', 'hook-blocked', 'incident'],
  'CAUSE-OWNER': ['spec', 'instruction', 'harness', 'model', 'product'],
  'FAILED-LAYER': ['contract', 'round-minus-1', 'tdd', 'critic', 'tester', 'check', 'hook', 'orchestrator'],
  PREVENTION: ['test', 'hook', 'check', 'contract', 'text', 'memory'],
  FAILS: ['open', 'closed'],
  SCOPE: ['project', 'package'],
  STATUS: ['open', 'prevented', 'recurred', 'escalated', 'moot', 'expired'],
}
const FORCE = { test: 1, hook: 2, check: 2, contract: 3, text: 4, memory: 5 } // 1 is the strongest layer
const PATHS = ['PREVENTION-PATH', 'REGRESSION', 'CLEAN-CASE']
const pad = n => 'E-' + String(n).padStart(3, '0')
const isDay = s => { if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const d = new Date(s + 'T00:00:00Z'); return !isNaN(d) && d.toISOString().slice(0, 10) === s }
const addDays = (s, n) => new Date(Date.parse(s + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10)
const lf = s => s.replace(/\r\n/g, '\n')

function parse(text, file) {
  const entries = [], problems = [], month = (file.match(/^(\d{4}-(?:0[1-9]|1[0-2]))\.md$/) || [])[1]
  if (!month) problems.push(file + ': the name must be YYYY-MM.md (or README.md)')
  const lines = lf(text.replace(/^﻿/, '')).split('\n'), first = lines.find(l => l.trim() && !/^<!--.*-->\s*$/.test(l))
  if (month && first !== '# Learnings ' + month) problems.push(file + ': the first line must be "# Learnings ' + month + '"')
  let cur = null
  lines.forEach((l, i) => {
    const h = l.match(/^## (E-.*?)\s*$/), f = l.match(/^- ([A-Z][A-Z-]*):[ \t]*(.*?)\s*$/)
    if (h) entries.push(cur = { id: h[1], n: parseInt(h[1].slice(2), 10), file, line: i + 1, fields: [] })
    else if (/^## /.test(l)) cur = null
    else if (f && cur) cur.fields.push([f[1], f[2]])
  })
  return { file, entries, problems }
}

// the lines of a register text with the STATUS lines out and the trailing blank lines cut: the part of a file that may never change
const frozen = t => { const l = lf(t).split('\n').filter(x => !x.startsWith('- STATUS:')); while (l.length && !l[l.length - 1].trim()) l.pop(); return l }

function validate(entries, { today, exists = () => false, headTexts, texts = {} } = {}) {
  const fails = [], warns = []
  const bad = (e, field, why) => fails.push({ id: e.id, field, kind: 'form', message: e.id + ' ' + field + ': ' + why })
  const good = entries.map(e => {
    const v = {}
    let last = -1
    for (const [k, val] of e.fields) {
      const i = FIELDS.indexOf(k)
      if (i < 0) { bad(e, k, 'unknown field'); continue }
      if (k in v) { bad(e, k, 'repeated'); continue }
      v[k] = val
      if (!val) bad(e, k, 'empty')
      if (i < last) bad(e, k, 'out of order, it comes before ' + FIELDS[last])
      last = Math.max(last, i)
    }
    for (const k of FIELDS) if (!(k in v) && k !== 'APPROVED') bad(e, k, 'missing')
    for (const [k, list] of Object.entries(ENUMS)) if (v[k] && !list.includes(v[k])) bad(e, k, '"' + v[k] + '" is not one of ' + list.join(' | '))
    for (const k of ['DATE', 'REVIEW-BY']) if (v[k] && !isDay(v[k])) bad(e, k, '"' + v[k] + '" is not a date YYYY-MM-DD')
    if (isDay(v.DATE) && isDay(v['REVIEW-BY']) && v['REVIEW-BY'] < v.DATE) bad(e, 'REVIEW-BY', 'is before DATE')
    if (isDay(v.DATE) && /^\d{4}-\d{2}\.md$/.test(e.file) && v.DATE.slice(0, 7) !== e.file.slice(0, 7)) bad(e, 'DATE', 'the month is not the one of ' + e.file)
    if (v.CLASS && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v.CLASS)) bad(e, 'CLASS', '"' + v.CLASS + '" is not a kebab-case slug')
    const tier = ENUMS.PREVENTION.includes(v.PREVENTION) ? v.PREVENTION : null
    if (tier === 'text' && !('APPROVED' in v)) bad(e, 'APPROVED', 'missing: PREVENTION text needs the approval of the user')
    else if ('APPROVED' in v && tier && tier !== 'text') bad(e, 'APPROVED', 'only exists with PREVENTION text')
    else if ('APPROVED' in v && !/^yes, \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v.APPROVED)) bad(e, 'APPROVED', '"' + v.APPROVED + '" is not "yes, YYYY-MM-DDThh:mm:ssZ"')
    if ((tier === 'text' || tier === 'memory') && isDay(v.DATE) && isDay(v['REVIEW-BY']) && v['REVIEW-BY'] > addDays(v.DATE, 14)) bad(e, 'REVIEW-BY', 'with PREVENTION ' + tier + ' it is at most 14 days after DATE (' + addDays(v.DATE, 14) + ')')
    const unsafe = new Set()
    for (const k of PATHS) {
      const p = v[k]
      if (!p || p === 'none') continue
      if (/^([\\/]|[A-Za-z]:)/.test(p)) { unsafe.add(k); bad(e, k, 'an absolute path is not allowed') }
      else if (p.split(/[\\/]/).includes('..')) { unsafe.add(k); bad(e, k, 'a ".." segment is not allowed') }
    }
    const must = k => { if (v[k] === undefined || unsafe.has(k)) return; if (v[k] === 'none') bad(e, k, 'must be a path of the repository with PREVENTION ' + tier + ', not none'); else if (!exists(v[k])) bad(e, k, v[k] + ' does not exist in the repository') }
    if (tier === 'test' || tier === 'hook' || tier === 'check') PATHS.forEach(must)
    else if (tier === 'contract') must('PREVENTION-PATH')
    else if (tier === 'text' && v['PREVENTION-PATH'] !== undefined && v['PREVENTION-PATH'] !== 'CLAUDE.md') bad(e, 'PREVENTION-PATH', 'with PREVENTION text it is CLAUDE.md')
    else if (tier === 'memory' && v['PREVENTION-PATH'] !== undefined && !/^ai-memory:\S/.test(v['PREVENTION-PATH'])) bad(e, 'PREVENTION-PATH', 'with PREVENTION memory it starts with ai-memory:')
    if (isDay(today) && v.STATUS === 'open' && isDay(v['REVIEW-BY']) && v['REVIEW-BY'] < today) warns.push({ id: e.id, field: 'REVIEW-BY', kind: 'review-by', date: v['REVIEW-BY'], message: e.id + ' (' + v['REVIEW-BY'] + ')' })
    return { e, v, tier }
  })

  // ids: E- and 3 or more digits, never repeated, and 1..N without a gap
  const byN = new Map()
  for (const { e } of good) {
    if (!/^E-\d{3,}$/.test(e.id)) bad(e, 'ID', 'must be E- followed by at least 3 digits')
    else if (byN.has(e.n)) bad(e, 'ID', 'repeated (also in ' + byN.get(e.n).file + ' line ' + byN.get(e.n).line + ')')
    else byN.set(e.n, e)
  }
  const ns = [...byN.keys()].sort((a, b) => a - b), gap = ns.findIndex((n, i) => n !== i + 1)
  if (gap >= 0) bad(byN.get(ns[gap]), 'ID', 'the sequence has a gap: ' + pad(gap + 1) + ' is missing')

  // the ladder: a class that comes back needs a strictly stronger layer than the strongest it had; after test it can only stay test, and that is a warning too
  const ladder = good.filter(g => g.tier && g.v.CLASS && byN.get(g.e.n) === g.e).sort((a, b) => a.e.n - b.e.n)
  ladder.forEach((g, i) => {
    const before = ladder.slice(0, i).filter(p => p.v.CLASS === g.v.CLASS && p.e.n < g.e.n)
    if (!before.length) return
    const top = before.reduce((a, b) => FORCE[b.tier] < FORCE[a.tier] ? b : a), who = g.e.id
    if (FORCE[top.tier] === 1) {
      if (g.tier !== 'test') bad(g.e, 'PREVENTION', 'class ' + g.v.CLASS + ' recurred (' + top.e.id + ' had test), the prevention must stay test')
      else warns.push({ id: who, field: 'PREVENTION', kind: 'recurred-test', message: who + ' (class ' + g.v.CLASS + ')' })
    } else if (FORCE[g.tier] >= FORCE[top.tier]) bad(g.e, 'PREVENTION', 'class ' + g.v.CLASS + ' recurred (' + top.e.id + ' had ' + top.tier + '), the prevention must climb a layer')
  })

  // history: what git HEAD has of each file, without the STATUS lines, is the beginning of what the file is now
  for (const [file, head] of Object.entries(headTexts || {})) {
    const msg = why => fails.push({ id: file, field: 'history', kind: 'grow', message: 'learnings/' + file + ': ' + why })
    if (texts[file] === undefined) { msg('committed in HEAD but missing now, the register only grows'); continue }
    const [a, b] = [frozen(head), frozen(texts[file])], i = a.findIndex((l, k) => l !== b[k])
    if (i >= 0) msg('line ' + (i + 1) + ' (without the STATUS lines) is not what HEAD has, the register only grows')
  }
  return { fails, warns }
}

module.exports = { parse, validate, isDay, FIELDS, ENUMS, FORCE }
