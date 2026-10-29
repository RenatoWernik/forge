import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// compat.json says which upstream versions the integration was verified with and which names it uses from each component.
// Oracle: the names the templates cite (regexes below, fixed here) must be in the surface of the right component, and the
// surface must hold only names that the upstream had at the verified version (the fixture, recorded once from the upstream).
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (...p) => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8').replace(/^﻿/, ''));
const compat = read('compat.json').components;
const fixture = read('scripts', 'fixtures', 'compat', 'surface-2026-10-29.json').sources;
const registry = read('components.json').components;

const VERIFIED = {
  uv: '0.13.6', 'gauntlet-loop': 'fc6b2fc', 'ai-memory': '3.2.10', 'ai-memory-mcp': '3.2.10', ponytail: '5.3.3',
  'spec-kit': '1.2.5', sdd: '2.1.0', 'mattpocock-skills': '1.3.2', graphify: '0.9.97', 'graphify-skill': '0.9.97',
};

// The tag or sha each source is read at (the sdd has no tags, the gauntlet-loop comes from the fork).
const REF = {
  uv: '0.13.6', 'gauntlet-loop': 'fc6b2fc', 'ai-memory': 'v3.2.10', 'ai-memory-mcp': 'v3.2.10', ponytail: 'v5.3.3',
  'spec-kit': 'v1.2.5', sdd: 'eba9606', 'mattpocock-skills': 'v1.3.2', graphify: 'v0.9.97', 'graphify-skill': 'v0.9.97',
};

test('compat.json has one entry for each component of the registry, with the version it was verified with', () => {
  assert.deepEqual(Object.keys(compat).sort(), registry.map((c) => c.id).sort());
  for (const [id, e] of Object.entries(compat)) {
    assert.equal(e.verifiedWith, VERIFIED[id], id);
    assert.ok(Array.isArray(e.surface?.skills) && Array.isArray(e.surface?.commands), id + ' surface');
    assert.match(e.source, /^https:\/\/github\.com\//, id + ' source');
    assert.ok(e.source.endsWith('/' + REF[id]), id + ' source is at ' + REF[id]);
  }
});

// Names the templates cite. A «Do not run» or «Do not use» line, with the blank lines and list items after it, is forbidden
// text: what it names is not used, so it never has to be in the surface.
const FORBIDDEN = /^\s*(?:[-*>]\s+|\d+\.\s+)?(?:\*\*|__)?do not (?:run|use)\b/i;
const withoutForbidden = (text) => {
  let inside = false;
  return text.split(/\r?\n/).filter((line) => {
    if (FORBIDDEN.test(line)) inside = true;
    else if (inside && !(line.trim() === '' || /^\s*[-*]\s+/.test(line))) inside = false;
    return !inside;
  }).join('\n');
};
const files = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : [join(dir, n)]));
const names = (regex, text, group = 1) => [...text.matchAll(regex)].map((m) => m[group]);

