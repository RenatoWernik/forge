// V-08, Ronda 2 (#132; RESPOSTA do orquestrador ao veredito da R1, ponto 5, a pergunta à barra do C7): o campo opcional `prepara` do suites.json (um comando, texto ou lista)
// corre uma vez, antes das suítes, só com `--preparar`, e uma marca em .forge/ impede o `--continuar` de o repetir. O check-ticket e o avancar passam `--preparar` ao clone do
// pós-merge, nunca ao ramo. Falhar dá erro e código 1, a dizer `prepara`, sem correr as suítes. Corre sem os tokens.
// A dependência é local (`file:`), instalada e ignorada pelo git, sem rede: sem `prepara` o pós-merge do check-ticket dá FAIL a nomear a suíte; com ele, VERDE.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gerar, conjunto, preCondicao, repo, git, commita, escreve, comSuites, lerJson, ambiente, correAteFim, resultado, MANIFESTO, fim } from './helpers.mjs';

const PASSOS = ['árvore limpa', 'lint', 'âmbito', 'afetadas no ramo', 'pós-merge', 'esquema'];
const node = (...a) => [process.execPath, ...a];
const comPrepara = (P, prepara) => writeFileSync(join(P, MANIFESTO), JSON.stringify({ ...lerJson(join(P, MANIFESTO)), prepara }, null, 2) + '\n');
const exec = (P, ...args) => {
  const r = spawnSync(process.execPath, ['.claude/executor.mjs', ...args], { cwd: P, encoding: 'utf8', env: ambiente(), timeout: 200000, windowsHide: true });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
const vezes = (P) => (existsSync(join(P, '.forge/prepara-vezes.txt')) ? readFileSync(join(P, '.forge/prepara-vezes.txt'), 'utf8').split('\n').filter(Boolean).length : 0);

// um projeto com uma suíte e um `prepara` que conta as vezes que correu (.forge/ está no .gitignore do template)
const contador = async ({ suite, prepara = node('prep.cjs') }) => {
  const P = await gerar(await conjunto('en-plain-published'));
  preCondicao(P);
  escreve(P, 'prep.cjs', "require('node:fs').mkdirSync('.forge', { recursive: true }); require('node:fs').appendFileSync('.forge/prepara-vezes.txt', 'x\\n');\n");
  comSuites(P, [{ nome: 'projeto', tipo: 'comando', comando: suite, formato: 'codigo', limite_s: 120 }]);
  comPrepara(P, prepara);
  return { P, sha: repo(P) };
};

test('R2-5: sem --preparar o `prepara` não corre (o ramo); com --preparar corre uma vez, e um --continuar a seguir não o repete', async () => {
  const { P, sha } = await contador({ suite: node('-e', 'process.exit(0)') });
  let r = exec(P, '--todas');
  assert.equal(r.status, 0, r.out);
  assert.equal(vezes(P), 0, 'o prepara correu sem --preparar');
  r = exec(P, '--todas', '--preparar');
  assert.equal(r.status, 0, r.out);
  assert.equal(vezes(P), 1, 'o prepara devia ter corrido uma vez');
  r = exec(P, '--todas', '--preparar', '--continuar');
  assert.equal(r.status, 0, r.out);
  assert.equal(vezes(P), 1, 'o --continuar repetiu o prepara');
  assert.equal(resultado(P, sha).completo, true);
});

test('R2-5: um motor que morre a meio e é relançado com --continuar --preparar não repete o `prepara` (a marca em .forge/motor)', async () => {
  const { P } = await contador({ suite: node('-e', 'setTimeout(() => {}, 9000)') });
  let r = exec(P, '--todas', '--preparar', '--orcamento', '7');
  assert.equal(r.status, 3, 'a 1.ª chamada devia ficar incompleta (3): ' + r.out);
  assert.equal(vezes(P), 1);
  // o motor sai sozinho quando o ficheiro dele desaparece (depois dos primeiros 5 s): sem matar nada
  const motor = join(P, '.forge/motor');
  for (const f of readdirSync(motor).filter((n) => /-p1\.json$/.test(n) && !n.includes('prepara'))) rmSync(join(motor, f), { force: true });
  assert.ok(readdirSync(motor).some((n) => n.includes('prepara')), 'sem a marca do prepara em .forge/motor');
  r = exec(P, '--todas', '--preparar', '--continuar');
  assert.equal(r.status, 0, r.out);
  assert.equal(vezes(P), 1, 'o motor relançado repetiu o prepara');
});

test('R2-5: um `prepara` que falha dá erro e código 1, diz `prepara` e nenhuma suíte corre; o --continuar não o repete e dá o mesmo', async () => {
  const { P, sha } = await contador({ suite: node('-e', "require('node:fs').writeFileSync('.forge/suite-correu.txt', 'x')"), prepara: node('-e', "require('node:fs').mkdirSync('.forge', { recursive: true }); require('node:fs').appendFileSync('.forge/prepara-vezes.txt', 'x\\n'); process.exit(7)") });
  let r = exec(P, '--todas', '--preparar');
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /prepara/);
  assert.ok(!existsSync(join(P, '.forge/suite-correu.txt')), 'a suíte correu apesar de o prepara ter falhado');
  const u = resultado(P, sha).unidades;
  assert.ok(u.length && u.every((x) => x.estado === 'erro' && /prepara/.test(x.motivo ?? '')), 'unidades: ' + JSON.stringify(u));
  r = exec(P, '--todas', '--preparar', '--continuar');
  assert.equal(r.status, 1, r.out);
  assert.equal(vezes(P), 1, 'o --continuar repetiu o prepara falhado');
});

