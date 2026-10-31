// F-22a critério 1: campos e valores. A linha `learnings: every entry of learnings/ is well formed` dá FAIL quando falta um campo ou estão
// fora de ordem, um valor está fora dos enums, as datas falham (formato AAAA-MM-DD, REVIEW-BY < DATE), a CLASS não é kebab-case, ou o APPROVED
// falha (falta com text, existe com outra camada, não segue `yes, <AAAA-MM-DDThh:mm:ssZ>`). O detalhe nomeia cada falha `E-NNN <CAMPO>: <motivo>`.
// Sem learnings/, ou só com README.md, a linha fica ok com `(no entries)`.
// Oráculo próprio (independente do corpus do dev): uma entrada válida por camada (helpers.mjs) e uma mutação por regra, cada uma num cenário.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { L_FORMA, SEM_ENTRADAS, OBRIGATORIOS, CAMPOS, ENUMS, FALTA, entrada, ficheiro, projeto, caso, esperaFail, esperaOk, apaga } from './helpers.mjs';

let P;
before(async () => { P = await projeto(); });
after(() => apaga(P));
const um = (e) => ({ '2026-10.md': ficheiro('2026-10', [e]) });

test('C1 sem a pasta learnings/ a linha fica ok com «(no entries)»', () => {
  esperaOk(caso(P, null), L_FORMA, L_FORMA + ' ' + SEM_ENTRADAS);
});
test('C1 só com learnings/README.md a linha fica ok com «(no entries)»', () => {
  esperaOk(caso(P, { 'README.md': '# Learnings\n\nFormat: FRAMEWORK.md section 11.\n' }), L_FORMA, L_FORMA + ' ' + SEM_ENTRADAS);
});
test('C1 GUARDA DO ORÁCULO: uma entrada válida de cada camada, e todos os gatilhos, dão ok (alarme falso reprova)', () => {
  const camadas = ENUMS.PREVENTION, gat = ENUMS.TRIGGER;
  const es = camadas.map((c, i) => entrada(i + 1, c, { CLASS: 'classe-' + c, TRIGGER: gat[i] }));
  esperaOk(caso(P, um(es.join('\n'))), L_FORMA);
});
test('C1 GUARDA: cada valor de cada enum é aceite (STATUS, FAILS, SCOPE, CAUSE-OWNER e FAILED-LAYER variam)', () => {
  const es = ENUMS['FAILED-LAYER'].map((f, i) => entrada(i + 1, 'test', {
    CLASS: 'classe-' + i, 'FAILED-LAYER': f, 'CAUSE-OWNER': ENUMS['CAUSE-OWNER'][i % 5], STATUS: ENUMS.STATUS[i % 6], FAILS: ENUMS.FAILS[i % 2], SCOPE: ENUMS.SCOPE[i % 2],
  }));
  esperaOk(caso(P, um(es.join('\n'))), L_FORMA);
});

for (const campo of OBRIGATORIOS) {
  test(`C1 falta o campo ${campo}: FAIL com «E-001 ${campo}:»`, () => {
    esperaFail(caso(P, um(entrada(1, 'test', { [campo]: FALTA }))), L_FORMA, `E-001 ${campo}:`);
  });
}

const FORA = { TRIGGER: 'reviewer', 'CAUSE-OWNER': 'user', 'FAILED-LAYER': 'qa', PREVENTION: 'docs', FAILS: 'maybe', SCOPE: 'global', STATUS: 'done' };
for (const [campo, v] of Object.entries(FORA)) {
  test(`C1 ${campo} fora do enum («${v}»): FAIL com «E-001 ${campo}:»`, () => {
    esperaFail(caso(P, um(entrada(1, 'test', { [campo]: v }))), L_FORMA, `E-001 ${campo}:`);
  });
}

