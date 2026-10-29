// Critério 6: o pulso do orquestrador. Última ação < 2 min: ativo; de 2 min a < 10 min: «a pensar»; 10 min ou mais: parado.
// «autónomo» quando a última ação vem mais de 60 s depois da última mensagem do utilizador; «comigo» no caso contrário.
// Oráculo: relógio falso com 1:59, 2:00, 9:59 e 10:00 (mais 0 e os ms à volta de cada limiar), e os dois casos de autonomia
// (com o limite exato de 60 s, que «mais de 60 s» deixa em «comigo»).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, AGORA } from './helpers.mjs';

const S = 1000, M = 60 * S;
const minusc = (s) => String(s).normalize('NFC').toLowerCase();

test('C6: estado do pulso em 0, 1:59, 1:59.999, 2:00, 9:59, 9:59.999, 10:00 e 45:00 desde a última ação', async () => {
  const u = await api();
  const tabela = [[0, 'ativo'], [M + 59 * S, 'ativo'], [2 * M - 1, 'ativo'], [2 * M, 'a pensar'], [9 * M + 59 * S, 'a pensar'], [10 * M - 1, 'a pensar'], [10 * M, 'parado'], [45 * M, 'parado']];
  const visto = [];
  for (const [ms] of tabela) visto.push(minusc((await u.pulso(AGORA - ms, AGORA - ms - 5 * M, AGORA)).estado));
  assert.deepEqual(visto, tabela.map(([, e]) => e));
});

test('C6: autonomia: ação 61 s depois da última mensagem = autónomo; 60 s exatos, 10 s depois ou antes da mensagem = comigo', async () => {
  const u = await api();
  const msg = AGORA - 30 * M;
  const casos = [[msg + 61 * S, 'autónomo'], [msg + 60 * S + 1, 'autónomo'], [msg + 60 * S, 'comigo'], [msg + 10 * S, 'comigo'], [msg - 5 * M, 'comigo'], [msg, 'comigo']];
  const visto = [];
  for (const [acao] of casos) visto.push(minusc((await u.pulso(acao, msg, AGORA)).autonomia));
  assert.deepEqual(visto, casos.map(([, a]) => a));
});

test('C6: o estado só depende da última ação e a autonomia só da diferença ação − mensagem (o relógio a avançar não muda a autonomia)', async () => {
  const u = await api();
  const msg = AGORA - 20 * M, acao = msg + 2 * M;
  const auto = [];
  for (const ms of [0, 3 * M, 12 * M]) auto.push(minusc((await u.pulso(acao, msg, acao + ms)).autonomia));
  assert.deepEqual(auto, ['autónomo', 'autónomo', 'autónomo']);
});

// Resposta 5: sem nenhuma ação, ou sem nenhuma mensagem do utilizador, a linha do pulso mostra as 15 barras vazias (o «·» da
// referência) e «sem atividade»; nunca rebenta, nunca mostra NaN/undefined e nunca dá alarme (nem «parado»).
const VAZIOS = [[[], AGORA - M], [[AGORA - 30 * S], undefined], [[], undefined], [[AGORA - 45 * M], undefined]];
test('C6 (resposta 5): sem ação ou sem mensagem, a linha do pulso tem 15 «·», «sem atividade», e nem NaN, undefined ou parado', async () => {
  const u = await api();
  for (const [acoes, msg] of VAZIOS) {
    const l = String(await u.linhaPulso(acoes, msg, AGORA));
    const caso = JSON.stringify([acoes.map((a) => AGORA - a), msg === undefined ? 'sem mensagem' : AGORA - msg]);
    assert.ok(l.includes('·'.repeat(15)), `${caso}: faltam as 15 barras vazias: ${l}`);
    assert.ok(!l.includes('·'.repeat(16)), `${caso}: mais de 15 barras: ${l}`);
    assert.match(l, /sem atividade/i, caso);
    assert.doesNotMatch(l, /NaN|undefined|Infinity|parado/i, caso);
  }
});

test('C6 (resposta 5): pulso() com ação ou mensagem undefined não rebenta, não dá NaN e não dá «parado»', async () => {
  const u = await api();
  for (const [a, m] of [[undefined, AGORA], [AGORA, undefined], [undefined, undefined]]) {
    const r = await u.pulso(a, m, AGORA);
    assert.doesNotMatch(JSON.stringify(r ?? {}), /NaN|null|Infinity/, JSON.stringify([a, m]));
    assert.notEqual(minusc(r?.estado), 'parado', JSON.stringify([a, m]));
  }
});

test('C6: com atividade, a linha do pulso não diz «sem atividade» e mostra o estado (ativo, a pensar, parado)', async () => {
  const u = await api();
  const casos = [[30 * S, 'ativo'], [5 * M, 'a pensar'], [12 * M, 'parado']];
  for (const [ms, estado] of casos) {
    const l = String(await u.linhaPulso([AGORA - 40 * M, AGORA - ms], AGORA - ms - 2 * M, AGORA));
    assert.doesNotMatch(l, /sem atividade|NaN|undefined/i, l);
    assert.ok(minusc(l).includes(estado), `${estado}: ${l}`);
  }
});