// Ronda −1 do F-20c (#72), C5: páginas de checkpoint (A5) e a invariante 9.
// Oráculos: (a) um repositório git temporário com as tags cp-0, cp-1 e cp-2 (e variantes) e o espião a responder 0 ou 1 ao read-page por caminho:
// todas presentes, cp-1 em falta, cp-1 e cp-3 em falta, sem tags; o argv e o AI_MEMORY_SERVER_URL de cada read-page; só as tags cp-*, também
// anotadas e em packed-refs (as tags do git, não os ficheiros de .git/refs/tags); (b) o texto literal do Verifies: da invariante 9 nos dois templates;
// (c) a linha `invariants` exige o span no item 9 dos dois ficheiros, em inglês e depois da tradução; (d) a mutação nova do corpus faz falhar a linha.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, L_CP, D_SEM_TAGS, D_FALTA, SPAN_9, VERIFIES_9, VERIFIES_9_ANTIGO, L_INV, MUTACAO_9, W, P, projeto, caixaCheck, ambiente, binFalso, AIM_OK, tomlLocal, correCheck, portaLivre, repo, git, workspaceProjeto, fwd, apaga } from './helpers.mjs';
import { generate } from '../f-01-r0/helpers.mjs';

const limpar = [];
after(() => { for (const f of limpar) f(); });
const pagina = (t) => 'checkpoints/' + t + '.md';

// cenário do --env: projeto gerado num repo git com as tags dadas; presentes = as tags com página; o resto do read-page responde 1
const cenario = async (tags, presentes, { pack = false } = {}) => {
  const proj = await projeto(), sb = caixaCheck();
  limpar.push(() => { apaga(proj); apaga(sb.dir); });
  const url = 'http://127.0.0.1:' + (await portaLivre());
  tomlLocal(proj, { serverUrl: url, dataDir: sb.dataDir, autostart: 'no' });
  repo(proj, join(sb.dir, 'githome'), tags);
  if (pack) git(proj, join(sb.dir, 'githome'), 'pack-refs', '--all');
  const readPages = { '_rules/framework.md': { code: 0, out: '# framework' } };
  for (const t of presentes) readPages[pagina(t)] = { code: 0, out: '# CP' };
  const bin = fwd(binFalso(join(sb.dir, 'bin', 'ai-memory.exe'), { ...AIM_OK('3.3.0', sb.dataDir), readPage: { code: 1, err: 'page not found' }, readPages }));
  const r = await correCheck(proj, ambiente(sb, { AI_MEMORY_BIN: bin }));
  const ls = r.linhas.filter((l) => /^(ok {4}|FAIL {2})/.test(l) && l.slice(6).startsWith(L_CP));
  assert.equal(ls.length, 1, `linhas «${L_CP}» no --env: ${JSON.stringify(ls)}\n${r.out.slice(0, 1500)}`);
  const cps = r.chamadas.filter((c) => c.fake && c.args.includes('read-page') && String(c.args[c.args.indexOf('--path') + 1]).startsWith('checkpoints/'));
  return { l: ls[0], cps, url, sb, proj };
};
const caminhos = (cps) => cps.map((c) => c.args[c.args.indexOf('--path') + 1]).sort();

test('C5 --env: as tags cp-0, cp-1 e cp-2 têm página: ok, com um read-page por tag, o argv do contrato e AI_MEMORY_SERVER_URL=<serverUrl>', async () => {
  const { l, cps, url, sb, proj } = await cenario(['cp-0', 'cp-1', 'cp-2'], ['cp-0', 'cp-1', 'cp-2']);
  const m = workspaceProjeto(proj);
  assert.deepEqual([m.workspace, m.project], [W, P]);
  assert.deepEqual(caminhos(cps), ['cp-0', 'cp-1', 'cp-2'].map(pagina));
  for (const c of cps) {
    const t = c.args[c.args.indexOf('--path') + 1];
    assert.deepEqual(c.args, ['--data-dir', sb.dataDir, 'read-page', '--path', t, '--workspace', W, '--project', P]);
    assert.equal(c.serverUrlEnv, url, 'o read-page corre sem AI_MEMORY_SERVER_URL=<serverUrl>');
  }
  assert.ok(l.startsWith('ok    ' + L_CP), 'não diz ok com as páginas todas: ' + l);
});

