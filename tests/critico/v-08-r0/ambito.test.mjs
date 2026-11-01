// V-08: âmbito (corpo da #132). Reprova: «mudar uma regra atual do processo instalado», «um ataque antigo alterado» (C4) e «uma linha nova sem
// mutação» (C2). Todos comparam com base() (o merge-base com origin/main, regra 8) e só correm na branch do ticket (regra 9): depois do merge,
// a main já contém a mudança e o merge-base deixa de ter o «antes».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, base, soNoTicket, loadCorpus, gerar, pacoteDaBase, check, mesma, aplicaMutacao, fim } from './helpers.mjs';

const gitRoot = (...a) => { const r = spawnSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }); assert.equal(r.status, 0, 'git ' + a.join(' ') + ': ' + r.stderr); return r.stdout; };
const sets = await loadCorpus('answers');
const muts = await loadCorpus('mutations');

test('ÂMBITO: nenhum ataque de outro ticket (tests/critico/* fora de v-08-r0) mudou nem foi apagado (C4)', (t) => {
  if (soNoTicket(t, 'v-08')) return;
  const b = base();
  if (!b) return t.skip('sem origin/main');
  const mudou = gitRoot('diff', '--name-status', b, '--', 'tests/critico').split(/\r?\n/).filter(Boolean).filter((l) => !/^\S+\s+tests\/critico\/v-08-r0\//.test(l));
  assert.deepEqual(mudou, [], 'ataques antigos alterados ou apagados');
});

// As regras do processo instalado que o corpo da #132 nomeia: sem merge sem o «sim» (NO_MERGE), testes em primeiro plano e o limite de 540 s
const REGRA = /NO_MERGE|\b540\b|\b9 min|foreground|primeiro plano|run_in_background|yes of the user/i;
test('ÂMBITO: as regras atuais do processo instalado ficam intactas: cada linha de templates/ da base com NO_MERGE, 540 s, 9 min, foreground, primeiro plano, run_in_background ou «yes of the user» está igual no mesmo ficheiro do HEAD', (t) => {
  if (soNoTicket(t, 'v-08')) return;
  const b = base();
  if (!b) return t.skip('sem origin/main');
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

const linhasNovas = async (answers) => {
  const pac = pacoteDaBase();
  const H = await gerar(answers), B = await gerar(answers, pac);
  const h = check(H), b = check(B);
  const novas = h.linhas.filter((x) => !b.linhas.some((y) => mesma(x.nome, y.nome)));
  const somem = b.linhas.filter((y) => !h.linhas.some((x) => mesma(x.nome, y.nome))).map((y) => y.nome);
  return { h, novas, somem };
};

for (const { name, value } of sets) {
  test(`ÂMBITO: ${name}: o check do HEAD tem linhas novas contra o da base, todas ok e cada uma com a sua mutação no corpus; nenhuma linha da base desaparece (C2)`, async (t) => {
    if (soNoTicket(t, 'v-08')) return;
    if (!base()) return t.skip('sem origin/main');
    const { h, novas, somem } = await linhasNovas(value);
    assert.deepEqual(somem, [], 'linhas do check da base que desaparecem no HEAD');
    assert.ok(novas.length, 'o check do HEAD não tem nenhuma linha nova contra o da base' + fim(h));
    assert.deepEqual(novas.filter((x) => x.estado !== 'ok').map((x) => x.nome), [], 'linhas novas que não dão ok no projeto gerado');
    assert.deepEqual(novas.filter((x) => !muts.some((m) => typeof m.value?.line === 'string' && mesma(x.nome, m.value.line))).map((x) => x.nome), [], 'linhas novas sem mutação no corpus (campo line)');
  });
}

test('ÂMBITO: cada mutação do corpus de uma linha nova do check põe essa linha a FAIL (aplicada como no f-02-r0 C2) (C2)', async (t) => {
  if (soNoTicket(t, 'v-08')) return;
  if (!base()) return t.skip('sem origin/main');
  const { novas } = await linhasNovas(sets.find((s) => s.name === 'en-plain-published').value);
  const delas = muts.filter((m) => typeof m.value?.line === 'string' && novas.some((x) => mesma(x.nome, m.value.line)));
  assert.ok(delas.length, 'nenhuma mutação do corpus para as linhas novas: ' + novas.map((x) => x.nome).join(' | '));
  for (const m of delas) await aplicaMutacao(m);
});