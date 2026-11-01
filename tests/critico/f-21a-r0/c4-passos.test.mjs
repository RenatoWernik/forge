// F-21a critério 4: os passos que correm o grafo, no BOOTSTRAP.md (passo 4), no FRAMEWORK.md (§5 Step 4 e Step 7, §7 Graphify) e na invariante 9
// do CLAUDE.md e do AGENTS.md; e o scaffold copia .claude/graph.mjs.
// Oráculos (corpo da issue): as contagens de texto (`node .claude/graph.mjs update` 1× no passo 4 do BOOTSTRAP e 1× em cada um dos Steps 4 e 7;
// `node .claude/graph.mjs docs` 1× no Step 4, sem contar o `docs --mark`; `--mark` 1× no Step 4; «Without production code (CP0» 0×); o span na
// invariante 9 dos dois ficheiros; o corpus inteiro com «All ok.» e as linhas `bootstrap: args` em ok; o dry run e a cópia do scaffold.
// A ordem dentro de cada passo vem das palavras «depois de», «antes de a correr» e «no fim» do contrato.
// GUARDAS (verdes na base): o único assert autorizado é a lista do dry run de scripts/scaffold.test.mjs, que só ganha `.claude/graph.mjs`; as
// linhas dos scripts/*.test.mjs e os ataques de tests/critico/ da base ficam. A base é o merge-base com origin/main; quando o F-21a já lá está,
// as guardas de «só isto» deixam de se aplicar (um ticket futuro pode ter a sua própria autorização).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { ROOT, BASE, GRAPH, CMD_UPDATE, CMD_DOCS, L_FRESCA, loadScaffold, caixa, apaga, tmp, checkCjs } from './helpers.mjs';
import { translatePt } from '../f-01-r0/helpers.mjs';