test('C1 campos fora de ordem (DETECTED-BY depois de SYMPTOM): FAIL que nomeia E-001 e um dos dois campos', () => {
  const ordem = [...CAMPOS];
  [ordem[2], ordem[3]] = [ordem[3], ordem[2]];
  esperaFail(caso(P, um(entrada(1, 'test', {}, ordem))), L_FORMA, /E-001 (DETECTED-BY|SYMPTOM):/);
});
test('C1 campos fora de ordem (APPROVED depois de STATUS, com text): FAIL que nomeia E-001 e um dos dois campos', () => {
  const ordem = CAMPOS.filter((c) => c !== 'APPROVED').concat('APPROVED');
  esperaFail(caso(P, um(entrada(1, 'text', {}, ordem))), L_FORMA, /E-001 (APPROVED|STATUS):/);
});

test('C1 DATE fora de AAAA-MM-DD («2026/10/20»): FAIL com «E-001 DATE:»', () => {
  esperaFail(caso(P, um(entrada(1, 'test', { DATE: '2026/10/20' }))), L_FORMA, 'E-001 DATE:');
});
test('C1 REVIEW-BY fora de AAAA-MM-DD («14-11-2026»): FAIL com «E-001 REVIEW-BY:»', () => {
  esperaFail(caso(P, um(entrada(1, 'test', { 'REVIEW-BY': '14-11-2026' }))), L_FORMA, 'E-001 REVIEW-BY:');
});
test('C1 REVIEW-BY < DATE (2026-10-19 < 2026-10-20): FAIL que nomeia E-001 e REVIEW-BY ou DATE', () => {
  esperaFail(caso(P, um(entrada(1, 'test', { 'REVIEW-BY': '2026-10-19' }))), L_FORMA, /E-001 (REVIEW-BY|DATE):/);
});
test('C1 GUARDA: REVIEW-BY = DATE é válido', () => {
  esperaOk(caso(P, um(entrada(1, 'test', { 'REVIEW-BY': '2026-10-20' }))), L_FORMA);
});

for (const c of ['Fixed-Test-Port', 'fixed_test_port', 'fixed--test-port', '-fixed-test-port', 'fixed test port']) {
  test(`C1 CLASS que não é kebab-case («${c}»): FAIL com «E-001 CLASS:»`, () => {
    esperaFail(caso(P, um(entrada(1, 'test', { CLASS: c }))), L_FORMA, 'E-001 CLASS:');
  });
}

test('C1 PREVENTION: text sem APPROVED: FAIL com «E-001 APPROVED:»', () => {
  esperaFail(caso(P, um(entrada(1, 'text', { APPROVED: FALTA }))), L_FORMA, 'E-001 APPROVED:');
});
for (const camada of ['test', 'memory']) {
  test(`C1 APPROVED com PREVENTION: ${camada}: FAIL com «E-001 APPROVED:»`, () => {
    esperaFail(caso(P, um(entrada(1, camada, { APPROVED: 'yes, 2026-10-20T10:00:00Z' }))), L_FORMA, 'E-001 APPROVED:');
  });
}
for (const v of ['yes 2026-10-20T10:00:00Z', 'yes, 2026-10-20 10:00:00', 'no, 2026-10-20T10:00:00Z', 'yes, 2026-10-20T10:00Z', 'yes']) {
  test(`C1 APPROVED que não segue «yes, <AAAA-MM-DDThh:mm:ssZ>» («${v}»): FAIL com «E-001 APPROVED:»`, () => {
    esperaFail(caso(P, um(entrada(1, 'text', { APPROVED: v }))), L_FORMA, 'E-001 APPROVED:');
  });
}

test('C1 o detalhe nomeia CADA falha: E-001 sem CAUSE e E-002 com TRIGGER fora do enum, as duas no detalhe', () => {
  const es = [entrada(1, 'test', { CAUSE: FALTA }), entrada(2, 'test', { CLASS: 'outra-classe', TRIGGER: 'reviewer' })];
  esperaFail(caso(P, um(es.join('\n'))), L_FORMA, 'E-001 CAUSE:', 'E-002 TRIGGER:');
});