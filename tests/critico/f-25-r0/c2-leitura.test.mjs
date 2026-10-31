// F-25 C2 (leitura): com o painel.json partido ou inválido, o mod mantém o último estado bom, regista falhaDesde e, ao fim de
// 10 s, mostra «⚠ painel.json ilegível há <N> s (<erro truncado a 60>)»; a primeira leitura válida apaga o aviso.
// Oráculo: o $ falso com o texto partido (a meio de uma escrita) num relógio controlado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { S, criar, runtime, projeto, base, linhas } from './helpers.mjs';

const AVISO = /^⚠ painel\.json ilegível há (\d+) s \((.*)\)$/;
const aviso = (txt) => linhas(txt).find((l) => l.includes('ilegível'));

const CASOS = {
  'JSON partido a meio de uma escrita': JSON.stringify(base(), null, 2).slice(0, 157),
  'JSON válido com erros do validar()': JSON.stringify({ ...base(), modo: 'turbo', tickets: [{ ...base().tickets[0], estado: 'feito' }] }),
};
for (const [nome, mau] of Object.entries(CASOS)) {
  test(`C2: ${nome}: fica o último estado bom; o aviso só depois de 10 s; a primeira leitura válida apaga-o`, async () => {
    const p = projeto();
    const r = runtime({ raiz: p.raiz });
    const painel = await criar();
    await painel.volta(r.$);
    let txt = await painel.ecra(r.$, 200);
    assert.match(txt, /\b1 main\b/, `o estado bom não aparece:\n${txt}`);
    await r.ctl.avancar(5 * S);
    writeFileSync(p.file, mau);
    await painel.volta(r.$);
    txt = await painel.ecra(r.$, 200);
    assert.match(txt, /\b1 main\b/, `perdeu o último estado bom:\n${txt}`);
    assert.equal(aviso(txt), undefined, 'aviso antes dos 10 s');
    await r.ctl.avancar(9 * S);
    await painel.volta(r.$);
    txt = await painel.ecra(r.$, 200);
    assert.equal(aviso(txt), undefined, 'aviso aos 9 s da falha');
    assert.match(txt, /\b1 main\b/);
    await r.ctl.avancar(2 * S);
    await painel.volta(r.$);
    txt = await painel.ecra(r.$, 200);
    const m = AVISO.exec(aviso(txt) ?? '');
    assert.ok(m, `sem o aviso literal aos 11 s da falha:\n${txt}`);
    assert.equal(m[1], '11', 'o N não conta desde a primeira falha');
    assert.ok(m[2].length > 0 && [...m[2]].length <= 60, `o erro não vem truncado a 60: «${m[2]}»`);
    assert.match(txt, /\b1 main\b/, 'com o aviso, continua o último estado bom');
    await r.ctl.avancar(S);
    writeFileSync(p.file, JSON.stringify({ ...base(), tickets: [...base().tickets, { id: 'T-03', issue: 13, titulo: 'Terceiro', estado: 'main', rondas: 0 }] }));
    await painel.volta(r.$);
    txt = await painel.ecra(r.$, 200);
    assert.equal(aviso(txt), undefined, 'a leitura válida não apagou o aviso');
    assert.match(txt, /\b2 main\b/, `a leitura válida não atualizou os dados:\n${txt}`);
  });
}