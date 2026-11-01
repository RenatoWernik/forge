// F-22b critério 4: `for <ficheiro>...` imprime `E-NNN <class> <PREVENTION>: <SYMPTOM>` por cada entrada cujo AREA (globs separados por vírgula,
// com `*` e `**`, relativos à raiz e em barras `/`) casa com pelo menos um dos ficheiros dados e cujo STATUS é open, recurred ou escalated;
// sem nenhuma, imprime `none`.
// Oráculo: a tabela de 8 casos do contrato (cada um com o seu controlo, para que um `none` não passe por o casamento estar partido).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { projeto, apaga, ficheiro, out10, registo, learn } from './helpers.mjs';

let P;
before(async () => { P = await projeto(); });
after(() => apaga(P));

const LINHA = 'E-001 fixed-test-port test: the test port collided with a running server';
// Um registo com uma só entrada (camada test, STATUS open por omissão) e o `for` com os argumentos dados
const para = (AREA, args, STATUS = 'open') => {
  registo(P, { '2026-10.md': ficheiro('2026-10', [out10(1, 'test', { AREA, STATUS })]) });
  const r = learn(P, ['for', ...args]);
  assert.equal(r.status, 0, r.out);
  return r.linhas;
};
const casa = (AREA, args, STATUS) => assert.deepEqual(para(AREA, args, STATUS), [LINHA], `AREA «${AREA}» devia casar com ${args.join(' ')} (STATUS ${STATUS || 'open'})`);
const naoCasa = (AREA, args, STATUS) => assert.deepEqual(para(AREA, args, STATUS), ['none'], `AREA «${AREA}» não devia casar com ${args.join(' ')} (STATUS ${STATUS || 'open'})`);

test('C4 [ataque] 1: `src/**` casa com `src/a/b.js` (e com um de vários ficheiros)', () => {
  casa('src/**', ['src/a/b.js']);
  casa('src/**', ['docs/x.txt', 'src/a/b.js']);
});
test('C4 [ataque] 2: `src/*.js` não casa com `src/a/b.js` (o `*` não passa a barra); casa com `src/b.js`', () => {
  naoCasa('src/*.js', ['src/a/b.js']);
  casa('src/*.js', ['src/b.js']);
});
test('C4 [ataque] 3: `**/*.md` casa com `README.md` (o `**` também é zero pastas)', () => {
  casa('**/*.md', ['README.md']);
});
test('C4 [ataque] 4: dois globs separados por vírgula, em que só o segundo casa', () => {
  casa('docs/*.md, src/**', ['src/x/y.js']);
});
test('C4 [ataque] 5: STATUS prevented fica de fora; recurred e escalated entram', () => {
  naoCasa('src/**', ['src/a/b.js'], 'prevented');
  casa('src/**', ['src/a/b.js'], 'recurred');
  casa('src/**', ['src/a/b.js'], 'escalated');
});
test('C4 [ataque] 6: um argumento com `..` é ignorado (o controlo sem `..` casa)', () => {
  casa('**/*.js', ['fora/a.js']);
  naoCasa('**/*.js', ['../fora/a.js']);
  naoCasa('**/*.js', ['src/../../fora/a.js']);
  naoCasa('src/**', ['src/../../fora/a.js']);
});
test('C4 [ataque] 7: um caminho com `\\` é normalizado para `/`', () => {
  casa('src/**', ['src\\a\\b.js']);
  casa('src/*.js', ['src\\b.js']);
});
test('C4 [ataque] 8: nenhuma entrada casa: imprime `none`', () => {
  naoCasa('docs/**', ['src/a.js']);
});