test('R2-5: o `prepara` é um comando: texto ou lista; um comando inexistente ou mal formado é erro (código 1 ou 2), nunca o motor morto nem um verde', async () => {
  const { P } = await contador({ suite: node('-e', 'process.exit(0)'), prepara: ['comando-que-nao-existe-xyz'] });
  let r = exec(P, '--todas', '--preparar');
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /prepara/);
  comPrepara(P, 7);
  commita(P, 'prepara invalido');
  r = exec(P, '--todas', '--preparar');
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /prepara/);
});

// ---------- o C7 com dependências ----------
const comDependencia = async (prepara) => {
  const P = await gerar(await conjunto('en-plain-published'));
  preCondicao(P);
  escreve(P, 'deps/dep/package.json', JSON.stringify({ name: 'dep', version: '1.0.0', main: 'index.js' }));
  escreve(P, 'deps/dep/index.js', "module.exports = 'dep-ok';\n");
  escreve(P, 'package.json', JSON.stringify({ name: 'proj', version: '1.0.0', private: true, dependencies: { dep: 'file:deps/dep' } }));
  escreve(P, 't.cjs', "if (require('dep') !== 'dep-ok') process.exit(1);\nconsole.log('dep carregada');\n");
  writeFileSync(join(P, '.gitignore'), readFileSync(join(P, '.gitignore'), 'utf8') + '\nnode_modules/\n');
  comSuites(P, [{ nome: 'projeto', tipo: 'comando', comando: node('t.cjs'), formato: 'codigo', limite_s: 60 }]);
  comPrepara(P, prepara);
  const i = spawnSync('npm install --offline --no-audit --no-fund', { cwd: P, shell: true, encoding: 'utf8', env: ambiente(), timeout: 120000, windowsHide: true });
  assert.equal(i.status, 0, 'npm install --offline: ' + (i.stdout || '') + (i.stderr || ''));
  repo(P);
  git(P, 'checkout', '-q', '-b', 'ticket');
  escreve(P, 'a.txt', 'a\n');
  commita(P, 'ticket');
  return P;
};
const linhas = (out) => out.split(/\r?\n/);

test('R2-5 (C7): num projeto com uma dependência instalada e ignorada, sem `prepara` o pós-merge dá FAIL a nomear a suíte (o ramo dá ok); com `prepara` o ticket limpo dá VERDE (6 linhas ok)', async () => {
  const sem = await comDependencia('');
  const a = correAteFim(sem, 'check-ticket.mjs', ['--ambito', '**', '--base', 'main']);
  assert.equal(a.status, 1, `sem prepara: código ${a.status}` + fim(a));
  assert.ok(linhas(a.out).some((l) => /^ok afetadas no ramo\b/.test(l)), 'o ramo devia dar ok' + fim(a));
  assert.ok(linhas(a.out).some((l) => /^FAIL pós-merge\b.*projeto/.test(l)), 'o pós-merge devia nomear a suíte' + fim(a));
  // R3 (RESPOSTA 9:53): a linha nomeia a causa provável, e termina com a dica
  assert.ok(linhas(a.out).some((l) => /^FAIL pós-merge \(.*projeto.* ; o ramo passou e o manifesto não tem prepara: faltam dependências no clone\?\)$/.test(l)), 'o pós-merge devia dizer que o ramo passou e que o manifesto não tem prepara' + fim(a));
  const com = await comDependencia('npm install --offline --no-audit --no-fund');
  const b = correAteFim(com, 'check-ticket.mjs', ['--ambito', '**', '--base', 'main']);
  assert.equal(b.status, 0, `com prepara: código ${b.status}` + fim(b));
  for (const p of PASSOS) assert.ok(linhas(b.out).some((l) => new RegExp(`^ok ${p}(\\s|$)`).test(l)), `sem «ok ${p}»` + fim(b));
});

test('R2-5 (C7): num projeto com dependências, um `prepara` que falha dá FAIL no pós-merge a dizer prepara; o ramo, que não o corre, dá ok', async () => {
  const P = await comDependencia(node('-e', 'process.exit(7)'));
  const r = correAteFim(P, 'check-ticket.mjs', ['--ambito', '**', '--base', 'main']);
  assert.equal(r.status, 1, `código ${r.status}` + fim(r));
  assert.ok(linhas(r.out).some((l) => /^ok afetadas no ramo\b/.test(l)), 'o ramo devia dar ok' + fim(r));
  assert.ok(linhas(r.out).some((l) => /^FAIL pós-merge\b.*prepara/.test(l)), 'o pós-merge devia dizer prepara' + fim(r));
  // R3: com `prepara` a causa é outra, a dica não aparece
  assert.ok(!r.out.includes('o manifesto não tem prepara'), 'um projeto com prepara mostrou a dica de falta de prepara' + fim(r));
});
