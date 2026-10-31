// F-22a critério 4: só se acrescenta. Linha `learnings: learnings/ only grows (only STATUS lines change)`: para cada learnings/*.md do HEAD,
// o texto do HEAD sem as linhas `- STATUS:` tem de ser um prefixo do texto atual sem essas linhas. Sem git ou sem HEAD: ok com `(no history)`.
// Oráculo: um repositório git temporário (o projeto gerado), sem config de sistema nem global: acrescentar dá ok, mudar só o STATUS dá ok,
// editar o SYMPTOM de uma entrada commitada dá FAIL, apagar uma entrada commitada dá FAIL, reordenar dá FAIL.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { L_CRESCE, L_FORMA, SEM_HISTORIA, entrada, ficheiro, projeto, caso, check, git, esperaFail, esperaOk, linha, apaga } from './helpers.mjs';

let P, Q;
const E1 = entrada(1, 'test', { CLASS: 'a-a' }), E2 = entrada(2, 'test', { CLASS: 'b-b' }), E3 = entrada(3, 'test', { CLASS: 'c-c' });
const NOV = ficheiro('2026-11', [entrada(4, 'test', { CLASS: 'd-d', DATE: '2026-11-02', 'REVIEW-BY': '2026-11-16' })]);
const OUT = ficheiro('2026-10', [E1, E2]);
before(async () => {
  P = await projeto(); // sem git
  Q = await projeto();
  caso(Q, { '2026-10.md': OUT });
  git(Q, 'init', '-q');
  git(Q, 'add', '-A');
  git(Q, 'commit', '-q', '-m', 'base');
});
after(() => { apaga(P); apaga(Q); });
// cada cenário parte do HEAD: learnings/2026-10.md = OUT (E-001, E-002) commitado
const em = (fs_) => caso(Q, fs_);

test('C4 sem git: a linha fica ok com «(no history)»', () => {
  const r = caso(P, { '2026-10.md': OUT });
  const l = linha(r, L_CRESCE);
  assert.equal(l, 'ok    ' + L_CRESCE + ' ' + SEM_HISTORIA, r.out.slice(-1500));
});
test('C4 git sem HEAD (repositório sem commits): a linha fica ok com «(no history)»', async () => {
  const R = await projeto();
  try {
    caso(R, { '2026-10.md': OUT });
    git(R, 'init', '-q');
    const r = check(R);
    assert.equal(linha(r, L_CRESCE), 'ok    ' + L_CRESCE + ' ' + SEM_HISTORIA, r.out.slice(-1500));
  } finally { apaga(R); }
});
test('C4 sem mudanças desde o HEAD: ok', () => {
  esperaOk(em({ '2026-10.md': OUT }), L_CRESCE);
});
test('C4 acrescentar uma entrada ao ficheiro commitado: ok', () => {
  esperaOk(em({ '2026-10.md': ficheiro('2026-10', [E1, E2, E3]) }), L_CRESCE);
});
test('C4 acrescentar um ficheiro novo (2026-11.md): ok', () => {
  esperaOk(em({ '2026-10.md': OUT, '2026-11.md': NOV.replace('E-004', 'E-003') }), L_CRESCE);
});
test('C4 mudar só o STATUS de uma entrada commitada: ok', () => {
  esperaOk(em({ '2026-10.md': OUT.replace('- STATUS: prevented', '- STATUS: recurred') }), L_CRESCE);
});
test('C4 editar o SYMPTOM de uma entrada commitada: FAIL', () => {
  esperaFail(em({ '2026-10.md': OUT.replace('- SYMPTOM: the test port', '- SYMPTOM: a test port') }), L_CRESCE);
});
test('C4 editar o SYMPTOM e mudar o STATUS da mesma entrada: FAIL', () => {
  esperaFail(em({ '2026-10.md': OUT.replace('- SYMPTOM: the test port', '- SYMPTOM: a test port').replace('- STATUS: prevented', '- STATUS: recurred') }), L_CRESCE);
});
test('C4 apagar a última entrada commitada: FAIL', () => {
  esperaFail(em({ '2026-10.md': ficheiro('2026-10', [E1]) }), L_CRESCE);
});
test('C4 apagar a primeira entrada commitada: FAIL', () => {
  esperaFail(em({ '2026-10.md': ficheiro('2026-10', [E2.replace('E-002', 'E-001')]) }), L_CRESCE);
});
test('C4 apagar o ficheiro commitado inteiro: FAIL', () => {
  esperaFail(em({ '2026-11.md': NOV.replace('E-004', 'E-001') }), L_CRESCE);
});
test('C4 reordenar as entradas commitadas: FAIL', () => {
  esperaFail(em({ '2026-10.md': ficheiro('2026-10', [E2, E1]) }), L_CRESCE);
});
test('C4 inserir uma entrada no meio das commitadas: FAIL', () => {
  esperaFail(em({ '2026-10.md': ficheiro('2026-10', [E1, E3, E2]) }), L_CRESCE);
});
test('C4 mudar o STATUS de uma entrada commitada e acrescentar uma entrada: ok', () => {
  esperaOk(em({ '2026-10.md': OUT.replace('\n- STATUS: prevented\n', '\n- STATUS: escalated\n') + '\n' + E3 }), L_CRESCE);
});
test('C4 GUARDA: a linha do C1 continua a correr com git (o histórico não troca a validação)', () => {
  esperaOk(em({ '2026-10.md': OUT }), L_FORMA);
});