test('C5 --env: cp-1 sem página: FAIL (missing: cp-1)', async () => {
  const { l } = await cenario(['cp-0', 'cp-1', 'cp-2'], ['cp-0', 'cp-2']);
  assert.ok(l.startsWith('FAIL  ' + L_CP), 'não diz FAIL: ' + l);
  assert.ok(l.endsWith(' ' + D_FALTA(['cp-1'])), 'detalhe errado: ' + l);
});

test('C5 --env: cp-1 e cp-3 sem página: FAIL (missing: cp-1, cp-3)', async () => {
  const { l } = await cenario(['cp-0', 'cp-1', 'cp-2', 'cp-3'], ['cp-0', 'cp-2']);
  assert.ok(l.startsWith('FAIL  ' + L_CP), 'não diz FAIL: ' + l);
  assert.ok(l.endsWith(' ' + D_FALTA(['cp-1', 'cp-3'])), 'detalhe errado: ' + l);
});

test('C5 --env: sem tags cp-*: ok com o detalhe (no cp-* tags), sem nenhum read-page de checkpoints', async () => {
  const { l, cps } = await cenario([], []);
  assert.ok(l.startsWith('ok    ' + L_CP), 'não diz ok sem tags: ' + l);
  assert.ok(l.endsWith(' ' + D_SEM_TAGS), 'detalhe errado: ' + l);
  assert.deepEqual(cps, []);
});

test('C5 --env: só as tags cp-* contam (v1.0 e checkpoint-1 não pedem página)', async () => {
  const { l, cps } = await cenario(['v1.0', 'checkpoint-1', 'cp-0'], ['cp-0']);
  assert.ok(l.startsWith('ok    ' + L_CP), l);
  assert.deepEqual(caminhos(cps), [pagina('cp-0')]);
});

test('C5 --env: tags anotadas e em packed-refs contam como as outras (cp-1 em falta: FAIL)', async () => {
  const { l, cps } = await cenario(['a:cp-0', 'cp-1', 'a:cp-2'], ['cp-0', 'cp-2'], { pack: true });
  assert.deepEqual(caminhos(cps), ['cp-0', 'cp-1', 'cp-2'].map(pagina));
  assert.ok(l.startsWith('FAIL  ' + L_CP) && l.endsWith(' ' + D_FALTA(['cp-1'])), l);
});

// (b) o texto da invariante 9
const ler = (rel) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const item9 = (t) => t.split('\n').find((l) => l.startsWith('9. ')) ?? '';
test('C5 invariante 9: o Verifies: novo, byte a byte, uma vez no item 9 de templates/CLAUDE.md e de templates/AGENTS.md; o antigo sozinho saiu', () => {
  for (const f of ['templates/CLAUDE.md', 'templates/AGENTS.md']) {
    const t = ler(f), i9 = item9(t);
    assert.equal(t.split(VERIFIES_9).length - 1, 1, f + ': o Verifies: novo não aparece uma vez');
    assert.ok(i9.includes(VERIFIES_9), f + ': o Verifies: novo não está no item 9: ' + i9);
    assert.ok(!i9.endsWith(VERIFIES_9_ANTIGO), f + ': o item 9 ainda acaba no Verifies: antigo');
  }
  assert.equal(item9(ler('templates/AGENTS.md')), item9(ler('templates/CLAUDE.md')), 'o AGENTS.md não repete o item 9 byte a byte');
});

// (c) a linha invariants
const linhaInv = (r) => r.linhas.filter((l) => /^(ok {4}|FAIL {2})/.test(l) && l.slice(6).startsWith(L_INV));
const checkInv = async (proj, muda) => {
  if (muda) for (const [rel, f] of Object.entries(muda)) writeFileSync(join(proj, rel), f(readFileSync(join(proj, rel), 'utf8')));
  const sb = caixaCheck();
  limpar.push(() => apaga(sb.dir));
  const r = await correCheck(proj, ambiente(sb), { args: [] });
  const ls = linhaInv(r);
  assert.equal(ls.length, 1, 'linha invariants: ' + JSON.stringify(ls) + '\n' + r.out.slice(0, 1500));
  return ls[0];
};
const novo = async (over) => { const p = await generate(over); limpar.push(() => apaga(p)); return p; };
const tira9 = (t, f) => t.split(/\r?\n/).map((l) => (l.startsWith('9. ') ? f(l) : l)).join('\n');

