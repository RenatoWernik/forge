// F-20a critério 4: o projeto gerado. O scaffold copia `.claude/ai-memory.cjs` tal como está; sem --env o check.cjs não carrega o módulo;
// com --env e o módulo apagado, as linhas do ai-memory dão FAIL com `(.claude/ai-memory.cjs missing)` e o processo sai com 1, sem stack trace.
// Oráculos: todos os conjuntos de scripts/corpus/answers/ (cópia byte a byte e «All ok.» sem --env, com e sem o módulo); o dry run do scaffold
// lista o ficheiro. GUARDAS (verdes na base): o único assert antigo que pode mudar é a lista do dry run de scripts/scaffold.test.mjs, e os
// ataques de tests/critico/ que existiam na base ficam byte a byte.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, readdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { ROOT, BASE, MODULO, D_MODULO, STACK, caixa, ambiente, corre, linhasAim, loadScaffold, tmp, apaga, fwd } from './helpers.mjs';
import { translatePt } from '../f-01-r0/helpers.mjs';

const lixo = [];
after(() => lixo.forEach(apaga));
const CORPUS = join(ROOT, 'scripts/corpus/answers');
const SETS = readdirSync(CORPUS).filter((n) => n.endsWith('.json')).sort();
const PROSE = ['CLAUDE.md', 'AGENTS.md', 'FRAMEWORK.md', 'BOOTSTRAP.md', '.checkpoints/README.md'];
// o mesmo build de scripts/corpus.test.mjs: scaffold das respostas e, em português, o substituto da tradução
const gera = async (set) => {
  const { scaffold } = await loadScaffold();
  const dest = join(tmp('critico-f20a-corpus-'), 'p');
  lixo.push(dest);
  await scaffold(JSON.parse(readFileSync(join(CORPUS, set), 'utf8').replace(/^\uFEFF/, '')), { dest });
  const forge = JSON.parse(readFileSync(join(dest, '.claude/forge.json'), 'utf8').replace(/^\uFEFF/, ''));
  if (/^pt/i.test(forge.langTag)) for (const rel of [...PROSE, ...readdirSync(join(dest, '.claude/briefs')).map((f) => '.claude/briefs/' + f)]) writeFileSync(join(dest, rel), translatePt(readFileSync(join(dest, rel), 'utf8')));
  return dest;
};
const sb = caixa();
lixo.push(sb.dir);
const env = ambiente(sb);

test('C4 o corpus tem os 8 conjuntos de respostas (controlo do oráculo)', () => assert.ok(SETS.length >= 8, SETS.join(', ')));

for (const set of SETS) {
  test(`C4 ${set}: o scaffold copia .claude/ai-memory.cjs byte a byte, e o check.cjs sem --env acaba em «All ok.» com e sem o módulo`, async () => {
    const dest = await gera(set);
    const copia = join(dest, '.claude/ai-memory.cjs');
    assert.ok(existsSync(copia), 'o projeto gerado não tem .claude/ai-memory.cjs');
    assert.ok(readFileSync(copia).equals(readFileSync(MODULO)), 'a cópia não é igual, byte a byte, a templates/.claude/ai-memory.cjs');
    const r1 = await corre(dest, env, { args: [] });
    assert.equal(r1.status, 0, r1.out.slice(-1500));
    assert.match(r1.out, /All ok\./);
    rmSync(copia);
    const r2 = await corre(dest, env, { args: [] });
    assert.equal(r2.status, 0, 'sem o módulo, o check.cjs sem --env falhou:\n' + r2.out.slice(-1500));
    assert.match(r2.out, /All ok\./);
  });
}

test('C4 o dry run do scaffold lista .claude/ai-memory.cjs', async () => {
  const { scaffold } = await loadScaffold();
  const dest = tmp('critico-f20a-dry-');
  lixo.push(dest);
  const { files } = await scaffold(JSON.parse(readFileSync(join(CORPUS, SETS[0]), 'utf8').replace(/^\uFEFF/, '')), { dest, dryRun: true });
  assert.ok([...files].includes('.claude/ai-memory.cjs'), [...files].join(', '));
});

