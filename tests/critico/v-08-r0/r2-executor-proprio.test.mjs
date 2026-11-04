// V-08, Ronda 2 (#132; RESPOSTA do orquestrador ao veredito da R1, ponto 2): o `avancar` e o `check-ticket` copiados para .claude/ usam sempre o executor da PRÓPRIA pasta,
// nunca o primeiro `scripts/executor.mjs` que acharem. Um projeto gerado com um scripts/executor.mjs próprio, falso (sai 0 sem correr nada), e uma suíte vermelha:
// o avancar sai com 1, abre a issue `regressao` e nunca diz «PÓS-MERGE VERDE»; o check-ticket dá FAIL. O gh é falso (uma cópia do node com um preload que só lê o JSON do cenário
// e regista o argv); o origin é um repo bare local. Sem rede, sem gh real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gerar, conjunto, preCondicao, tmp, escreve, comSuites, git, commita, repo, ambiente, correAteFim, fim } from './helpers.mjs';

const WIN = process.platform === 'win32';
const VERMELHA = [{ nome: 'projeto', tipo: 'comando', comando: [process.execPath, '-e', 'process.exit(1)'], formato: 'codigo', limite_s: 60 }];
const FALSO = "console.log('o executor proprio do projeto: nao correu nenhuma suite');\n";
const comPath = (dir) => { const k = Object.keys(process.env).find((x) => x.toUpperCase() === 'PATH') ?? 'PATH'; return { [k]: dir + delimiter + (process.env[k] ?? '') }; };

const ghFalsoComPr = () => {
  const d = tmp('critico-v08-ghpr-'), bin = join(d, WIN ? 'gh.exe' : 'gh'), pre = join(d, 'pre.cjs');
  copyFileSync(process.execPath, bin);
  if (!WIN) chmodSync(bin, 0o755);
  writeFileSync(pre, `const p = require('node:path'), fs = require('node:fs');
if (/^gh(\\.exe)?$/i.test(p.basename(process.execPath))) {
  const st = JSON.parse(fs.readFileSync(process.env.GHF, 'utf8')), argv = [p.basename(process.argv[1] ?? ''), ...process.argv.slice(2)];
  fs.appendFileSync(process.env.GHF + '.log', JSON.stringify(argv) + '\\n');
  const j = (o) => { process.stdout.write(JSON.stringify(o)); process.exit(0); };
  if (argv[0] === 'pr' && argv[1] === 'view') { if (argv[argv.indexOf('--json') + 1] === 'mergeCommit') j({ mergeCommit: { oid: st.squash } }); j(st.pr); }
  if (argv[0] === 'repo') j({ defaultBranchRef: { name: 'main' } });
  if (argv[0] === 'issue' && argv[1] === 'list') j([]);
  process.exit(0);
}
`);
  return { d, pre };
};

const cenario = async ({ proprio }) => {
  const P = await gerar(await conjunto('en-plain-published')), O = join(tmp('critico-v08-origin-'), 'o.git'), GHF = join(tmp('critico-v08-ghf-'), 'cenario.json');
  preCondicao(P);
  comSuites(P, VERMELHA);
  if (proprio) escreve(P, 'scripts/executor.mjs', FALSO);
  repo(P);
  git(P, 'checkout', '-q', '-b', 'int');
  escreve(P, 'a.txt', 'a\n');
  const squash = commita(P, 'squash');
  spawnSync('git', ['init', '-q', '--bare', O], { env: ambiente() });
  git(P, 'remote', 'add', 'origin', O);
  git(P, 'push', '-q', 'origin', 'main', 'int');
  const h = 'a'.repeat(40), s = 'b'.repeat(64), gh = ghFalsoComPr();
  writeFileSync(GHF, JSON.stringify({ squash, pr: { headRefOid: h, isDraft: false, baseRefName: 'int', state: 'OPEN', body: 'Closes #1',
    comments: [{ body: `VEREDITO: APROVADO\nHEAD: ${h}\nEXECUTOR: x.json ${s}` }, { body: `CHECK-TICKET: VERDE ${h} ${s}` }] } }));
  const r = spawnSync(process.execPath, ['.claude/avancar.mjs', '--pr', '1', '--repo', 'o/r', '--modo', 'projeto', '--integracao', 'int'],
    { cwd: P, encoding: 'utf8', timeout: 280000, windowsHide: true, env: ambiente({ ...comPath(gh.d), GHF, NODE_OPTIONS: `--require ${JSON.stringify(gh.pre)}` }) });
  const log = existsSync(GHF + '.log') ? readFileSync(GHF + '.log', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), issues: log.filter((a) => a[0] === 'issue' && a[1] === 'create').length,
    comentarios: log.filter((a) => a[0] === 'pr' && a[1] === 'comment').length };
};

test('R2-2: o avancar do projeto usa o .claude/executor.mjs: com um scripts/executor.mjs falso e uma suíte vermelha sai 1, abre a issue regressao e nunca comenta nem diz «PÓS-MERGE VERDE»; o controlo sem o falso dá o mesmo', async () => {
  const falso = await cenario({ proprio: true }), controlo = await cenario({ proprio: false });
  for (const [nome, c] of [['com o falso', falso], ['controlo', controlo]]) {
    assert.equal(c.status, 1, `${nome}: saída ${c.status}\n${c.out.slice(-800)}`);
    assert.doesNotMatch(c.out, /PÓS-MERGE VERDE/, `${nome}: disse VERDE sem correr as suítes`);
    assert.equal(c.issues, 1, `${nome}: a issue regressao não foi aberta`);
    assert.equal(c.comentarios, 0, `${nome}: comentou VERDE no PR`);
  }
});

test('R2-2: o check-ticket do projeto não é enganado por um scripts/executor.mjs falso: com uma suíte vermelha dá FAIL no ramo e no pós-merge, código 1', async () => {
  const P = await gerar(await conjunto('en-plain-published'));
  preCondicao(P);
  comSuites(P, VERMELHA);
  escreve(P, 'scripts/executor.mjs', FALSO);
  repo(P);
  git(P, 'checkout', '-q', '-b', 'ticket');
  escreve(P, 'a.txt', 'a\n');
  commita(P, 'ticket');
  const r = correAteFim(P, 'check-ticket.mjs', ['--ambito', '**', '--base', 'main']);
  assert.equal(r.status, 1, `código ${r.status}` + fim(r));
  for (const passo of ['afetadas no ramo', 'pós-merge']) assert.ok(r.out.split(/\r?\n/).some((l) => new RegExp(`^FAIL ${passo}\\b`).test(l)), `sem «FAIL ${passo}»` + fim(r));
});
