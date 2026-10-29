import { readdir, readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';

// Project data that must never travel back into the public templates: always turned back into its marker.
const PRIVATE = ['PROJECT_NAME', 'MEM_WORKSPACE', 'MEM_PROJECT', 'DASHBOARD_URL', 'REPO'];
// Markers whose value can only be learned from the project files (models and language come from forge.json).
const SCALAR = [...PRIVATE, 'SPECIFY_SCRIPT', 'LANG_TAG', 'PANEL_OVERRIDES'];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MARKER = /^\{\{([\w.]+)\}\}$/;
const hasMarker = (line) => /\{\{[\w.]+\}\}/.test(line);
// ponytail: CRLF read as LF so a Windows editor does not turn every line into a diff, upgrade: keep per-file line endings if a template ever needs CRLF
const readText = async (p) => (await readFile(p, 'utf8')).replace(/\r\n/g, '\n');
const split = (text) => (text ? text.replace(/\n$/, '').split('\n') : []);

const filesOf = async (root) => (await readdir(root, { withFileTypes: true, recursive: true })).filter((e) => e.isFile()).map((e) => relative(root, join(e.parentPath, e.name)).split('\\').join('/')).sort();

// A template line becomes a regex whose groups are its markers; the same line, filled in, yields the marker values.
function capture(tLine, line) {
  const names = [];
  const src = tLine.split(/(\{\{[\w.]+\}\})/).map((p) => {
    const m = MARKER.exec(p);
    if (m) { names.push(m[1]); return '(.*?)'; }
    return esc(p);
  }).join('');
  const m = new RegExp(`^${src}$`).exec(line);
  return m ? Object.fromEntries(names.map((n, i) => [n, m[i + 1]]).reverse()) : null; // reverse: the first occurrence wins
}

const winner = (votes) => [...votes].sort((x, y) => y[1] - x[1])[0]?.[0]; // stable: a tie goes to the value seen first

function git(args, cwd) {
  const r = spawnSync('git', ['-c', 'core.autocrlf=false', ...args], { cwd, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.error) throw new Error(`git is required (forge sync compares with git diff --no-index): ${r.error.message}`);
  if (r.status > 1) throw new Error(`git failed: ${r.stderr}`);
  return r.stdout;
}

// Changed line ranges between two texts, from git's own -U0 hunk headers.
async function hunks(rText, pText, work) {
  await Promise.all([writeFile(join(work, 'r'), rText), writeFile(join(work, 'p'), pText)]);
  const out = git(['diff', '--no-index', '--no-color', '-U0', '--', 'r', 'p'], work);
  return [...out.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)].map((m) => {
    const [a, b, c, d] = [+m[1], m[2] === undefined ? 1 : +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
    return { rStart: b === 0 ? a : a - 1, rLen: b, pStart: d === 0 ? c : c - 1, pLen: d };
  });
}

const word = (ch) => /[\p{L}\p{N}]/u.test(ch);
const bounded = (v) => (word(v[0]) ? String.raw`(?<![\p{L}\p{N}])` : '') + esc(v) + (word(v.at(-1)) ? String.raw`(?![\p{L}\p{N}])` : '');

// Turns a project line back into template text. Private values are replaced everywhere, unless the value is also plain text of the
// templates (a project called "Build", see `common`): then it is treated like the other values. Any other value only where the template
// line it replaces carries that marker: the markers are matched in order, so two markers with the same value (developer and
// critic on one model) each keep their own name, and further copies of a value that only one marker has are restored too (not the
// common-word name: only the span the marker takes is restored, an extra copy stays as typed and strayCommon flags it);
// a stray "sh" or "en" on a line without that marker stays as typed.
function unrender(line, tLine, values, common) {
  const markers = [...(tLine ?? '').matchAll(/\{\{([\w.]+)\}\}/g)].filter((m) => (!PRIVATE.includes(m[1]) || common.has(m[1])) && values[m[1]]);
  const spans = [];
  let from = 0;
  for (const { 1: name, index } of markers) {
    const re = new RegExp(bounded(values[name]), 'gu');
    re.lastIndex = from;
    let hit = re.exec(line);
    // copies of the value that are plain template text before this marker are not the marker: step over as many
    for (let k = (tLine.slice(0, index).replace(/\{\{[\w.]+\}\}/g, '\0').match(new RegExp(re)) ?? []).length; hit && k > 0; k--) hit = re.exec(line);
    if (!hit) continue;
    spans.push([hit.index, hit.index + hit[0].length, name]);
    from = hit.index + hit[0].length;
  }
  const own = [...new Set(markers.map((m) => m[1]))].filter((n) => !PRIVATE.includes(n)); // markers of this line; a value two of them share is not restored
  const byValue = new Map(own.filter((n) => own.every((o) => o === n || values[o] !== values[n])).map((n) => [values[n], n]));
  for (const [n, v] of Object.entries(values)) if (PRIVATE.includes(n) && !common.has(n) && v && v.length >= 3) byValue.set(v, n);
  const alt = [...byValue.keys()].sort((x, y) => y.length - x.length).map(bounded);
  const gap = (text) => (alt.length ? text.replace(new RegExp(alt.join('|'), 'gu'), (hit) => `{{${byValue.get(hit)}}}`) : text);
  let out = '', at = 0;
  for (const [i, j, name] of spans) { out += `${gap(line.slice(at, i))}{{${name}}}`; at = j; }
  return out + gap(line.slice(at));
}

// Which removed (rendered) line each added line of a hunk is an edit of: the most similar one (shared start plus shared end),
// each removed line used once, none when they hardly resemble each other (then the added line is new text and borrows no markers).
// ponytail: greedy best-first over a hunk, upgrade: a proper diff of the hunk if hunks with many similar lines ever mispair
function pairs(removed, added) {
  const shared = (x, y) => {
    let a = 0; while (a < x.length && x[a] === y[a]) a++;
    let b = 0; while (b < x.length - a && b < y.length - a && x.at(-1 - b) === y.at(-1 - b)) b++;
    return a + b;
  };
  const cand = [];
  added.forEach((p, k) => removed.forEach((r, j) => { const n = shared(p, r); if (n * 2 >= Math.min(p.length, r.length) && n > 0) cand.push([n, k, j]); }));
  cand.sort((x, y) => y[0] - x[0] || Math.abs(x[1] - x[2]) - Math.abs(y[1] - y[2]));
  const out = new Map(), used = new Set();
  for (const [, k, j] of cand) if (!out.has(k) && !used.has(j)) { out.set(k, j); used.add(j); }
  return out;
}

async function inferAnswers(projectDir, templates) {
  let forge;
  try { forge = JSON.parse((await readText(join(projectDir, '.claude/forge.json'))).replace(/^\uFEFF/, '')); } catch { throw new Error(`${projectDir} is not a forge project (no readable .claude/forge.json)`); }
  const votes = Object.fromEntries(SCALAR.map((n) => [n, new Map()]));
  for (const [rel, tText] of Object.entries(templates)) {
    let pLines;
    try { pLines = split(await readText(join(projectDir, rel))); } catch { continue; }
    for (const tLine of split(tText).filter(hasMarker)) {
      for (const pLine of pLines) {
        const got = capture(tLine, pLine);
        if (!got) continue;
        for (const n of SCALAR) if (n in got) votes[n].set(got[n], (votes[n].get(got[n]) ?? 0) + 1);
        break;
      }
    }
  }
  const w = Object.fromEntries(SCALAR.map((n) => [n, winner(votes[n])]));
  let panelStrings;
  try { panelStrings = JSON.parse(w.PANEL_OVERRIDES); } catch { /* left to the built-in texts */ }
  return {
    projectName: w.PROJECT_NAME, repo: w.REPO, language: forge.language, plainStyle: forge.plainStyle, mode: forge.mode, models: forge.models,
    memory: { workspace: w.MEM_WORKSPACE, project: w.MEM_PROJECT }, script: w.SPECIFY_SCRIPT, dashboardUrl: w.DASHBOARD_URL,
    langTag: w.LANG_TAG, panelStrings,
  };
}

// An edited line whose template line had a model or effort marker (developer, developerUi, critic, tester, aux, aux.model) and no longer has it: the edit
// froze what the setup answers used to choose, so it is flagged like project data.
const lostRole = (tLine, text) => [...(tLine ?? '').matchAll(/\{\{((?:developer|critic|tester|aux)[\w.]*)\}\}/g)].some((m) => !text.includes(m[0]));

// A common-word value (see unrender) that an added line holds more often than the template line it edits: it may be the name typed by
// hand, so it is flagged. findLeaks skips these values, since it would flag every "build" of a project called Build.
const strayCommon = (tLine, text, values, common) => [...common].some((n) => {
  const re = new RegExp(bounded(values[n]), 'gu');
  return (text.match(re) ?? []).length > ((tLine ?? '').replace(/\{\{[\w.]+\}\}/g, '\0').match(re) ?? []).length;
});

// A model line the pairing could not tie to a template line keeps the models as typed: flagged like the project name (roles = their filled-in texts).
function findLeaks(patch, answers, roles, skip) {
  const secrets = [answers.projectName, answers.repo, answers.memory?.workspace, answers.memory?.project, answers.dashboardUrl?.split('/').pop(), ...roles]
    .filter((s) => typeof s === 'string' && s.length >= 3 && !skip.includes(s)).map((s) => s.toLowerCase());
  const leaks = [];
  let file = '', header = false;
  for (const line of patch.split('\n')) {
    const d = /^diff --git a\/(.*) b\//.exec(line);
    if (d) { file = d[1]; header = true; continue; }
    if (line.startsWith('@@')) { header = false; continue; }
    if (header || !line.startsWith('+')) continue;
    const low = line.toLowerCase();
    if (secrets.some((s) => low.includes(s))) leaks.push({ file, line: line.slice(1) });
  }
  return leaks;
}

// The seam: project folder and package folder in, applicable patch (against <package>/templates) out. Nothing is written to either folder.
export async function sync(projectDir, packageDir, { answers } = {}) {
  const tplRoot = join(packageDir, 'templates');
  const templates = {};
  for (const rel of await filesOf(tplRoot)) templates[rel] = await readText(join(tplRoot, rel));
  const work = await mkdtemp(join(tmpdir(), 'forge-sync-work-'));
  try {
    const inferred = { ...(await inferAnswers(projectDir, templates)), ...answers };
    const { scaffold } = await import(pathToFileURL(join(packageDir, 'scripts', 'scaffold.mjs')).href);
    const rendered = join(work, 'rendered');
    try { await scaffold(inferred, { dest: rendered }); } catch (e) { throw new Error(`could not rebuild the answers of this project (${e.message}); pass them with --answers <file.json>`); }

    // marker values, learned from each template line and the same line rendered by the scaffold
    const values = {}, R = {};
    for (const [rel, tText] of Object.entries(templates)) {
      R[rel] = await readText(join(rendered, rel));
      const [tl, rl] = [split(tText), split(R[rel])];
      if (tl.length !== rl.length) throw new Error(`${rel}: a marker value spans lines, cannot map the file back`);
      tl.forEach((t, i) => { if (hasMarker(t) && t !== rl[i]) for (const [n, v] of Object.entries(capture(t, rl[i]) ?? {})) values[n] ??= v; });
    }

    // private values that are also everyday text of the templates: the word alone cannot tell the name from the template text
    const plain = Object.values(templates).join('\n').replace(/\{\{[\w.]+\}\}/g, '\0');
    const common = new Set(PRIVATE.filter((n) => values[n]?.length >= 3 && new RegExp(bounded(values[n]), 'u').test(plain)));
    const files = [], missing = [], flagged = [];
    for (const [rel, tText] of Object.entries(templates)) {
      let pText;
      try { pText = await readText(join(projectDir, rel)); } catch { missing.push(rel); continue; }
      if (pText === R[rel]) continue;
      const [tl, pl] = [split(tText), split(pText)];
      const out = [];
      let i = 0;
      for (const h of await hunks(R[rel], pText, work)) {
        out.push(...tl.slice(i, h.rStart));
        const added = pl.slice(h.pStart, h.pStart + h.pLen);
        const paired = pairs(split(R[rel]).slice(h.rStart, h.rStart + h.rLen), added);
        added.forEach((line, k) => {
          const tLine = paired.has(k) ? tl[h.rStart + paired.get(k)] : null;
          const text = unrender(line, tLine, values, common);
          out.push(text);
          if (lostRole(tLine, text) || strayCommon(tLine, text, values, common)) flagged.push({ file: rel, line: text });
        });
        i = h.rStart + h.rLen;
      }
      out.push(...tl.slice(i));
      for (const [side, text] of [['a', tText], ['b', out.join('\n') + (pText.endsWith('\n') && out.length ? '\n' : '')]]) {
        await mkdir(dirname(join(work, side, rel)), { recursive: true });
        await writeFile(join(work, side, rel), text);
      }
      files.push(rel);
    }
    const patch = files.length ? git(['diff', '--no-index', '--no-color', '--no-prefix', '--', 'a', 'b'], work) : '';
    const leaks = findLeaks(patch, inferred, ['developer', 'developerUi', 'critic', 'tester', 'aux'].map((r) => values[r]), [...common].map((n) => values[n]));
    for (const f of flagged) if (!leaks.some((l) => l.file === f.file && l.line === f.line)) leaks.push(f);
    return { patch, files, missing, leaks };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

const PKG = fileURLToPath(new URL('../', import.meta.url));
const USAGE = `usage: node sync.mjs --project <folder of the generated project> [--package <forge folder>] [--answers <file.json>] [--out <patch file>]
       Prints a patch that git apply accepts inside <package>/templates (run it there, after the user says yes).
       Nothing is applied and neither folder is modified. Exit 0: patch ready (or nothing to sync); 3: the patch may carry project data; 2: error.`;

export async function main(argv, write = (s) => process.stdout.write(s), warn = console.error) {
  let v;
  try {
    v = parseArgs({ args: argv, options: { project: { type: 'string' }, package: { type: 'string' }, answers: { type: 'string' }, out: { type: 'string' } } }).values;
    if (!v.project) throw new Error('--project is required');
  } catch (e) {
    warn(`${e.message}\n${USAGE}`);
    return 2;
  }
  try {
    const answers = v.answers ? JSON.parse(await readFile(v.answers, 'utf8')) : undefined;
    const { patch, files, missing, leaks } = await sync(resolve(v.project), resolve(v.package ?? PKG), { answers });
    warn(`forge sync: ${files.length} file(s) differ from the templates${files.length ? `: ${files.join(', ')}` : ''}`);
    if (missing.length) warn(`not in the project (skipped): ${missing.join(', ')}`);
    for (const l of leaks) warn(`WARNING possible project data in ${l.file}: ${l.line}`);
    if (leaks.length) warn('A flagged line holds project data, or a model/effort marker ({{developer}}, {{developerUi}}, {{critic}}, {{tester}}, {{aux}}) that the edit turned into a fixed value: restore the marker in the patch or revert the edit.');
    if (v.out) await writeFile(resolve(v.out), patch); else if (patch) write(patch);
    return leaks.length ? 3 : 0;
  } catch (e) {
    warn(`${e.message}\n${USAGE}`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
