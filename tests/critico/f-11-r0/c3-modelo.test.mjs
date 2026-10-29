// Critério 3: para cada fixture, o modelo que o mod mostra é igual ao modelo do leitor partilhado do F-10, com o runtime do mod
// simulado. Oráculo: o corpus de helpers.mjs (as fixtures que a spec nomeia: vazio, completo, agente parado, todos os estados,
// campo inválido; mais ausente, sem .checkpoints, BOM, truncado, 0/1/9/30 agentes, nomes longos e acentos) e `ler()` do F-10
// sobre o mesmo texto e os mesmos mtimes. Também: o mod nunca rebenta (dados() resolve sempre) e nunca escreve no painel.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { api, projeto, runtime, esperado, projetar, CORPUS, AGORA, MIN, norm } from './helpers.mjs';

const foto = (dir) => (existsSync(dir) ? Object.fromEntries(readdirSync(dir).sort().map((n) => [n, [readFileSync(join(dir, n), 'utf8'), statSync(join(dir, n)).mtimeMs]])) : null);

for (const [nome, caso] of Object.entries(CORPUS())) {
  test(`C3: «${nome}»: o modelo do mod é o do leitor partilhado, sem rebentar e sem escrever no painel`, async () => {
    const u = await api();
    const p = projeto(caso);
    const antes = foto(p.dir);
    const { $, log } = runtime({ raiz: p.raiz });
    const modelo = await u.dados($, AGORA); // rejeitar aqui = rebentar
    const exp = await esperado(p);
    assert.deepEqual(projetar(modelo, exp), exp);
    if (exp.erro) assert.ok(typeof modelo.erro === 'string' && modelo.erro.length > 0, 'o erro não é mostrado');
    assert.deepEqual(foto(p.dir), antes, 'a pasta .checkpoints mudou');
    assert.deepEqual(log.escritas.filter((f) => norm(f).includes('/.checkpoints/') || norm(f).endsWith('/painel.json')), [], 'escreveu no painel ou nos checkpoints');
  });
}

test('C3: o modelo acompanha o relógio: o mesmo painel 0, 9:59, 10, 29:59 e 30 min depois dá ativo, ativo, sem sinal, sem sinal, parado?', async () => {
  const u = await api();
  const caso = CORPUS().completo;
  const p = projeto({ ...caso, checkpoints: { 'dev-t03.md': 0 } });
  const vidas = [];
  for (const ms of [0, 9 * MIN + 59000, 10 * MIN, 29 * MIN + 59000, 30 * MIN]) {
    const { $ } = runtime({ raiz: p.raiz, agora: AGORA + ms });
    const m = await u.dados($, AGORA + ms);
    assert.deepEqual(projetar(m, await esperado(p, AGORA + ms)), await esperado(p, AGORA + ms));
    vidas.push(m.agentes[0].vida);
  }
  assert.deepEqual(vidas, ['ativo', 'ativo', 'sem sinal', 'sem sinal', 'parado?']);
});

test('C3: o painel muda entre duas leituras e o mod mostra o novo (não guarda o primeiro)', async () => {
  const u = await api();
  const c = CORPUS();
  const p = projeto(c.completo);
  await u.dados(runtime({ raiz: p.raiz }).$, AGORA);
  const outro = projeto({ ...c['tickets em todos os estados'] });
  // copia o segundo painel por cima do primeiro, como o orquestrador faria
  writeFileSync(p.file, readFileSync(outro.file));
  const m = await u.dados(runtime({ raiz: p.raiz }).$, AGORA);
  const exp = await esperado(p);
  assert.deepEqual(projetar(m, exp), exp);
});
