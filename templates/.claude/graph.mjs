// node .claude/graph.mjs update | docs [--mark]   (always runs at the project root, the parent folder of .claude/)
//   update: `graphify update .` (no LLM: code by AST, Markdown by headings); it handles the empty folder of CP0. After a graphify that exits 0 it writes the seal graphify-out/forge-fresh.json { head, at }
//   docs:   compares the sha256 of the docs graphify would read with an LLM against graphify-out/forge-docs.json and prints the cost (words) of reading the changed ones;
//           --mark records the current state. It never starts a process; the LLM pass itself (/graphify . --update) is a skill the orchestrator runs.
// The only graphify command started from here is the one above, which needs no LLM.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const GRAPH = path.join(ROOT, 'graphify-out', 'graph.json')
const STAMP = path.join(ROOT, 'graphify-out', 'forge-docs.json')
const SEAL = path.join(ROOT, 'graphify-out', 'forge-fresh.json')
const cmd = process.argv[2], mark = process.argv.includes('--mark')

const update = () => {
  const r = spawnSync('graphify', ['update', '.'], { cwd: ROOT, encoding: 'utf8' })
  if (r.error && r.error.code === 'ENOENT') { console.log('graph: graphify not found'); return 1 }
  const text = (r.stdout || '') + (r.stderr || '')
  if (r.status === 0) {
    let built
    try { built = JSON.parse(fs.readFileSync(GRAPH, 'utf8').replace(/^﻿/, '')).built_at_commit } catch (e) { console.log('graph: updated, but graphify-out/graph.json is missing or unreadable'); return 1 }
    // graphify leaves graph.json untouched when the code did not change, so built_at_commit does not move; the seal records that this update ran at HEAD
    const g = spawnSync('git', ['rev-parse', '--verify', '-q', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }), head = g.status === 0 ? g.stdout.trim() : ''
    if (head) {
      const tmp = SEAL + '.' + process.pid + '.tmp'
      fs.writeFileSync(tmp, JSON.stringify({ head, at: new Date().toISOString() }) + '\n')
      fs.renameSync(tmp, SEAL)
    }
    console.log('graph: updated at ' + (head || built || 'no commit'))
    return 0
  }
  if (text.includes('No code files found')) { console.log('graph: nothing to index yet'); return 0 }
  console.log(text.split(/\r?\n/).filter(l => l.trim()).slice(-20).join('\n') || 'graph: graphify failed' + (r.error ? ': ' + r.error.message : ''))
  return 1
}

// the docs the LLM pass reads, as {relative path with /: sha256}; tasks.md is left out on purpose (the [X] marks must not trigger the pass)
const current = () => {
  const ls = d => { try { return fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }) } catch (e) { return [] } }
  const rels = ['CONTEXT.md', 'GLOSSARY.md']
  for (const s of ls('specs')) if (s.isDirectory()) rels.push('specs/' + s.name + '/spec.md', 'specs/' + s.name + '/plan.md')
  for (const f of ls('docs/adr')) if (f.isFile() && f.name.endsWith('.md')) rels.push('docs/adr/' + f.name)
  const now = {}
  for (const rel of rels) try { now[rel] = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex') } catch (e) {}
  return now
}

const docs = () => {
  const now = current()
  if (mark) {
    fs.mkdirSync(path.dirname(STAMP), { recursive: true })
    fs.writeFileSync(STAMP, JSON.stringify(now, null, 2) + '\n')
    console.log('docs: marked ' + Object.keys(now).length + ' files')
    return 0
  }
  let was = {}
  try { const j = JSON.parse(fs.readFileSync(STAMP, 'utf8').replace(/^﻿/, '')); if (j && typeof j === 'object' && !Array.isArray(j)) was = j } catch (e) {} // shortcut: an unreadable stamp counts as no stamp, so everything reads as changed
  const changed = [...new Set([...Object.keys(now), ...Object.keys(was)])].filter(k => now[k] !== was[k]).sort()
  if (!changed.length) { console.log('docs: unchanged'); return 0 }
  // a deleted file has no content left to read: it counts as changed with 0 words
  const words = changed.reduce((n, k) => n + (now[k] ? (fs.readFileSync(path.join(ROOT, k), 'utf8').match(/\S+/g) || []).length : 0), 0)
  console.log('docs: changed ' + changed.length + ' files, ' + words + ' words: ' + changed.join(','))
  return 0
}

if (cmd === 'update') process.exitCode = update()
else if (cmd === 'docs') process.exitCode = docs()
else { console.log('usage: node .claude/graph.mjs update | docs [--mark]'); process.exitCode = 2 }