const lixo = [];
after(() => lixo.forEach(apaga));
const sb = caixa();
lixo.push(sb.dir);
const T = (rel) => readFileSync(join(ROOT, 'templates', rel), 'utf8').replace(/\r\n/g, '\n');
const conta = (s, lit) => s.split(lit).length - 1;
const contaDocs = (s) => (s.match(/node \.claude\/graph\.mjs docs(?! --mark)/g) ?? []).length;
const SPAN = '`' + L_FRESCA + '`';
// a secção que começa no título dado e acaba no título seguinte do mesmo nível ou acima
const seccao = (texto, titulo) => {
  const ls = texto.split('\n');
  const i = ls.findIndex((l) => l.startsWith(titulo));
  assert.ok(i >= 0, 'título não encontrado: ' + titulo);
  const nivel = titulo.match(/^#+/)[0].length;
  const j = ls.findIndex((l, k) => k > i && /^#+ /.test(l) && l.match(/^#+/)[0].length <= nivel);
  return ls.slice(i, j < 0 ? undefined : j).join('\n');
};

test('C4 BOOTSTRAP.md passo 4: `node .claude/graph.mjs update` 1×, depois de `graphify claude install`; o «Done when» cita `Graphify: graph.json built at HEAD`', () => {
  const linha = T('BOOTSTRAP.md').split('\n').filter((l) => /^\| 4 \|/.test(l));
  assert.equal(linha.length, 1, 'a linha do passo 4 na tabela do BOOTSTRAP');
  const l = linha[0];
  assert.equal(conta(l, CMD_UPDATE), 1, 'contagem de «' + CMD_UPDATE + '» no passo 4');
  assert.ok(l.indexOf(CMD_UPDATE) > l.indexOf('graphify claude install') && l.includes('graphify claude install'), 'o update não vem depois de `graphify claude install`');
  const celulas = l.split('|').map((c) => c.trim());
  const feito = celulas[celulas.length - 2];
  assert.ok(feito.includes(SPAN), 'o «Done when» do passo 4 não cita ' + SPAN + ': ' + feito);
  assert.ok(feito.includes('Graphify: post-commit and post-checkout hooks installed'), 'GUARDA: o «Done when» perdeu a linha dos hooks');
});

test('C4 FRAMEWORK.md: a frase «Without production code (CP0» aparece 0 vezes', () => {
  assert.equal(conta(T('FRAMEWORK.md'), 'Without production code (CP0'), 0);
});

test('C4 FRAMEWORK.md §5 Step 4: update 1×, docs 1×, --mark 1×; docs antes de `/graphify . --update`, que vem antes do --mark; a nota `info` no painel', () => {
  const s = seccao(T('FRAMEWORK.md'), '### Step 4.');
  assert.equal(conta(s, CMD_UPDATE), 1, 'contagem de «' + CMD_UPDATE + '»');
  assert.equal(contaDocs(s), 1, 'contagem de «' + CMD_DOCS + '» (sem o --mark)');
  assert.equal(conta(s, '--mark'), 1, 'contagem de «--mark»');
  assert.ok(s.includes(CMD_DOCS + ' --mark'), 'o --mark não é `' + CMD_DOCS + ' --mark`');
  const iDocs = s.search(/node \.claude\/graph\.mjs docs(?! --mark)/), iLlm = s.indexOf('/graphify . --update'), iMark = s.indexOf(CMD_DOCS + ' --mark');
  assert.ok(iLlm >= 0, 'GUARDA: a passagem `/graphify . --update` saiu do Step 4');
  assert.ok(iDocs < iLlm && iLlm < iMark, `ordem: docs ${iDocs}, /graphify ${iLlm}, --mark ${iMark}`);
  assert.match(s, /\binfo\b/, 'o Step 4 não diz que se regista uma nota `info` com a linha do docs');
});

test('C4 FRAMEWORK.md §5 Step 7: no «Yes», `node .claude/graph.mjs update` 1× e depois de `git tag cp-N`', () => {
  const s = seccao(T('FRAMEWORK.md'), '### Step 7.');
  assert.equal(conta(s, CMD_UPDATE), 1, 'contagem de «' + CMD_UPDATE + '» no Step 7');
  const sim = s.split('\n').filter((l) => /^- Yes:/.test(l));
  assert.equal(sim.length, 1, 'a linha «- Yes:» do Step 7');
  assert.ok(sim[0].includes('git tag cp-N') && sim[0].indexOf(CMD_UPDATE) > sim[0].indexOf('git tag cp-N'), 'o update não vem depois de `git tag cp-N` no «Yes»: ' + sim[0]);
});

test('C4 FRAMEWORK.md §7 Graphify: a passagem sobre os docs gasta a quota da sessão, medida com `node .claude/graph.mjs docs`', () => {
  const s7 = seccao(T('FRAMEWORK.md'), '## 7.');
  const i = s7.indexOf('**Graphify**');
  assert.ok(i >= 0, 'o bloco **Graphify** da §7');
  const g = s7.slice(i);
  assert.ok(contaDocs(g) >= 1, 'o bloco Graphify da §7 não cita `' + CMD_DOCS + '`');
  assert.match(g, /quota/i, 'o bloco Graphify da §7 não fala da quota');
});

test('C4 invariante 9: o `Verifies:` cita `Graphify: graph.json built at HEAD` e continua a citar a tag, igual no CLAUDE.md e no AGENTS.md', () => {
  const nove = (f) => { const ls = T(f).split('\n').filter((l) => /^9\. /.test(l)); assert.equal(ls.length, 1, 'a invariante 9 de ' + f); return ls[0]; };
  const c = nove('CLAUDE.md'), a = nove('AGENTS.md');
  const v = c.slice(c.indexOf('Verifies:'));
  assert.ok(c.includes('Verifies:') && v.includes(SPAN), 'o Verifies: da invariante 9 não cita ' + SPAN + ': ' + c);
  assert.ok(v.includes('`git tag --list "cp-*"`'), 'GUARDA: o Verifies: perdeu a tag');
  assert.equal(a, c, 'a invariante 9 difere entre o CLAUDE.md e o AGENTS.md');
});

// O scaffold e o corpus
const CORPUS = join(ROOT, 'scripts/corpus/answers');
const SETS = readdirSync(CORPUS).filter((n) => n.endsWith('.json')).sort();
const PROSE = ['CLAUDE.md', 'AGENTS.md', 'FRAMEWORK.md', 'BOOTSTRAP.md', '.checkpoints/README.md'];
const respostas = (set) => JSON.parse(readFileSync(join(CORPUS, set), 'utf8').replace(/^\uFEFF/, ''));
// o mesmo build de scripts/corpus.test.mjs: scaffold das respostas e, em português, o substituto da tradução
const gera = async (set) => {
  const { scaffold } = await loadScaffold();
  const dest = join(tmp('critico-f21a-corpus-'), 'p');
  lixo.push(join(dest, '..'));
  await scaffold(respostas(set), { dest });
  const forge = JSON.parse(readFileSync(join(dest, '.claude/forge.json'), 'utf8').replace(/^\uFEFF/, ''));
  if (/^pt/i.test(forge.langTag)) for (const rel of [...PROSE, ...readdirSync(join(dest, '.claude/briefs')).map((f) => '.claude/briefs/' + f)]) writeFileSync(join(dest, rel), translatePt(readFileSync(join(dest, rel), 'utf8')));
  return dest;
};

test('C4 o corpus tem os 8 conjuntos de respostas (controlo do oráculo)', () => assert.ok(SETS.length >= 8, SETS.join(', ')));

test('C4 o dry run do scaffold lista .claude/graph.mjs', async () => {
  const { scaffold } = await loadScaffold();
  const dest = tmp('critico-f21a-dry-');
  lixo.push(dest);
  const { files } = await scaffold(respostas(SETS[0]), { dest, dryRun: true });
  assert.ok([...files].includes('.claude/graph.mjs'), [...files].join(', '));
});

for (const set of SETS) {
  test(`C4 ${set}: o scaffold copia .claude/graph.mjs byte a byte; o check.cjs sem --env acaba em «All ok.» com as linhas «bootstrap: args» em ok`, async () => {
    const dest = await gera(set);
    const copia = join(dest, '.claude/graph.mjs');
    assert.ok(existsSync(copia), 'o projeto gerado não tem .claude/graph.mjs');
    assert.ok(readFileSync(copia).equals(readFileSync(GRAPH)), 'a cópia não é igual, byte a byte, a templates/.claude/graph.mjs');
    const r = checkCjs(dest, sb, []);
    assert.equal(r.status, 0, r.out.slice(-2000));
    assert.match(r.out, /All ok\./);
    const args = r.out.split(/\r?\n/).filter((l) => /^(ok {4}|FAIL {2})bootstrap: args/.test(l));
    assert.ok(args.length >= 4, 'linhas bootstrap: args: ' + args.length + '\n' + r.out.slice(-2000));
    assert.deepEqual(args.filter((l) => !l.startsWith('ok    ')), []);
  });
}

// GUARDAS
const git = (...a) => { const r = spawnSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); if (r.status !== 0) throw new Error('git ' + a.join(' ') + ': ' + r.stderr); return r.stdout; };
const MB = (() => { try { return git('merge-base', 'HEAD', 'origin/main').trim(); } catch { return BASE; } })();
const linhas = (s) => s.replace(/\r\n/g, '\n').split('\n');
const LINHA_AUT = "'.claude/graph.mjs',";
const F21A_NA_BASE = linhas(git('show', MB + ':scripts/scaffold.test.mjs')).some((l) => l.trim() === LINHA_AUT);
// as linhas de «agora» que não casam, pela ordem, com as da base (subsequência gulosa); e as da base que se perderam
const compara = (antes, agora) => {
  let j = 0;
  const perdidas = [], novas = [];
  for (const l of antes) { const k = agora.indexOf(l, j); if (k < 0) perdidas.push(l); else { novas.push(...agora.slice(j, k)); j = k + 1; } }
  return { perdidas, novas: [...novas, ...agora.slice(j)] };
};

test('GUARDA C4: os scripts/*.test.mjs da base mantêm todas as linhas, pela mesma ordem; a lista do dry run de scaffold.test.mjs só ganha `.claude/graph.mjs`', { skip: F21A_NA_BASE && 'o F-21a já está na base ' + MB }, () => {
  const fs_ = git('ls-tree', '--name-only', MB, 'scripts/').split('\n').filter((f) => f.endsWith('.test.mjs'));
  assert.ok(fs_.length >= 10, 'controlo: ' + fs_.length);
  for (const f of fs_) {
    const p = join(ROOT, f);
    assert.ok(existsSync(p), f + ' foi apagado');
    const { perdidas } = compara(linhas(git('show', MB + ':' + f)), linhas(readFileSync(p, 'utf8')));
    assert.deepEqual(perdidas, [], 'linhas da base alteradas ou apagadas em ' + f);
  }
  const agora = linhas(readFileSync(join(ROOT, 'scripts/scaffold.test.mjs'), 'utf8'));
  const antes = linhas(git('show', MB + ':scripts/scaffold.test.mjs'));
  const bloco = (ls) => { const i = ls.findIndex((l) => l.includes('dry run lists the generated tree')); const j = ls.findIndex((l, k) => k > i && l.includes('].sort());')); return ls.slice(i, j + 1); };
  const { novas } = compara(bloco(antes), bloco(agora));
  assert.deepEqual(novas.filter((l) => l.trim() !== LINHA_AUT), [], 'linhas novas na lista do dry run além de ' + LINHA_AUT);
});

test('GUARDA: os ataques de tests/critico/ da base ficam byte a byte (nunca se enfraquecem nem se apagam)', () => {
  const fs_ = git('ls-tree', '-r', '--name-only', MB, 'tests/critico').split('\n').filter(Boolean);
  assert.ok(fs_.length > 50, 'controlo: ' + fs_.length);
  const mudados = fs_.filter((f) => { const p = join(ROOT, f); return !existsSync(p) || linhas(readFileSync(p, 'utf8')).join('\n') !== linhas(git('show', MB + ':' + f)).join('\n'); });
  assert.deepEqual(mudados, []);
});