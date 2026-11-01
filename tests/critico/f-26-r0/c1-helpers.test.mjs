// Ronda −1 do F-26 (#101), C1: os helpers base() e soNoTicket(t, id) em repos git temporários.
// Oráculo: o próprio git do repo temporário (merge-base calculado aqui) e a mensagem exata da #101.
// Os helpers são copiados para tests/critico/_comum/ do repo temporário e importados por um node filho com o cwd lá, e assim
// tanto um helper que use o cwd como um que use a sua localização olham para o repo temporário.
// O filho corre sem GITHUB_HEAD_REF herdado; os casos que o querem põem-no à mão.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, cpSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ROOT, COMUM, tmp, apaga, gitOk, ambiente } from './helpers.mjs';

const ID = 'f-99';
const MSG = 'âmbito do f-99: fora da branch f-99*';

const temComum = () => {
  for (const f of ['base.mjs', 'ambito.mjs']) assert.ok(existsSync(join(ROOT, COMUM, f)), 'falta ' + COMUM + '/' + f);
};

// repo: um commit A em main; com `origem`, origin/main é um commit C que diverge do ramo (o merge-base é A, nunca a ponta de origin/main);
// depois o ramo pedido ganha um commit B; com `destacado`, o HEAD fica destacado nesse commit
const repo = (ramo, { origem = true, destacado = false } = {}) => {
  const d = tmp('critico-f26-c1-');
  cpSync(join(ROOT, COMUM), join(d, COMUM), { recursive: true });
  gitOk(d, 'init', '-q', '-b', 'main');
  writeFileSync(join(d, 'a.txt'), 'a\n');
  gitOk(d, 'add', '-A');
  gitOk(d, 'commit', '-q', '-m', 'A');
  const A = gitOk(d, 'rev-parse', 'HEAD').trim();
  let C = null;
  if (origem) {
    gitOk(d, 'checkout', '-q', '-b', 'tmp-origem');
    writeFileSync(join(d, 'c.txt'), 'c\n');
    gitOk(d, 'add', '-A');
    gitOk(d, 'commit', '-q', '-m', 'C');
    C = gitOk(d, 'rev-parse', 'HEAD').trim();
    gitOk(d, 'update-ref', 'refs/remotes/origin/main', C);
    gitOk(d, 'checkout', '-q', 'main');
    gitOk(d, 'branch', '-q', '-D', 'tmp-origem');
  }
  if (ramo !== 'main') gitOk(d, 'checkout', '-q', '-b', ramo);
  writeFileSync(join(d, 'b.txt'), 'b\n');
  gitOk(d, 'add', '-A');
  gitOk(d, 'commit', '-q', '-m', 'B');
  if (destacado) gitOk(d, 'checkout', '-q', '--detach', 'HEAD');
  return { d, A, C };
};

const filho = (d, codigo, env = {}) => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', codigo], { cwd: d, encoding: 'utf8', env: ambiente(env), timeout: 60000 });
  assert.equal(r.status, 0, 'o filho falhou: ' + r.stderr);
  return JSON.parse(r.stdout.trim().split(/\r?\n/).pop());
};
const url = (d, f) => JSON.stringify(pathToFileURL(join(d, COMUM, f)).href);
// soNoTicket com um contexto falso que regista as chamadas a skip
const ambito = (d, env) => filho(d, `const { soNoTicket } = await import(${url(d, 'ambito.mjs')});
const chamadas = []; const t = { skip: (m) => { chamadas.push(m); } };
const r = await soNoTicket(t, ${JSON.stringify(ID)});
console.log(JSON.stringify({ r: r === undefined ? null : r, chamadas }));`, env);
const base = (d) => filho(d, `const { base } = await import(${url(d, 'base.mjs')});
const r = await base(); console.log(JSON.stringify({ r: r === undefined ? 'undefined' : r }));`).r;

test('C1 soNoTicket: no ramo f-99-x com o id f-99 não faz skip e não devolve true', () => {
  temComum();
  const { d } = repo('f-99-x');
  try {
    const { r, chamadas } = ambito(d);
    assert.deepEqual(chamadas, [], 'fez skip no ramo do ticket');
    assert.notEqual(r, true);
  } finally { apaga(d); }
});

test('C1 soNoTicket: no ramo main faz t.skip com a mensagem exata da #101 e devolve true', () => {
  temComum();
  const { d } = repo('main');
  try {
    const { r, chamadas } = ambito(d);
    assert.deepEqual(chamadas, [MSG]);
    assert.equal(r, true);
  } finally { apaga(d); }
});

test('C1 soNoTicket: HEAD destacado (num commit do ramo f-99-x) conta como fora: skip com a mensagem e true', () => {
  temComum();
  const { d } = repo('f-99-x', { destacado: true });
  try {
    const { r, chamadas } = ambito(d);
    assert.deepEqual(chamadas, [MSG]);
    assert.equal(r, true);
  } finally { apaga(d); }
});

test('C1 soNoTicket: GITHUB_HEAD_REF ganha à branch local, nos dois sentidos', () => {
  temComum();
  const m = repo('main'), f = repo('f-99-x');
  try {
    const a = ambito(m.d, { GITHUB_HEAD_REF: 'f-99-pr' });
    assert.deepEqual(a.chamadas, [], 'local main, GITHUB_HEAD_REF=f-99-pr: fez skip');
    assert.notEqual(a.r, true);
    const b = ambito(f.d, { GITHUB_HEAD_REF: 'outra-coisa' });
    assert.deepEqual(b.chamadas, [MSG], 'local f-99-x, GITHUB_HEAD_REF=outra-coisa: não fez skip');
    assert.equal(b.r, true);
  } finally { apaga(m.d); apaga(f.d); }
});

test('C1 soNoTicket com o contexto real do node:test: o skip aparece no tap com o motivo', () => {
  temComum();
  const { d } = repo('main');
  try {
    writeFileSync(join(d, 'x.test.mjs'), `import test from 'node:test';
import { soNoTicket } from ${url(d, 'ambito.mjs')};
test('fora do ramo', (t) => { if (soNoTicket(t, ${JSON.stringify(ID)})) return; throw new Error('correu fora do ramo'); });
`);
    const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'x.test.mjs'], { cwd: d, encoding: 'utf8', env: ambiente(), timeout: 60000 });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(r.stdout.includes('# SKIP ' + MSG), 'o tap não traz «# SKIP ' + MSG + '»:\n' + r.stdout);
  } finally { apaga(d); }
});

test('C1 base(): devolve o sha completo de git merge-base HEAD origin/main (o A), não a ponta de origin/main', () => {
  temComum();
  const { d, A, C } = repo('f-99-x');
  try {
    assert.equal(gitOk(d, 'merge-base', 'HEAD', 'origin/main').trim(), A, 'o cenário não tem o merge-base esperado');
    const r = base(d);
    assert.equal(r, A);
    assert.notEqual(r, C);
  } finally { apaga(d); }
});

test('C1 base(): sem origin/main devolve null', () => {
  temComum();
  const { d } = repo('f-99-x', { origem: false });
  try {
    assert.equal(base(d), null);
  } finally { apaga(d); }
});