// F-10: o leitor perante um painel.json ausente, vazio, truncado a meio da escrita, com JSON inválido, com BOM ou inválido no esquema.
// O contrato não diz o que o leitor devolve nestes casos (PERGUNTA 15). A proposta destes ataques segue a referência
// (guilda-painel: `Painel.erro?`): o leitor não rebenta, devolve um modelo com erro e nunca contagens inventadas.
// A ponte exporta então também `erro(modelo) -> string | undefined`. Ficam como todo até à resposta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, base, txt, AGORA } from './helpers.mjs';

const cheio = txt(base());
const CASOS = {
  'ausente (null)': null,
  vazio: '',
  'só espaços': '  \r\n',
  'truncado a 10 %': cheio.slice(0, Math.floor(cheio.length * 0.1)),
  'truncado a 50 %': cheio.slice(0, Math.floor(cheio.length * 0.5)),
  'truncado a 99 %': cheio.slice(0, cheio.length - 3),
  'JSON inválido (vírgula a mais)': cheio.replace('"rigoroso"', '"rigoroso",'),
  'não é objeto': '[1,2,3]',
  'inválido no esquema (estado desconhecido)': cheio.replace('"falta"', '"feito"'),
};

for (const [nome, texto] of Object.entries(CASOS)) {
  test(`texto inválido (PERGUNTA 15): ${nome} — o leitor não rebenta e devolve um modelo com erro, sem contagens nem agentes`, { todo: 'PERGUNTA 15: o que o leitor devolve com texto inválido?' }, async () => {
    const u = await api();
    assert.equal(typeof u.erro, 'function', 'a ponte não exporta erro(modelo)');
    let m;
    assert.doesNotThrow(() => { m = u.ler(texto, {}, AGORA); });
    assert.ok(u.erro(m), 'sem erro no modelo');
    assert.ok(u.contagens(m).every(([, n]) => n === 0), 'contagens inventadas');
    assert.deepEqual(u.agentes(m), []);
  });
}

test('texto com BOM (PERGUNTA 12): um painel.json válido com BOM dá o mesmo modelo que sem BOM', { todo: 'PERGUNTA 12: BOM aceite?' }, async () => {
  const u = await api();
  assert.deepEqual(u.ler('﻿' + cheio, {}, AGORA), u.ler(cheio, {}, AGORA));
});

test('texto válido (PERGUNTA 15): um painel válido não tem erro no modelo', { todo: 'PERGUNTA 15' }, async () => {
  const u = await api();
  assert.ok(!u.erro(u.ler(cheio, {}, AGORA)));
});
