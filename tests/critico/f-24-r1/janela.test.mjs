// F-24, R2 (REDESENHO da #80, comentário 6553264511): a fonte da janela do vigia do contexto, com a forma real do transcript.
// Num transcript real o [1m] nunca vem no message.model: vem só numa entrada {"type":"attachment","attachment":{"type":"model","identity":{"modelId":"...[1m]"}}}.
// Ordem: 1. a última entrada de modelo; 2. o message.model da última resposta; 3. uso > 200000 é janela de 1000000; 4. 200000.
// Fixtures A1a a A1f do redesenho, sem conteúdo real. Reutiliza o arnês do f-24-r0 (nada toca na config real nem numa sessão claude).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { appendFileSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import * as H from '../f-24-r0/helpers.mjs';

const anexo = (modelId, lateral = false) => ({ type: 'attachment', attachment: { type: 'model', identity: { modelId } }, isSidechain: lateral, uuid: 'u-m-' + modelId });
const resposta = (tokens, model = 'claude-opus-5') => H.assistente(tokens, { modelo: model });
const calado = (r, porque) => { assert.equal(r.status, 0, H.mostra(r)); assert.ok(r.ms <= 2000, H.mostra(r)); assert.equal(r.stdout.trim(), '', `${porque}: ${H.mostra(r)}`); };
const avisa = (r, n, nivel = 'WARNING') => { assert.equal(r.status, 0, H.mostra(r)); assert.deepEqual(H.saidaHook(r), H.avisoEsperado('UserPromptSubmit', n, nivel), H.mostra(r)); };
const linhas = (es) => es.map((e) => JSON.stringify(e)).join('\n') + '\n';

test('A1a: attachment claude-opus-5[1m], message.model claude-opus-5, 170000 tokens: nenhum aviso (janela 1000000)', async () => {
  const c = await H.cenarioContexto();
  calado(c.chama(H.transcript(c.tr, [H.utilizador(), anexo('claude-opus-5[1m]'), resposta(170000)])), 'aviso falso numa sessão 1M a 17 %');
});

test('A1b: o mesmo transcript a 850000 tokens: CONTEXT WARNING 85%', async () => {
  const c = await H.cenarioContexto();
  avisa(c.chama(H.transcript(c.tr, [H.utilizador(), anexo('claude-opus-5[1m]'), resposta(850000)])), 85);
});

test('A1c: attachment claude-sonnet-5-5 sem [1m], 170000 tokens: CONTEXT WARNING 85% (janela 200000)', async () => {
  const c = await H.cenarioContexto();
  avisa(c.chama(H.transcript(c.tr, [anexo('claude-sonnet-5-5'), resposta(170000, 'claude-sonnet-5-5')])), 85);
});

test('A1d: sem attachment e 250000 tokens: janela 1000000 pela rede de segurança, nenhum aviso', async () => {
  const c = await H.cenarioContexto();
  calado(c.chama(H.transcript(c.tr, [H.utilizador(), resposta(250000)])), '250000 tokens avisou (uma janela de 200000 nunca chega lá)');
  // a rede vale seja qual for o resultado de 1 e 2: um attachment sem [1m] com uso acima de 200000 também dá 1000000
  const d = await H.cenarioContexto();
  calado(d.chama(H.transcript(d.tr, [anexo('claude-opus-5'), resposta(250000)])), 'attachment sem [1m] e 250000 tokens avisou');
});

test('A1d (ordem): sem attachment, message.model terminado em [1m] ainda dá 1000000 (regra 2)', async () => {
  const c = await H.cenarioContexto();
  calado(c.chama(H.transcript(c.tr, [resposta(170000, 'claude-opus-5[1m]')])), 'regra 2 falhou');
});

test('A1e: troca de modelo a meio, de [1m] para sem [1m]: a leitura incremental seguinte usa 200000', async () => {
  const c = await H.cenarioContexto();
  const f = H.transcript(c.tr, [H.utilizador(), anexo('claude-opus-5[1m]'), resposta(100000)]);
  calado(c.chama(f), '100000 de 1M');
  appendFileSync(f, linhas([anexo('claude-sonnet-5-5'), resposta(170000, 'claude-sonnet-5-5')]));
  avisa(c.chama(f), 85); // 170000 de 200000
});

test('A1e (inverso): de sem [1m] para [1m]: o aviso que a janela de 200000 daria desaparece', async () => {
  const c = await H.cenarioContexto();
  const f = H.transcript(c.tr, [anexo('claude-sonnet-5-5'), resposta(100000, 'claude-sonnet-5-5')]);
  calado(c.chama(f), '50 %');
  appendFileSync(f, linhas([anexo('claude-opus-5[1m]'), resposta(170000)]));
  calado(c.chama(f), '17 % de 1M avisou');
});

test('A1f: a segunda chamada não relê o ficheiro desde o início (offset guardado, e a prova por um byte mudado no meio)', async () => {
  const c = await H.cenarioContexto();
  const enchimento = Array.from({ length: 40 }, (_, i) => H.utilizador('x'.repeat(300) + i));
  const f = H.transcript(c.tr, [...enchimento, anexo('claude-opus-5[1m]'), resposta(100000), ...enchimento]);
  calado(c.chama(f), '1.ª chamada');
  const estado = H.ficheiroEstado(c.estado, 'sessao-1');
  assert.equal(JSON.parse(readFileSync(estado, 'utf8')).offset, statSync(f).size, 'o offset guardado não é o fim do ficheiro');
  // muda no sítio, com o mesmo tamanho, o attachment lido na 1.ª chamada: uma releitura total veria a janela de 200000
  const texto = readFileSync(f, 'utf8');
  writeFileSync(f, texto.replace('claude-opus-5[1m]', 'claude-opus-5[1x]'));
  appendFileSync(f, linhas([resposta(170000)]));
  calado(c.chama(f), 'releu o ficheiro desde o início (a janela deu 200000)');
  assert.equal(JSON.parse(readFileSync(estado, 'utf8')).offset, statSync(f).size);
});

test('um ficheiro reescrito com outro conteúdo (mesmo caminho, mesmo tamanho) é lido de novo desde o início', async () => {
  const c = await H.cenarioContexto();
  calado(c.chama(H.transcript(c.tr, [anexo('claude-opus-5[1m]'), resposta(100000)])), '10 %');
  avisa(c.chama(H.transcript(c.tr, [anexo('claude-sonnet-5-5'), resposta(170000, 'claude-sonnet-5-5')])), 85);
});

test('uma linha ainda por acabar (sem \n) não é lida até estar completa', async () => {
  const c = await H.cenarioContexto();
  const f = H.transcript(c.tr, [resposta(100000, 'claude-sonnet-5-5')]);
  const ultima = JSON.stringify(resposta(180000, 'claude-sonnet-5-5'));
  appendFileSync(f, ultima.slice(0, 120));
  calado(c.chama(f), 'leu uma linha partida');
  appendFileSync(f, ultima.slice(120) + '\n');
  avisa(c.chama(f), 90, 'CRITICAL');
});

test('um attachment de modelo lateral (isSidechain: true) não muda a janela da sessão principal', async () => {
  const c = await H.cenarioContexto();
  avisa(c.chama(H.transcript(c.tr, [anexo('claude-opus-5[1m]'), anexo('claude-haiku-5-5', true), resposta(850000)])), 85);
});
