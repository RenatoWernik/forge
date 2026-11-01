// V-03 critério C4 (o lint L4 em scripts/guardas-critico.test.mjs): nenhum ficheiro de tests/critico/ fora de _comum/lote.mjs faz spawn de
// --test com um argumento que contenha o glob do pacote ou tests/critico/<outra pasta>.
// Oráculos:
//   - o corpus scripts/corpus/guardas/ tem os 4 casos desta Ronda −1, com o esperado certo: mau-l4-f04-antigo-real (o regressao.test.mjs
//     e o helpers.mjs do f-04 da base, com o .test tirado do nome: o início de cada um, byte a byte, até aos dois testes que voltam a correr
//     o pacote e as outras pastas, e no helpers até ao runTests e ao failures, sem a chave do sem-claude-mem.test.mjs no BASELINE; o resto
//     faria disparar o sem-claude-mem.test.mjs e os «reprova sempre» que leem o que o ticket acrescenta fora de tests/), mau-l4-spawn-outra-pasta, ok-l4-dolote e
//     ok-l4-spawn-ficheiro-proprio (estilo f-26 c1); o lint dá FAIL L4 aos maus e ok aos limpos (os testes «corpus das guardas › <caso>»);
//   - na árvore de agora, o lint inteiro dá 0 falhas e nenhum achado L4 em tests/critico/ (a main convertida);
//   - ÂMBITO: na árvore com o tests/critico/ da base, o L4 acusa pelo menos os ficheiros que correm o pacote ou outra pasta (LITERAIS) e só
//     ficheiros da lista autorizada do ticket, e cada um chama agora o doLote. O corpus do f-04 é o da base, byte a byte.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { base } from '../_comum/base.mjs';
import { soNoTicket } from '../_comum/ambito.mjs';
import { ROOT, crit, AUTORIZADOS, LITERAIS, LF, lerJson, limpa, lintL4, arvoreComCriticoDaBase, ficheirosComLote, textoNaBase } from './helpers.mjs';

after(limpa);
const CORPUS = join(ROOT, 'scripts', 'corpus', 'guardas');
// o corpus do f-04 é o início da base; a única diferença é a chave do sem-claude-mem, que o scripts/sem-claude-mem.test.mjs proíbe em scripts/
const semClaudeMem = (s) => s.replace(", '" + 'sem-claude' + "-mem.test.mjs': 1", '');
const CASOS = {
  'mau-l4-f04-antigo-real': { regra: 'L4', ficheiro: 'regressao.mjs' },
  'mau-l4-spawn-outra-pasta': { regra: 'L4', ficheiro: 'guarda.mjs' },
  'ok-l4-dolote': { ok: true },
  'ok-l4-spawn-ficheiro-proprio': { ok: true },
};

test('C4: o corpus das guardas tem os 2 casos maus e os 2 limpos do L4, com o esperado.json certo', () => {
  for (const [c, esp] of Object.entries(CASOS)) {
    const f = join(CORPUS, c, 'esperado.json');
    assert.ok(existsSync(f), `falta ${c}/esperado.json`);
    assert.deepEqual(lerJson(f), esp, c);
  }
});
test('C4: o lint dá FAIL L4 aos casos maus e ok aos limpos (os testes «corpus das guardas › <caso>» passam)', () => {
  const r = lintL4(ROOT, '^corpus das guardas');
  const mal = Object.keys(CASOS).filter((c) => r.testes[`corpus das guardas › ${c}`]?.estado !== 'pass').map((c) => `${c}: ${r.testes[`corpus das guardas › ${c}`]?.estado ?? 'não correu'}`);
  assert.deepEqual(mal, [], r.out.slice(-3000));
});
test('C4: na árvore de agora o lint das guardas dá 0 falhas e nenhum achado L4 em tests/critico/', () => {
  const r = lintL4(ROOT);
  assert.deepEqual(r.ficheiros.filter((f) => f.startsWith(crit(''))), [], 'achados L4 na árvore de agora');
  assert.equal(r.status, 0, r.out.slice(-3000));
});
test('ÂMBITO: C4 — na árvore com o tests/critico/ da base, o L4 acusa os LITERAIS e só ficheiros da lista autorizada, e cada um chama agora o doLote', (t) => {
  if (soNoTicket(t, 'v-03')) return;
  const b = base();
  if (!b) return t.skip('sem origin/main');
  const r = lintL4(arvoreComCriticoDaBase(b));
  const fs = r.ficheiros.filter((f) => f.startsWith(crit('')));
  assert.deepEqual(LITERAIS.filter((f) => !fs.includes(f)), [], 'ficheiros que correm o pacote ou outra pasta na base e que o L4 não acusa\n' + r.out.slice(-2000));
  assert.deepEqual(fs.filter((f) => !AUTORIZADOS.includes(f)), [], 'o L4 acusa ficheiros fora da lista autorizada do ticket (PERGUNTA)');
  const com = ficheirosComLote();
  assert.deepEqual(fs.filter((f) => !com.includes(f)), [], 'ficheiros acusados na base que não chamam o doLote');
});
test('ÂMBITO: C4 — o caso mau-l4-f04-antigo-real é o regressao.test.mjs e o helpers.mjs do f-04 da base, o início deles, byte a byte (salvo a chave do sem-claude-mem), com os runTests aninhados', (t) => {
  if (soNoTicket(t, 'v-03')) return;
  const b = base();
  if (!b) return t.skip('sem origin/main');
  assert.ok(/runTests\(\[/.test(readFileSync(join(CORPUS, 'mau-l4-f04-antigo-real', 'regressao.mjs'), 'utf8')), 'o regressao do corpus perdeu os runTests');
  for (const [caso, orig] of [['regressao.mjs', 'regressao.test.mjs'], ['helpers.mjs', 'helpers.mjs']]) {
    const f = join(CORPUS, 'mau-l4-f04-antigo-real', caso);
    assert.ok(existsSync(f), 'falta ' + caso);
    const c = LF(readFileSync(f, 'utf8')), velho = semClaudeMem(LF(textoNaBase(b, crit('f-04-r0', orig)) ?? ''));
    assert.ok(c.split('\n').length > 40 && velho.startsWith(c), caso + ': não é o início do ficheiro da base');
  }
});