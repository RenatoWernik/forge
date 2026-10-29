// F-10: o leitor perante um painel.json ausente, vazio, truncado a meio da escrita, com JSON inválido, com BOM ou inválido no esquema.
// Resposta 15 do orquestrador na #11: devolve { erro: "<mensagem>", contagens: null, agentes: [] }, nunca lança exceção e nunca
// devolve dados parciais. Resposta 12: o BOM é aceite na leitura.
// Oráculo: os casos literais abaixo e todos os cortes de um painel válido (um por byte, de 0 ao penúltimo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, base, txt, AGORA, MIN } from './helpers.mjs';

const cheio = txt(base());
const CASOS = {
  'ausente (null)': null,
  'ausente (undefined)': undefined,
  vazio: '',
  'só espaços': '  \r\n',
  'truncado a 10 %': cheio.slice(0, Math.floor(cheio.length * 0.1)),
  'truncado a 50 %': cheio.slice(0, Math.floor(cheio.length * 0.5)),
  'truncado a 99 %': cheio.slice(0, cheio.length - 3),
  'JSON inválido (vírgula a mais)': cheio.replace('"rigoroso"', '"rigoroso",'),
  'não é objeto (lista)': '[1,2,3]',
  'não é objeto (null)': 'null',
  'não é objeto (número)': '42',
  'inválido no esquema (estado desconhecido)': cheio.replace('"falta"', '"feito"'),
  'inválido no esquema (agente sem checkpoint)': cheio.replace('"checkpoint": "critico-t03.md"', '"modelo2": "x"'),
  'BOM duplo': '\uFEFF\uFEFF' + cheio,
};

const modeloDeErro = (u, m, nome) => {
  assert.deepEqual(Object.keys(m).sort(), ['agentes', 'contagens', 'erro'], nome + ': o modelo de erro tem campos a mais (dados parciais) ou a menos');
  assert.equal(typeof u.erro(m), 'string', nome + ': erro não é texto');
  assert.ok(u.erro(m).trim().length > 0, nome + ': erro vazio');
  assert.equal(u.contagens(m), null, nome + ': contagens têm de ser null');
  assert.deepEqual(u.agentes(m), [], nome + ': agentes têm de ser []');
};

for (const [nome, texto] of Object.entries(CASOS)) {
  test(`C2 (resposta 15): ${nome} — o leitor não lança exceção e devolve { erro, contagens: null, agentes: [] }`, async () => {
    const u = await api();
    let m;
    assert.doesNotThrow(() => { m = u.ler(texto, { 'desenvolvedor-t03.md': AGORA - MIN }, AGORA); }, nome);
    modeloDeErro(u, m, nome);
  });
}

test('C2 (resposta 15): cada corte de um painel válido, do byte 0 ao penúltimo (escrita a meio), dá o modelo de erro', async () => {
  const u = await api();
  const falhas = [];
  for (let n = 0; n < cheio.trimEnd().length; n++) {
    let m;
    try { m = u.ler(cheio.slice(0, n), {}, AGORA); modeloDeErro(u, m, 'corte ' + n); } catch (e) { falhas.push(`corte ${n}: ${e.message.split('\n')[0]}`); }
  }
  assert.deepEqual(falhas.slice(0, 5), [], `${falhas.length} cortes sem o modelo de erro`);
});

test('C2 (resposta 12): um painel.json válido com BOM dá o mesmo modelo que sem BOM, sem erro', async () => {
  const u = await api();
  const m = { 'desenvolvedor-t03.md': AGORA - 12 * MIN };
  const com = u.ler('\uFEFF' + cheio, m, AGORA);
  assert.deepEqual(com, u.ler(cheio, m, AGORA));
  assert.ok(!u.erro(com), 'erro num painel válido');
});

test('C2 (resposta 15): um painel válido não tem erro no modelo', async () => {
  const u = await api();
  for (const t of [cheio, txt({ versao: 1, modo: 'rigoroso', tickets: [], agentes: [] })]) assert.ok(!u.erro(u.ler(t, {}, AGORA)), 'erro num painel válido');
});