function cited() {
  const texts = files(join(ROOT, 'templates')).map((f) => withoutForbidden(readFileSync(f, 'utf8')));
  const all = texts.join('\n');
  const spans = names(/`([^`\n]+)`/g, all);
  const spanSubs = (word) => spans.flatMap((s) => names(new RegExp('^' + word + ' ([a-z][a-z-]*)', 'g'), s));
  const calls = (fn) => names(new RegExp(`\\(\\s*${fn}\\s*,\\s*\\[\\s*'([a-z][a-z-]*)'`, 'g'), all);
  return {
    'mattpocock-skills': names(/mattpocock-skills:([a-z0-9][a-z0-9-]*)/g, all).map((n) => `mattpocock-skills:${n}`),
    'spec-kit-skills': names(/speckit-([a-z][a-z-]*)/g, all).filter((n) => n !== 'x').map((n) => `speckit-${n}`),
    'spec-kit-flags': spans.filter((s) => /^specify init\b/.test(s)).flatMap((s) => names(/(?:^|\s)(--[a-z][a-z-]*)/g, s)).map((f) => `specify init ${f}`),
    ponytail: names(/\bponytail-([a-z]+)\b/g, all).map((n) => `ponytail-${n}`),
    graphify: [...spanSubs('graphify'), ...calls("'graphify'")].map((n) => `graphify ${n}`),
    'ai-memory': [...spanSubs('ai-memory'), ...calls('AIM')].map((n) => `ai-memory ${n}`),
  };
}
const unique = (a) => [...new Set(a)].sort();
const WHERE = { 'mattpocock-skills': ['mattpocock-skills', 'skills'], 'spec-kit-skills': ['spec-kit', 'skills'], 'spec-kit-flags': ['spec-kit', 'commands'], ponytail: ['ponytail', 'skills'], graphify: ['graphify', 'commands'], 'ai-memory': ['ai-memory', 'commands'] };

test('the extraction finds names of every family in the templates', () => {
  const c = cited();
  for (const k of Object.keys(WHERE)) assert.ok(c[k].length > 0, k);
});

test('every name the templates cite is in the surface of its component', () => {
  const c = cited();
  const missing = [];
  for (const [family, [id, list]] of Object.entries(WHERE)) for (const n of unique(c[family])) if (!compat[id].surface[list].includes(n)) missing.push(`${id}.surface.${list} lacks ${n}`);
  assert.deepEqual(missing, []);
});

// The names of the surface, each in the list the upstream had at the verified version.
const upstream = (id) => new Set(fixture.find((s) => s.id === id).names);
const CHECKS = [
  ['mattpocock-skills', 'skills', 'mattpocock-skills:', 'mattpocock-skills'],
  ['ponytail', 'skills', '', 'ponytail'],
  ['spec-kit', 'skills', 'speckit-', 'spec-kit'],
  ['spec-kit', 'commands', 'specify init ', 'spec-kit-init-flags'],
  ['graphify', 'commands', 'graphify ', 'graphify'],
  ['graphify-skill', 'commands', 'graphify ', 'graphify'],
  ['ai-memory', 'commands', 'ai-memory ', 'ai-memory'],
  ['ai-memory-mcp', 'commands', 'ai-memory ', 'ai-memory'],
  ['gauntlet-loop', 'skills', '', 'gauntlet-loop'],
  ['sdd', 'skills', '', 'sdd'],
];
test('the surface only holds names that the upstream had at the verified version (the fixture)', () => {
  const invented = [];
  for (const [id, list, prefix, source] of CHECKS) {
    const known = upstream(source);
    for (const n of compat[id].surface[list]) if (!n.startsWith(prefix) || !known.has(n.slice(prefix.length))) invented.push(`${id}: ${n}`);
  }
  assert.deepEqual(invented, []);
});

test('components that no template uses have an empty surface; none of them cites a name from another component', () => {
  assert.deepEqual(compat.uv.surface, { skills: [], commands: [] });
  const all = Object.values(compat).flatMap((e) => [...e.surface.skills, ...e.surface.commands]);
  assert.ok(!all.some((n) => /resolving-merge-conflicts|taskstoissues/.test(n)));
});

test('the fixture records each source at the verified tag or sha', () => {
  for (const s of fixture) {
    const id = s.id === 'spec-kit-init-flags' ? 'spec-kit' : s.id;
    assert.match(s.url, /^https:\/\/github\.com\//, s.id);
    assert.ok(s.url.includes(`/${REF[id]}/`) && !/\/(main|master|HEAD)\//.test(s.url), `${s.id} ${s.url}`);
    assert.ok(s.names.length > 0, s.id);
  }
});

test('the gauntlet-loop, a fork, records the original repository and the commit it was taken from; no other entry has an upstream', () => {
  assert.deepEqual(compat['gauntlet-loop'].upstream, { repo: 'robonuggets/gauntlet-loop', base: '9b1975a' });
  assert.deepEqual(Object.entries(compat).filter(([id, e]) => id !== 'gauntlet-loop' && 'upstream' in e), []);
});

test('the notes of every entry are a map from a version to a warning; the ai-memory 3.0.0 one tells about the migration and the backup', () => {
  for (const [id, e] of Object.entries(compat)) for (const [k, v] of Object.entries(e.notes ?? {})) assert.ok(/^\d+\.\d+\.\d+$/.test(k) && typeof v === 'string' && v, `${id} ${k}`);
  const note = compat['ai-memory'].notes['3.0.0'];
  assert.match(note, /migrat/i);
  assert.match(note, /backup/i);
  assert.match(note, /docs\/upgrading-to-3\.0\.md/);
});

test('no template path was skipped: the scan reads every file under templates/', () => {
  const list = files(join(ROOT, 'templates')).map((f) => relative(ROOT, f).split(sep).join('/'));
  assert.ok(list.includes('templates/FRAMEWORK.md') && list.some((f) => f.endsWith('check.cjs')));
});
