// V-01 critério C6 (cobertura do manifesto) e os ficheiros novos do ticket: os nomes de scripts/suites.json são as pastas de tests/critico/
// com *.test.mjs, mais a `scripts`; cada suíte casa exatamente os *.test.mjs da sua pasta (uma suíte que não corre nada é um falso verde,
// risco 1 da spec); e o manifesto traz o que o ticket fixa (spec §4.1 e risco 2): o f-14 exclusivo e de concorrência 1, o f-12 com o
// USERPROFILE real e as 10 suítes sensíveis ao tempo. O .gitignore leva o .forge/.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, globSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, MANIFESTO, lerJson, gitOk, git, limpa } from './helpers.mjs';

after(limpa);

const CRITICO = join(ROOT, 'tests/critico');
const pastas = () => readdirSync(CRITICO, { withFileTypes: true })
  .filter((e) => e.isDirectory() && readdirSync(join(CRITICO, e.name)).some((n) => n.endsWith('.test.mjs'))).map((e) => e.name);
const manifesto = () => { assert.ok(existsSync(MANIFESTO), 'falta scripts/suites.json'); return lerJson(MANIFESTO); };
const casados = (s) => [...new Set((s.ficheiros || []).flatMap((g) => globSync(g, { cwd: ROOT }).map((f) => f.replaceAll('\\', '/'))))].sort();
const testesDe = (dir) => readdirSync(join(ROOT, dir)).filter((n) => n.endsWith('.test.mjs')).map((n) => `${dir}/${n}`).sort();
const SENSIVEIS = ['scripts', 'f-02-r0', 'f-06-r0', 'f-10-r0', 'f-14-r0', 'f-20b-r0', 'f-24-r0', 'f-24-r1', 'f-12-r0', 'f-21a-r0'];

test('C6: os nomes de scripts/suites.json são as pastas de tests/critico/ com *.test.mjs, mais a scripts (uma a mais ou a menos dá FAIL com o nome)', () => {
  const nomes = manifesto().suites.map((s) => s.nome);
  const esperado = new Set([...pastas(), 'scripts']);
  const repetidos = nomes.filter((n, i) => nomes.indexOf(n) !== i);
  const aMais = nomes.filter((n) => !esperado.has(n));
  const emFalta = [...esperado].filter((n) => !nomes.includes(n));
  assert.deepEqual({ aMais, emFalta, repetidos }, { aMais: [], emFalta: [], repetidos: [] });
});

test('C6: cada suíte do manifesto casa exatamente os *.test.mjs da sua pasta (a scripts, os de scripts/), e nenhum fica de fora', () => {
  const erros = [];
  for (const s of manifesto().suites) {
    const dir = s.nome === 'scripts' ? 'scripts' : `tests/critico/${s.nome}`;
    if (!existsSync(join(ROOT, dir))) continue;
    if (s.tipo !== 'node-test') { erros.push(`${s.nome}: tipo ${s.tipo}`); continue; }
    const a = casados(s), e = testesDe(dir);
    const fora = e.filter((f) => !a.includes(f)), alheios = a.filter((f) => !e.includes(f));
    if (fora.length || alheios.length) erros.push(`${s.nome}: não corre [${fora.join(', ')}]; corre fora da pasta [${alheios.join(', ')}]`);
  }
  assert.deepEqual(erros, []);
});

test('manifesto (#125, spec §4.1): versão 1, orcamento_s ≤ 500, todo limite_s cabe no orçamento, f-14 exclusiva e de concorrência 1, f-12 com USERPROFILE @real e as 10 sensíveis ao tempo', () => {
  const m = manifesto();
  assert.equal(m.versao, 1);
  for (const k of ['paralelo', 'vagas_globais', 'carga_sensivel', 'orcamento_s']) assert.ok(Number.isInteger(m[k]) && m[k] > 0, `${k}: ${m[k]}`);
  assert.ok(m.orcamento_s <= 500, `orcamento_s ${m.orcamento_s} > 500: uma chamada pode passar dos 540 s`);
  const por = Object.fromEntries(m.suites.map((s) => [s.nome, s]));
  const grandes = m.suites.filter((s) => s.limite_s !== undefined && !(s.limite_s > 0 && s.limite_s <= m.orcamento_s)).map((s) => `${s.nome}: ${s.limite_s}`);
  assert.deepEqual(grandes, [], 'limite_s que nunca cabe no orcamento_s (a unidade nunca arrancava)');
  assert.equal(por['f-14-r0']?.exclusiva, true, 'f-14-r0 não é exclusiva');
  assert.equal(por['f-14-r0']?.concorrencia, 1, 'f-14-r0 sem concorrência 1');
  assert.equal(por['f-12-r0']?.env?.USERPROFILE, '@real', 'f-12-r0 sem USERPROFILE @real');
  assert.deepEqual(SENSIVEIS.filter((n) => por[n]?.sensivel_ao_tempo !== true), [], 'suítes da spec (risco 2) sem sensivel_ao_tempo');
});

test('o .gitignore ignora .forge/ (os resultados nunca entram no git)', () => {
  const linhas = existsSync(join(ROOT, '.gitignore')) ? readFileSync(join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/).map((l) => l.trim()) : [];
  assert.ok(linhas.includes('.forge/'), 'o .gitignore não tem a linha .forge/');
  assert.equal(git(ROOT, 'check-ignore', '-q', '.forge/resultados/x.json').status, 0, '.forge/resultados/x.json não é ignorado');
  assert.equal(gitOk(ROOT, 'ls-files', '.forge').trim(), '', 'há ficheiros de .forge/ no git');
});