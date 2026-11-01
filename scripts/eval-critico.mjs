// Recall and noise of a critic over the corpus scripts/corpus/critico/ (F-23b, #78). Only the standard library; it calls no agent and schedules nothing.
//   node scripts/eval-critico.mjs --verdicts <file.json>
// The file is {<case>: <verdict in the VERDICT schema of gauntlet-build.js>}. It prints
//   recall <a>/<b>   the defect cases with a blocking failure whose criterion is the one in expect.json (any blocking failure if expect.json has none)
//   noise <c>/<d>    the clean cases with at least one blocking failure
//   missing: <cases> the cases without a verdict (a defect counts as a miss, a clean one as noise)
// It exits 0 whenever it could measure; a call without --verdicts, or with a file that is not a JSON object, exits 2 and measures nothing.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const CORPUS = fileURLToPath(new URL('./corpus/critico/', import.meta.url));
const key = (c) => String(c).trim().toUpperCase();
const blockingOf = (v) => (v && Array.isArray(v.blocking) ? v.blocking : []);

const i = process.argv.indexOf('--verdicts');
if (i < 0 || !process.argv[i + 1]) { console.error('usage: node scripts/eval-critico.mjs --verdicts <file.json>'); process.exit(2); }
let verdicts;
try { verdicts = JSON.parse(readFileSync(process.argv[i + 1], 'utf8').replace(/^﻿/, '')); } catch (e) { console.error(`${process.argv[i + 1]}: ${e.message}`); process.exit(2); }
if (!verdicts || typeof verdicts !== 'object' || Array.isArray(verdicts)) { console.error('the verdicts file must be an object {<case>: <verdict>}'); process.exit(2); }

const cases = readdirSync(CORPUS).filter((n) => statSync(join(CORPUS, n)).isDirectory()).sort()
  .map((name) => ({ name, ...JSON.parse(readFileSync(join(CORPUS, name, 'expect.json'), 'utf8')) }));
const has = (c) => Object.hasOwn(verdicts, c.name) && verdicts[c.name] != null;
const defects = cases.filter((c) => c.kind === 'defect'), cleans = cases.filter((c) => c.kind === 'clean');
const found = (c) => has(c) && blockingOf(verdicts[c.name]).some((b) => !c.criterion || key(b && b.criterion) === key(c.criterion));
const noisy = (c) => !has(c) || blockingOf(verdicts[c.name]).length > 0;
console.log(`recall ${defects.filter(found).length}/${defects.length}`);
console.log(`noise ${cleans.filter(noisy).length}/${cleans.length}`);
const missing = cases.filter((c) => !has(c)).map((c) => c.name);
if (missing.length) console.log(`missing: ${missing.join(', ')}`);
