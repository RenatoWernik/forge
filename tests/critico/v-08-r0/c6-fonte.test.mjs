// V-08 C6 (#132, RESPOSTA 1 do orquestrador, 6563556283): os 4 módulos procuram primeiro <raiz>/.claude/suites.json e <raiz>/.claude/mapa-suites.json
// e depois <raiz>/scripts/...; com os dois, ganha o .claude/ e a saída diz qual foi lido. No forge, sem .claude/suites.json, nada muda.
// Oráculos: um repo temporário com o desenho do forge (só scripts/) e um projeto gerado com os dois (scripts/ com uma suíte que falharia).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ROOT, MANIFESTO, MAPA, gerar, conjunto, preCondicao, repo, git, commita, escreve, tmp, ambiente, comSuites, suiteComando, correAteFim, resultado, fim } from './helpers.mjs';

const VERDE = "import { test } from 'node:test';\ntest('v1', () => {});\n";
const json = (o) => JSON.stringify(o, null, 2) + '\n';
const CAMPOS = { versao: 1, paralelo: 2, vagas_globais: 10, carga_sensivel: 3, orcamento_s: 120 };
const MAPA_TUDO = { versao: 1, regras: [{ caminhos: ['**'], suites: ['*'] }] };
const barra = (s) => s.replaceAll('\\', '/');

test('C6 (guarda): o forge não tem .claude/suites.json nem .claude/mapa-suites.json (o manifesto e o mapa do forge ficam em scripts/)', () => {
  for (const f of [MANIFESTO, MAPA]) assert.ok(!existsSync(join(ROOT, f)), `o forge ganhou ${f}`);
});

test('C6: num repo com o desenho do forge (só scripts/), o executor com --raiz e o afetadas({ raiz }) leem scripts/', async () => {
  for (const m of ['executor.mjs', 'afetadas.mjs']) assert.ok(existsSync(join(ROOT, 'scripts', m)), `scripts/${m} não existe`);
  const R = tmp('critico-v08-forja-');
  escreve(R, 'scripts/suites.json', json({ ...CAMPOS, suites: [{ nome: 'forja', tipo: 'node-test', ficheiros: ['t/*.test.mjs'] }] }));
  escreve(R, 'scripts/mapa-suites.json', json(MAPA_TUDO));
  escreve(R, 't/a.test.mjs', VERDE);
  escreve(R, '.gitignore', '.forge/\n');
  const sha = repo(R);
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/executor.mjs'), '--todas', '--raiz', R], { cwd: R, encoding: 'utf8', env: ambiente(), timeout: 300000 });
  assert.equal(r.status, 0, 'executor: código ' + r.status + fim({ out: (r.stdout || '') + (r.stderr || '') }));
  assert.equal(resultado(R, sha).suites?.forja?.estado, 'pass', 'a suíte forja de scripts/suites.json não correu');
  const { afetadas } = await import(pathToFileURL(join(ROOT, 'scripts/afetadas.mjs')).href);
  assert.ok(afetadas(['t/a.test.mjs'], { raiz: R }).suites.includes('forja'), 'afetadas({ raiz }) não seguiu o scripts/mapa-suites.json');
});

test('C6: num projeto gerado com .claude/ e scripts/, o executor e o afetadas do projeto leem o .claude/ e dizem-no na saída', async () => {
  const P = await gerar(await conjunto('en-plain-published'));
  preCondicao(P);
  escreve(P, 't/verde.test.mjs', VERDE);
  comSuites(P, [suiteComando('verde', 't/verde.test.mjs')]);
  escreve(P, 'scripts/suites.json', json({ ...CAMPOS, suites: [{ nome: 'errada', tipo: 'comando', comando: [process.execPath, '-e', 'process.exit(4)'], formato: 'codigo' }] }));
  escreve(P, 'scripts/mapa-suites.json', json({ versao: 1, regras: [{ caminhos: ['**'], suites: ['errada'] }] }));
  repo(P);
  git(P, 'checkout', '-q', '-b', 'ticket');
  escreve(P, 't/outro.txt', 'x\n');
  const sha = commita(P, 'ticket');
  const r = correAteFim(P, 'executor.mjs', ['--todas']);
  assert.equal(r.status, 0, `executor: código ${r.status}` + fim(r));
  const res = resultado(P, sha);
  assert.deepEqual(Object.keys(res.suites ?? {}), ['verde'], 'suítes corridas: ' + JSON.stringify(res.suites));
  assert.ok(barra(r.out).includes('.claude/suites.json'), 'a saída do executor não diz que leu o .claude/suites.json' + fim(r));
  const a = spawnSync(process.execPath, ['.claude/afetadas.mjs', '--base', 'main'], { cwd: P, encoding: 'utf8', env: ambiente(), timeout: 60000 });
  const out = barra((a.stdout || '') + (a.stderr || ''));
  assert.equal(a.status, 0, 'afetadas: código ' + a.status + fim({ out }));
  assert.match(out, /\bverde\b/, 'o afetadas do projeto não trouxe a suíte verde' + fim({ out }));
  assert.doesNotMatch(out, /\berrada\b/, 'o afetadas do projeto leu o scripts/' + fim({ out }));
  assert.ok(out.includes('.claude/mapa-suites.json'), 'a saída do afetadas não diz que leu o .claude/mapa-suites.json' + fim({ out }));
});