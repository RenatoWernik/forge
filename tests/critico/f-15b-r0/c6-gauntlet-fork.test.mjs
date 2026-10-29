// Emenda de 2026-10-29 ao F-15b (#38 e #39): o gauntlet-loop vem do fork RenatoWernik/gauntlet-loop. O /forge:update avisa quando
// o original robonuggets/gauntlet-loop tem commits novos, para o utilizador decidir se os traz para o fork, e nunca os aplica sozinho.
// Oráculo: com o original à frente da base do fork, o --check mostra o aviso (robonuggets/gauntlet-loop + commits novos) sem mudar
// o estado do gauntlet-loop, sem executar e sem mudar nenhum byte da máquina; com o original na base, ou inacessível, não há aviso
// nem alarme; nenhum --apply (de nenhum id, com todas as flags) executa algo que cite o robonuggets.
// Depende do F-15a: o registo e o compat.json apontam o gauntlet-loop ao fork (fc6b2fc).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  maquina, instala, estado, upd, doDoctor, sequencia, latest, manifesto, diffManifesto, TUDO_VERIFICADO, TUDO_REFERENCIA, ALVOS, NOVO_UPSTREAM, SYN,
} from './helpers.mjs';

const ORIGINAL = /robonuggets\/gauntlet-loop/i;
const NOVOS = /commits? novos|novos commits|novidades|new commits?|commits? (ahead|à frente)|ahead of|à frente/i;
// O aviso: uma linha que cita o original e diz que tem commits novos (ou a linha do original e a seguinte)
const aviso = (out) => {
  const l = out.split('\n');
  return l.some((x, i) => ORIGINAL.test(x) && (NOVOS.test(x) || NOVOS.test(l[i + 1] ?? '') || NOVOS.test(l[i - 1] ?? '')));
};
const comOriginal = (upstream, estadoMaq = TUDO_VERIFICADO) => instala(maquina({ fontes: latest({ upstream }) }), estadoMaq);

test('emenda fork [F-15a]: com commits novos no original, o --check avisa (robonuggets/gauntlet-loop, commits novos) e o gauntlet-loop continua ok', async () => {
  const m = comOriginal(NOVO_UPSTREAM);
  const antes = manifesto(m.root);
  const r = await upd(m, ['--check']);
  assert.ok(aviso(r.out), 'o --check não avisa dos commits novos do original:\n' + r.out);
  assert.equal((await estado(m)).by['gauntlet-loop'].status, 'ok', 'o aviso do original mudou o estado do gauntlet-loop (o fork está atualizado)');
  assert.deepEqual(r.execs.map((c) => c.str), [], 'o aviso executou algo');
  assert.deepEqual(r.events.filter((e) => e.t === 'write' || e.t === 'copy'), [], 'o aviso escreveu ou copiou');
  assert.deepEqual(diffManifesto(antes, manifesto(m.root)), [], 'o aviso mudou ficheiros');
});

test('emenda fork: com o original na base do fork (sem commits novos), nenhum aviso', async () => {
  const m = comOriginal(undefined);
  const r = await upd(m, ['--check']);
  assert.ok(!aviso(r.out), 'aviso de commits novos sem commits novos (alarme falso):\n' + r.out);
});

test('emenda fork: com o original inacessível (404), nenhum aviso falso, o gauntlet-loop continua ok e nada é executado', async () => {
  const m = comOriginal(null);
  const r = await upd(m, ['--check']);
  assert.ok(!aviso(r.out), 'aviso de commits novos sem resposta do original:\n' + r.out);
  assert.equal((await estado(m)).by['gauntlet-loop'].status, 'ok');
  assert.deepEqual(r.execs.map((c) => c.str), []);
});

test('emenda fork [F-15a]: com o original à frente e o fork desatualizado, o --apply gauntlet-loop executa exatamente o comando do doctor (o fork) e nada cita o robonuggets', async () => {
  const m = instala(maquina({ fontes: latest({ upstream: NOVO_UPSTREAM, gauntlet: 'HEAD nova do fork' }) }), { ...TUDO_VERIFICADO, 'gauntlet-loop': SYN['gauntlet-loop'] });
  const cmd = await doDoctor(m, 'gauntlet-loop');
  assert.ok(!cmd.some((c) => ORIGINAL.test(c)), 'o doctor ainda imprime um comando do original (F-15a)');
  const r = await upd(m, ['--apply', 'gauntlet-loop', '--yes', '--accept-unverified', '--backup-confirmed']);
  sequencia(r.execs, cmd, 'gauntlet-loop do fork');
  for (const c of r.calls) assert.ok(!ORIGINAL.test(c.str), 'uma chamada cita o original: ' + c.str);
});

test('emenda fork: nenhum --apply (de nenhum id, com todas as flags) executa algo do original quando ele tem commits novos', async () => {
  const m = comOriginal(NOVO_UPSTREAM, { ...TUDO_REFERENCIA, uv: '0.13.6' });
  for (const id of [...ALVOS, 'speckit-project']) {
    const r = await upd(m, ['--apply', id, '--yes', '--accept-unverified', '--backup-confirmed', '--overwrite', '--project', m.root]);
    for (const c of r.calls) assert.ok(!ORIGINAL.test(c.str), `--apply ${id}: uma chamada cita o original: ${c.str}`);
  }
});

test('emenda fork: o --apply do gauntlet-loop atualizado não muda nenhum ficheiro, mesmo com o original à frente e --overwrite', async () => {
  const m = comOriginal(NOVO_UPSTREAM);
  const antes = manifesto(m.root);
  const r = await upd(m, ['--apply', 'gauntlet-loop', '--yes', '--overwrite', '--accept-unverified', '--backup-confirmed']);
  for (const c of r.execs) assert.ok(!ORIGINAL.test(c.str), 'executou algo do original: ' + c.str);
  assert.deepEqual(diffManifesto(antes, manifesto(m.root)), [], 'mudou ficheiros com o fork atualizado');
});

for (const id of ['robonuggets', 'gauntlet-upstream', 'gauntlet-loop-upstream', 'robonuggets/gauntlet-loop']) {
  test(`emenda fork: não há alvo para aplicar o original (--apply ${id} → código 2, nada executado)`, async () => {
    const m = comOriginal(NOVO_UPSTREAM);
    const r = await upd(m, ['--apply', id, '--yes']);
    assert.equal(r.code, 2);
    sequencia(r.execs, [], id);
  });
}
