// V-05 (#129) C1, C4 e C5 sobre o corpus de cenários (cenarios.mjs): cada cenário é um repo temporário com o seu manifesto e o seu mapa, e o
// check-ticket deste repo corre sobre ele com --raiz, --base origin/main, os globs do cenário e (quase sempre) --publicar 7 com o gh falso.
// C1: o código e as linhas esperadas (as 6, pela ordem; os passos ok e os FAIL com o que nomeiam), e o relatório em .forge/check-ticket/<sha>.json.
// C4: o gh é chamado exatamente com `pr comment 7 --body <...>`, uma vez, com o sha do HEAD e o sha256 do relatório; sem --publicar, nunca.
//     Os dois tokens falsos nunca aparecem na saída, no relatório, em .forge/ nem no argv do gh.
// C5 (propriedade sobre todos os cenários): há um FAIL ⇔ o código é ≠ 0 ⇔ o comentário é VERMELHO; sem FAIL, o código é 0 e o comentário VERDE.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CENARIOS } from './cenarios.mjs';
import { cenario, correr, ghFalso, tokensFalsos, linhas, relatorio, shaDe, sha256, saida, exigeCheck, ficheirosDe, PASSOS, limpa } from './helpers.mjs';

after(limpa);

const PR = '7';
const res = new Map();
before(async () => {
  const fila = [...CENARIOS];
  const um = async () => {
    for (let c = fila.shift(); c; c = fila.shift()) {
      const raiz = cenario(c.ramo, c.sujo), gh = ghFalso(), tok = tokensFalsos();
      const args = ['--ambito', ...c.ambito, '--base', 'origin/main', ...(c.publicar === false ? [] : ['--publicar', PR])];
      const r = await correr(raiz, args, { env: { ...gh.env, ...tok }, limite_ms: 240000 });
      res.set(c.id, { c, raiz, gh, tok, r, ls: linhas(r.out) });
    }
  };
  await Promise.all([um(), um(), um()]);
}, { timeout: 450000 });

for (const c of CENARIOS) {
  test(`C1 (${c.id}): ${c.titulo}`, () => {
    exigeCheck();
    const { raiz, r, ls } = res.get(c.id);
    const msg = saida(r);
    assert.equal(r.pendurado, false, msg);
    assert.deepEqual(ls.map((l) => l.passo), PASSOS, `as 6 linhas, uma por passo e por esta ordem\n${msg}`);
    assert.equal(r.status, c.codigo, msg);
    const de = (p) => ls.find((l) => l.passo === p);
    const okEsperados = c.codigo === 0 ? PASSOS : (c.ok ?? []);
    for (const p of okEsperados) assert.equal(de(p).estado, 'ok', `${p} devia dar ok\n${msg}`);
    for (const [p, nomes] of Object.entries(c.fail ?? {})) {
      assert.equal(de(p).estado, 'FAIL', `${p} devia dar FAIL\n${msg}`);
      for (const n of nomes) assert.ok(de(p).linha.includes(n), `a linha FAIL ${p} não nomeia ${n}: ${de(p).linha}`);
    }
    for (const [p, nomes] of Object.entries(c.naoInclui ?? {})) for (const n of nomes) assert.ok(!de(p).linha.includes(n), `a linha ${p} nomeia ${n}, que está dentro do âmbito: ${de(p).linha}`);
    const f = relatorio(raiz);
    assert.ok(existsSync(f), `falta o relatório ${f}`);
    assert.doesNotThrow(() => JSON.parse(readFileSync(f, 'utf8')), 'o relatório não é JSON');
  });
}

test('C4: com --publicar, o gh é chamado uma só vez, exatamente com `pr comment 7 --body <corpo>`; o VERDE leva o sha do HEAD e o sha256 do relatório', () => {
  exigeCheck();
  for (const { c, raiz, gh, r } of res.values()) {
    const ch = gh.chamadas();
    if (c.publicar === false) { assert.deepEqual(ch, [], `${c.id}: sem --publicar chamou o gh`); continue; }
    assert.equal(ch.length, 1, `${c.id}: ${ch.length} chamadas ao gh: ${JSON.stringify(ch)}\n${saida(r)}`);
    const [a] = ch;
    assert.deepEqual(a.argv.slice(0, 4), ['pr', 'comment', PR, '--body'], `${c.id}: ${JSON.stringify(a.argv)}`);
    assert.equal(a.argv.length, 5, `${c.id}: argumentos a mais: ${JSON.stringify(a.argv)}`);
    const primeira = a.argv[4].split(/\r?\n/)[0];
    if (c.codigo === 0) {
      const f = relatorio(raiz);
      assert.equal(primeira, `CHECK-TICKET: VERDE ${shaDe(raiz)} ${sha256(readFileSync(f))}`, c.id);
    } else assert.match(primeira, /^CHECK-TICKET: VERMELHO\b/, c.id);
  }
});

test('C4: os tokens falsos (GH_TOKEN e GITHUB_TOKEN) nunca aparecem na saída, no relatório, em .forge/ nem no argv do gh', () => {
  exigeCheck();
  for (const { c, raiz, gh, tok, r } of res.values()) {
    const sitios = [['stdout', r.out], ['stderr', r.err], ['argv do gh', JSON.stringify(gh.chamadas())],
      ...ficheirosDe(join(raiz, '.forge')).map((f) => [f, readFileSync(f, 'latin1')])];
    for (const [onde, txt] of sitios) for (const [k, v] of Object.entries(tok)) assert.ok(!txt.includes(v), `${c.id}: o ${k} aparece em ${onde}`);
  }
});

test('C5 (propriedade sobre todos os cenários): algum FAIL ⇔ código ≠ 0 ⇔ comentário VERMELHO; sem FAIL, código 0 e comentário VERDE', () => {
  exigeCheck();
  const erros = [];
  for (const { c, gh, r, ls } of res.values()) {
    const falhou = ls.some((l) => l.estado === 'FAIL') || ls.length !== PASSOS.length;
    if ((r.status !== 0) !== falhou) erros.push(`${c.id}: código ${r.status} com ${falhou ? 'FAIL' : 'tudo ok'}`);
    if (c.publicar === false) continue;
    const corpo = gh.chamadas()[0]?.argv?.[4] ?? '';
    const cor = /^CHECK-TICKET: (VERDE|VERMELHO)\b/.exec(corpo)?.[1];
    if (cor !== (falhou ? 'VERMELHO' : 'VERDE')) erros.push(`${c.id}: comentário ${JSON.stringify(corpo.slice(0, 80))} com ${falhou ? 'FAIL' : 'tudo ok'}`);
  }
  assert.deepEqual(erros, []);
});