test('C4 sem --env o check.cjs não carrega o módulo: um ai-memory.cjs que deixa um canário e lança não é tocado («All ok.», sem canário)', async () => {
  const dest = await gera(SETS[0]);
  const canario = fwd(join(sb.dir, 'canario-modulo'));
  writeFileSync(join(dest, '.claude/ai-memory.cjs'), `require('fs').writeFileSync('${canario}', 'x'); throw new Error('critico: o módulo foi carregado')\n`);
  const r = await corre(dest, env, { args: [] });
  assert.equal(existsSync(canario), false, 'o check.cjs sem --env carregou .claude/ai-memory.cjs');
  assert.equal(r.status, 0, r.out.slice(-1500));
  assert.match(r.out, /All ok\./);
});

test('C4 com --env e o módulo apagado: as linhas do ai-memory dão FAIL com «(.claude/ai-memory.cjs missing)», o processo sai com 1, sem stack trace', async () => {
  const dest = await gera(SETS[0]);
  rmSync(join(dest, '.claude/ai-memory.cjs'), { force: true });
  const r = await corre(dest, env);
  assert.equal(r.status, 1, r.out.slice(-1500));
  const ls = linhasAim(r).filter((l) => !l.startsWith('info'));
  assert.ok(ls.length >= 1, 'nenhuma linha do ai-memory no --env:\n' + r.out.slice(0, 1500));
  assert.deepEqual(ls.filter((l) => !(l.startsWith('FAIL  ') && l.endsWith(' ' + D_MODULO))), [], 'linhas do ai-memory que não são FAIL com ' + D_MODULO);
  assert.ok(!STACK.test(r.out), 'stack trace no --env:\n' + r.out.slice(0, 2000));
});

// GUARDAS
const git = (...a) => { const r = spawnSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); if (r.status !== 0) throw new Error('git ' + a.join(' ') + ': ' + r.stderr); return r.stdout; };
const linhas = (s) => s.replace(/\r\n/g, '\n').split('\n');

test('GUARDA C4: scripts/scaffold.test.mjs mantém todas as linhas da base, pela mesma ordem (só se acrescenta; o assert autorizado é a lista do dry run)', () => {
  const antes = linhas(git('show', BASE + ':scripts/scaffold.test.mjs'));
  const agora = linhas(readFileSync(join(ROOT, 'scripts/scaffold.test.mjs'), 'utf8'));
  let j = 0;
  const perdidas = [];
  for (const l of antes) { const k = agora.indexOf(l, j); if (k < 0) perdidas.push(l); else j = k + 1; }
  assert.deepEqual(perdidas, [], 'linhas da base alteradas ou apagadas em scripts/scaffold.test.mjs');
  const novas = agora.length - antes.length;
  const lista = agora.slice(agora.findIndex((l) => l.includes('dry run lists the generated tree')), agora.findIndex((l) => l.includes("'FRAMEWORK.md',")) + 1);
  assert.ok(novas === 0 || lista.some((l) => l.trim() === "'.claude/ai-memory.cjs',"), 'linhas novas sem ser a do dry run');
});

test('GUARDA: os ataques de tests/critico/ que existiam na base ficam byte a byte (nunca se enfraquecem nem se apagam)', () => {
  const fs_ = git('ls-tree', '-r', '--name-only', BASE, 'tests/critico').split('\n').filter(Boolean);
  assert.ok(fs_.length > 50, 'controlo: ' + fs_.length);
  const mudados = fs_.filter((f) => { const p = join(ROOT, f); return !existsSync(p) || linhas(readFileSync(p, 'utf8')).join('\n') !== linhas(git('show', BASE + ':' + f)).join('\n'); });
  assert.deepEqual(mudados, []);
});