test('C5 invariants: um projeto gerado em inglês passa a linha invariants com o Verifies: novo', async () => {
  const p = await novo();
  assert.ok(item9(readFileSync(join(p, 'CLAUDE.md'), 'utf8')).includes(SPAN_9), 'o CLAUDE.md gerado não tem o span no item 9');
  assert.ok((await checkInv(p)).startsWith('ok'), 'a linha invariants falha num projeto acabado de gerar');
});

for (const f of ['CLAUDE.md', 'AGENTS.md']) {
  test(`C5 invariants: o Verifies: antigo reposto só no ${f} faz falhar a linha invariants`, async () => {
    const p = await novo();
    const l = await checkInv(p, { [f]: (t) => t.replace(VERIFIES_9, VERIFIES_9_ANTIGO) });
    assert.ok(l.startsWith('FAIL'), 'a linha invariants não falha: ' + l);
  });
}

test('C5 invariants: o span mudado do item 9 para o item 10 (nos dois ficheiros) faz falhar a linha', async () => {
  const p = await novo();
  const muda = (t) => t.split(/\r?\n/).map((l) => (l.startsWith('9. ') ? l.replace(' and `node .claude/check.cjs --env` has the line ' + SPAN_9 + ' in ok', '') : l.startsWith('10. ') ? l + ' Also ' + SPAN_9 + '.' : l)).join('\n');
  const l = await checkInv(p, { 'CLAUDE.md': muda, 'AGENTS.md': muda });
  assert.ok(l.startsWith('FAIL'), 'a linha invariants aceita o span fora do item 9: ' + l);
});

test('C5 invariants: em português (tradução dos testes) o span sobrevive e a linha passa; sem ele no item 9, falha', async () => {
  const p = await novo({ projectName: 'Clube do Livro', language: 'Portuguese (Brazil)' });
  const t = readFileSync(join(p, 'CLAUDE.md'), 'utf8');
  assert.ok(item9(t).includes(SPAN_9), 'o span não sobreviveu à tradução: ' + item9(t));
  assert.ok((await checkInv(p)).startsWith('ok'), 'a linha invariants falha no projeto traduzido');
  const l = await checkInv(p, { 'CLAUDE.md': (x) => tira9(x, (i) => i.replace(SPAN_9, '')), 'AGENTS.md': (x) => tira9(x, (i) => i.replace(SPAN_9, '')) });
  assert.ok(l.startsWith('FAIL'), 'a linha invariants passa sem o span no item 9 (português): ' + l);
});

// (d) a mutação do corpus
test('C5 corpus: a mutação invariante-9-so-pela-tag.json repõe o Verifies: antigo e faz falhar a linha invariants', async () => {
  assert.ok(existsSync(join(ROOT, MUTACAO_9)), 'falta ' + MUTACAO_9);
  const m = JSON.parse(readFileSync(join(ROOT, MUTACAO_9), 'utf8').replace(/^\uFEFF/, ''));
  assert.equal(m.line, L_INV);
  assert.ok(['CLAUDE.md', 'AGENTS.md'].includes(m.file), 'file: ' + m.file);
  assert.ok(m.find.includes(SPAN_9), 'o find não tira o span novo: ' + m.find);
  assert.ok(m.replace.includes(VERIFIES_9_ANTIGO) && !m.replace.includes(SPAN_9), 'o replace não repõe o Verifies: antigo: ' + m.replace);
  const ans = JSON.parse(readFileSync(join(ROOT, 'scripts/corpus/answers', m.base + '.json'), 'utf8').replace(/^\uFEFF/, ''));
  const p = await novo(ans);
  const l = await checkInv(p, { [m.file]: (t) => { assert.ok(t.includes(m.find), 'o find não existe no ' + m.file + ' gerado'); return t.split(m.find).join(m.replace); } });
  assert.ok(l.startsWith('FAIL'), 'a mutação não faz falhar a linha invariants: ' + l);
});