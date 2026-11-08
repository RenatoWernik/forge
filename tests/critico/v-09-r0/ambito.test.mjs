// V-09: âmbito (corpo da #133). Reprova: «enfraquecer uma regra atual do processo instalado»; C4 «sem alterações»; C2 «nenhum texto novo autoriza
// merge»; C1 «cada regra nova». Todos comparam com base() (o merge-base com origin/main, regra 8) e só correm na branch do ticket (regra 9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, EN, PT, NO_MERGE, LITERAIS, base, soNoTicket, loadCorpus, conjunto, gerar, pacoteDaBase, textos, check, mesma, aplicaMutacao, fim } from './helpers.mjs';

const gitRoot = (...a) => { const r = spawnSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }); assert.equal(r.status, 0, 'git ' + a.join(' ') + ': ' + r.stderr); return r.stdout; };
const pre = (t) => { const b = base(); if (!b) t.skip('sem origin/main'); return b; };
const muts = await loadCorpus('mutations');

test('ÂMBITO: nenhum ataque de outro ticket (tests/critico/* fora de v-09-r0) mudou nem foi apagado (C4)', (t) => {
  if (soNoTicket(t, 'v-09')) return;
  const b = pre(t);
  if (!b) return;
  // Única exceção, autorizada por escrito pelo orquestrador na #133: o MAX_NEW do f-06 C8 passa de 10 para 12 (as 4 mutações de brief que o V-09 exige). Qualquer outro ficheiro antigo continua a reprovar.
  const mudou = gitRoot('diff', '--name-status', b, '--', 'tests/critico').split(/\r?\n/).filter(Boolean).filter((l) => !/^\S+\s+tests\/critico\/v-09-r0\//.test(l) && !/^M\s+tests\/critico\/f-06-r0\/c8-corpus-mutacoes\.test\.mjs$/.test(l));
  assert.deepEqual(mudou, [], 'ataques antigos alterados ou apagados');
});

test('ÂMBITO: os scripts/*.test.mjs não perdem nenhuma linha, e o corpus de mutações só ganha ficheiros (C4)', (t) => {
  if (soNoTicket(t, 'v-09')) return;
  const b = pre(t);
  if (!b) return;
  const perdem = gitRoot('diff', '--numstat', b, '--', 'scripts/*.test.mjs').split(/\r?\n/).filter(Boolean).filter((l) => l.split('\t')[1] !== '0');
  assert.deepEqual(perdem, [], 'testes de scripts/ com linhas apagadas');
  const corpus = gitRoot('diff', '--name-status', b, '--', 'scripts/corpus/mutations').split(/\r?\n/).filter(Boolean).filter((l) => !l.startsWith('A'));
  assert.deepEqual(corpus, [], 'mutações alteradas ou apagadas');
});

const MECANISMO = ['templates/.claude/check.cjs', ...['dev', 'critic', 'batch', 'round-minus-1'].map((b) => `templates/.claude/briefs/${b}.md`), 'templates/FRAMEWORK.md', 'templates/.claude/workflows/gauntlet-build.js', 'templates/.claude/workflows/gauntlet-batch.js'];
test('ÂMBITO: nos ficheiros do mecanismo só se acrescenta: nenhuma linha da base muda nem sai (reprova: enfraquecer uma regra atual)', (t) => {
  if (soNoTicket(t, 'v-09')) return;
  const b = pre(t);
  if (!b) return;
  const perdem = gitRoot('diff', '--numstat', b, '--', ...MECANISMO).split(/\r?\n/).filter(Boolean).filter((l) => l.split('\t')[1] !== '0');
  assert.deepEqual(perdem, [], 'ficheiros com linhas da base alteradas ou apagadas');
});

const REGRA = /NO_MERGE|\b540\b|\b9 min|foreground|primeiro plano|run_in_background|yes of the user/i;
test('ÂMBITO: em todo o templates/, cada linha de regra da base (NO_MERGE, 540 s, 9 min, primeiro plano, «yes of the user») está igual no mesmo ficheiro do HEAD', (t) => {
  if (soNoTicket(t, 'v-09')) return;
  const b = pre(t);
  if (!b) return;
  const perdidas = [];
  let vistas = 0;
  for (const f of gitRoot('ls-tree', '-r', '--name-only', b, '--', 'templates').split(/\r?\n/).filter(Boolean)) {
    const antes = gitRoot('show', `${b}:${f}`).split(/\r?\n/).filter((l) => REGRA.test(l));
    if (!antes.length) continue;
    const agora = new Set(existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f), 'utf8').split(/\r?\n/) : []);
    for (const l of antes) { vistas++; if (!agora.has(l)) perdidas.push(`${f}: ${l.trim().slice(0, 160)}`); }
  }
  assert.ok(vistas >= 10, 'pré-condição: poucas linhas de regra na base (' + vistas + ')');
  assert.deepEqual(perdidas, [], 'linhas de regra do processo alteradas ou apagadas');
});

// Por ficheiro do projeto e por literal, as ocorrências em linhas que não são a proibição
const contagem = (T) => {
  const c = {};
  for (const [rel, s] of Object.entries(T)) for (const l of s.split(/\r?\n/)) {
    if (NO_MERGE.test(l)) continue;
    for (const [nome, re] of Object.entries(LITERAIS)) { const n = (l.match(re) ?? []).length; if (n) c[`${rel} › ${nome}`] = (c[`${rel} › ${nome}`] ?? 0) + n; }
  }
  return c;
};

for (const [nome, lingua] of [[EN, 'EN'], [PT, 'PT']]) {
  test(`ÂMBITO (${lingua}): nenhum ficheiro do projeto gerado ganha push, PR ou merge fora da linha que os proíbe (C2)`, async (t) => {
    if (soNoTicket(t, 'v-09')) return;
    if (!pre(t)) return;
    const a = await conjunto(nome);
    const antes = contagem(textos(await gerar(a, pacoteDaBase()))), agora = contagem(textos(await gerar(a)));
    const novos = Object.entries(agora).filter(([k, n]) => n > (antes[k] ?? 0)).map(([k, n]) => `${k}: ${antes[k] ?? 0} → ${n}`);
    assert.deepEqual(novos, [], 'literais novos fora da linha da proibição');
  });

  test(`ÂMBITO (${lingua}): nenhuma linha do check da base desaparece; as linhas novas dão ok e cada uma tem a sua mutação no corpus, que a põe a FAIL (C1)`, async (t) => {
    if (soNoTicket(t, 'v-09')) return;
    if (!pre(t)) return;
    const a = await conjunto(nome);
    const B = await gerar(a, pacoteDaBase()), H = await gerar(a);
    const b = check(B), h = check(H);
    assert.deepEqual(b.linhas.filter((y) => !h.linhas.some((x) => mesma(x.nome, y.nome))).map((y) => y.nome), [], 'linhas do check da base que desaparecem no HEAD');
    const novas = h.linhas.filter((x) => !b.linhas.some((y) => mesma(x.nome, y.nome)));
    assert.deepEqual(novas.filter((x) => x.estado !== 'ok').map((x) => x.nome), [], 'linhas novas que não dão ok no projeto gerado' + fim(h));
    assert.deepEqual(novas.filter((x) => !muts.some((m) => typeof m.value?.line === 'string' && mesma(x.nome, m.value.line))).map((x) => x.nome), [], 'linhas novas sem mutação no corpus (campo line)');
    for (const m of muts.filter((m) => typeof m.value?.line === 'string' && novas.some((x) => mesma(x.nome, m.value.line)))) await aplicaMutacao(m);
  });
}