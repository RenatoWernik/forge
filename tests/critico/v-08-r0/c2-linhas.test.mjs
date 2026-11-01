// V-08 C2 (#132): cada linha nova do check.cjs dá ok no projeto gerado e FAIL com a mutação dela; o corpus F-02 C2 continua com ≥ 5 linhas
// distintas. Oráculo que não depende dos nomes que o dev der às linhas: num projeto gerado e commitado, cada mutação abaixo (as três coisas que
// o corpo da #132 manda verificar: os 4 módulos existem, o suites.json é válido, todo o ficheiro rastreado é coberto pelo mapa) põe a FAIL pelo
// menos uma linha que estava ok, e uma dessas linhas tem a sua mutação no corpus, que, aplicada como no f-02-r0 C2, a põe a FAIL.
// O teste ÂMBITO de ambito.test.mjs fecha o resto: todas as linhas novas contra o merge-base, ok e com mutação, e nenhuma linha da base some.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MODULOS, NO_PROJETO, MANIFESTO, MAPA, loadCorpus, gerar, conjunto, preCondicao, repo, check, mesma, lerJson, aplicaMutacao, fim } from './helpers.mjs';

const muts = await loadCorpus('mutations');

test('C2 (guarda): o corpus F-02 C2 continua com pelo menos 5 linhas distintas', () => {
  const linhas = new Set(muts.map((m) => m.value?.line));
  assert.ok(linhas.size >= 5, 'linhas distintas: ' + [...linhas].join(' | '));
});

const CASOS = [
  ...MODULOS.map((m) => ({ nome: `sem ${NO_PROJETO(m)}`, muda: (P) => rmSync(join(P, NO_PROJETO(m))) })),
  { nome: `${MANIFESTO} que não é JSON`, muda: (P) => writeFileSync(join(P, MANIFESTO), 'isto não é json\n') },
  { nome: `${MANIFESTO} sem a lista suites`, muda: (P) => writeFileSync(join(P, MANIFESTO), JSON.stringify({ versao: 1 }) + '\n') },
  {
    nome: `${MAPA} sem nenhuma regra que case com os ficheiros rastreados`,
    muda: (P) => { const m = lerJson(join(P, MAPA)); writeFileSync(join(P, MAPA), JSON.stringify({ ...m, regras: m.regras.map((r) => ({ ...r, caminhos: ['nenhum-sitio-v08/**'] })) }, null, 2) + '\n'); },
  },
];

for (const c of CASOS) {
  test(`C2: ${c.nome}: uma linha que estava ok passa a FAIL, e essa linha tem no corpus a sua mutação, que a põe a FAIL`, async () => {
    const P = await gerar(await conjunto('en-plain-published'));
    preCondicao(P);
    repo(P);
    const antes = check(P);
    c.muda(P);
    const depois = check(P);
    assert.equal(depois.status, 1, 'o check passou depois da mutação' + fim(depois));
    const ok = antes.linhas.filter((l) => l.estado === 'ok').map((l) => l.nome);
    const viradas = depois.linhas.filter((l) => l.estado === 'FAIL' && ok.some((n) => mesma(n, l.nome))).map((l) => l.nome);
    assert.ok(viradas.length, 'nenhuma linha que estava ok passou a FAIL' + fim(depois));
    const delas = muts.filter((m) => typeof m.value?.line === 'string' && viradas.some((v) => mesma(v, m.value.line)));
    assert.ok(delas.length, 'nenhuma mutação do corpus (campo line) para as linhas que passaram a FAIL: ' + viradas.join(' | '));
    for (const m of delas) await aplicaMutacao(m);
  });
}