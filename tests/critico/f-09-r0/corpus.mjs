// Corpus literal da Ronda −1 do F-09: os casos dos oráculos dos critérios 1, 3 e 4, mais as respostas R3, R5 e R6 do orquestrador,
// escritos à mão (nunca calculados como o código). Peças do lote: pa, pb e pc, com owns src/<id>.js e tests/<id>.test.mjs. Fora do
// lote: src/core.js, tests/core.test.mjs e tests/e2e/*.

// Critério 1: [modo, peças, aceita?] — 8 casos
export const SIZES = [
  ['rigorous', 3, true], ['rigorous', 4, false], ['rigorous', 5, false], ['rigorous', 6, false],
  ['accelerated', 3, true], ['accelerated', 4, true], ['accelerated', 5, true], ['accelerated', 6, false],
];

// Falhas. suite/e2e: as execuções (1..2 e 1..3) em que o teste falha; isolated: passa na repetição isolada; main: a prova na main
// ('all' falha sempre, 'some' intermitente, 'none' nunca falha, ausente = sem prova); cls e owners: o que o contrato manda (só para o
// tester falso mentir nos rótulos; os testes comparam com o `expect` literal de cada caso).
const core = 'tests/core.test.mjs > soma', coreF = ['tests/core.test.mjs', 'src/core.js'];
const F = {
  coreIntermitente: { test: core, files: coreF, suite: [2], isolated: true, cls: 'c', owners: [] },
  aIntermitente: { test: 'tests/pa.test.mjs > exporta', files: ['tests/pa.test.mjs', 'src/pa.js'], suite: [1], isolated: true, cls: 'a', owners: ['pa'] },
  coreIntermitenteFalhaIsolado: { test: core, files: coreF, suite: [1], isolated: false, cls: 'a', owners: [] },
  coreEstavelMainFalha: { test: core, files: coreF, suite: [1, 2], isolated: false, main: 'all', cls: 'b', owners: [] },
  coreEstavelMainIntermitente: { test: core, files: coreF, suite: [1, 2], isolated: false, main: 'some', cls: 'c', owners: [] },
  coreEstavelMainPassa: { test: core, files: coreF, suite: [1, 2], isolated: false, main: 'none', cls: 'a', owners: [] },
  coreEstavelSemMain: { test: core, files: coreF, suite: [1, 2], isolated: false, cls: 'a', owners: [] },
  bEstavel: { test: 'tests/pb.test.mjs > le', files: ['tests/pb.test.mjs', 'src/pb.js'], suite: [1, 2], isolated: false, cls: 'a', owners: ['pb'] },
  // «pelo diff»: o ficheiro do teste não é de nenhuma peça, mas o teste toca num ficheiro do lote
  coreTocaA: { test: 'tests/core.test.mjs > usa pa', files: ['tests/core.test.mjs', 'src/pa.js'], suite: [2], isolated: true, cls: 'a', owners: ['pa'] },
  e2eIntermitente: { test: 'tests/e2e/home.spec.ts > abre', files: ['tests/e2e/home.spec.ts', 'src/core.js'], e2e: [3], isolated: true, cls: 'c', owners: [] },
  // R6: falha em TODAS as execuções do lote e passa isolado, fora do diff (o caso da Guilda #103)
  sempreMainIntermitente: { test: 'tests/e2e/fila.spec.ts > vista', files: ['tests/e2e/fila.spec.ts', 'src/core.js'], e2e: [1, 2, 3], isolated: true, main: 'some', cls: 'c', owners: [] },
  sempreMainFalha: { test: 'tests/e2e/fila.spec.ts > vista', files: ['tests/e2e/fila.spec.ts', 'src/core.js'], e2e: [1, 2, 3], isolated: true, main: 'all', cls: 'b', owners: [] },
  sempreMainPassa: { test: 'tests/e2e/fila.spec.ts > vista', files: ['tests/e2e/fila.spec.ts', 'src/core.js'], e2e: [1, 2, 3], isolated: true, main: 'none', cls: 'a', owners: [] },
  sempreSemMain: { test: 'tests/e2e/fila.spec.ts > vista', files: ['tests/e2e/fila.spec.ts', 'src/core.js'], e2e: [1, 2, 3], isolated: true, cls: 'a', owners: [] },
  aEstavel: { test: 'tests/pa.test.mjs > exporta', files: ['tests/pa.test.mjs', 'src/pa.js'], suite: [1, 2], isolated: false, cls: 'a', owners: ['pa'] },
  cE2eEstavel: { test: 'tests/e2e/c.spec.ts > grava', files: ['tests/e2e/c.spec.ts', 'src/pc.js'], e2e: [1, 2, 3], isolated: false, cls: 'a', owners: ['pc'] },
  // R5: um teste que toca em 2 peças dá uma regressão a cada uma
  duasPecas: { test: 'tests/core.test.mjs > junta pa e pb', files: ['tests/core.test.mjs', 'src/pa.js', 'src/pb.js'], suite: [1, 2], isolated: false, cls: 'a', owners: ['pa', 'pb'] },
};
export const FAIL = F;

// Critério 4 (+ R3, R6 e as 2 lacunas fechadas): expect = classes por teste, regressões peça|teste (null = a peça não é verificada)
// e veredito
export const FLAKY_CASES = [
  ['1 intermitente fora do diff → c, passa', [F.coreIntermitente], { classes: { [core]: 'c' }, regs: [], verdict: 'pass' }],
  ['1c intermitente fora do diff que falha isolado, sem prova na main → a, falha', [F.coreIntermitenteFalhaIsolado], { classes: { [core]: 'a' }, regs: null, verdict: 'fail' }],
  ['2 intermitente no diff → a de pa, falha', [F.aIntermitente], { classes: { 'tests/pa.test.mjs > exporta': 'a' }, regs: ['pa|tests/pa.test.mjs > exporta'], verdict: 'fail' }],
  ['3 estável fora do diff, falha igual na main → b, passa (lacuna 2)', [F.coreEstavelMainFalha], { classes: { [core]: 'b' }, regs: [], verdict: 'pass' }],
  ['3 estável fora do diff, intermitente na main → c, passa (lacuna 1)', [F.coreEstavelMainIntermitente], { classes: { [core]: 'c' }, regs: [], verdict: 'pass' }],
  ['3 estável fora do diff, não falha na main → a, falha', [F.coreEstavelMainPassa], { classes: { [core]: 'a' }, regs: null, verdict: 'fail' }],
  ['3 estável fora do diff, sem prova na main → a, falha', [F.coreEstavelSemMain], { classes: { [core]: 'a' }, regs: null, verdict: 'fail' }],
  ['4 estável no diff → a de pb, falha', [F.bEstavel], { classes: { 'tests/pb.test.mjs > le': 'a' }, regs: ['pb|tests/pb.test.mjs > le'], verdict: 'fail' }],
  ['2b intermitente que toca num ficheiro de pa (pelo diff) → a de pa', [F.coreTocaA], { classes: { 'tests/core.test.mjs > usa pa': 'a' }, regs: ['pa|tests/core.test.mjs > usa pa'], verdict: 'fail' }],
  ['1b intermitente fora do diff no E2E → c, passa', [F.e2eIntermitente], { classes: { 'tests/e2e/home.spec.ts > abre': 'c' }, regs: [], verdict: 'pass' }],
  ['R6 falha sempre no lote, passa isolado, intermitente na main → c, passa', [F.sempreMainIntermitente], { classes: { 'tests/e2e/fila.spec.ts > vista': 'c' }, regs: [], verdict: 'pass' }],
  ['R6 falha sempre no lote, passa isolado, falha sempre na main → b, passa (lacuna 2)', [F.sempreMainFalha], { classes: { 'tests/e2e/fila.spec.ts > vista': 'b' }, regs: [], verdict: 'pass' }],
  ['lacuna 2: duas falhas b provadas na main e um c, sem nenhuma a → passa', [F.coreEstavelMainFalha, F.sempreMainFalha, F.e2eIntermitente], { classes: { [core]: 'b', 'tests/e2e/fila.spec.ts > vista': 'b', 'tests/e2e/home.spec.ts > abre': 'c' }, regs: [], verdict: 'pass' }],
  ['lacuna 2: uma b provada na main ao lado de uma a de pb → falha', [F.coreEstavelMainFalha, F.bEstavel], { classes: { [core]: 'b', 'tests/pb.test.mjs > le': 'a' }, regs: ['pb|tests/pb.test.mjs > le'], verdict: 'fail' }],
  ['R6 falha sempre no lote, passa isolado, nunca falha na main → a, falha', [F.sempreMainPassa], { classes: { 'tests/e2e/fila.spec.ts > vista': 'a' }, regs: null, verdict: 'fail' }],
  ['R6 falha sempre no lote, passa isolado, sem prova na main → a, falha', [F.sempreSemMain], { classes: { 'tests/e2e/fila.spec.ts > vista': 'a' }, regs: null, verdict: 'fail' }],
];

// Critério 3 (+ R5): os 3 casos do oráculo, uma regressão ao lado de um flaky, e um teste que toca em 2 peças
export const REGRESSION_CASES = [
  ['nenhuma regressão', [], { classes: {}, regs: [], verdict: 'pass' }],
  ['uma regressão de uma peça (pa)', [F.aEstavel], { classes: { 'tests/pa.test.mjs > exporta': 'a' }, regs: ['pa|tests/pa.test.mjs > exporta'], verdict: 'fail' }],
  ['duas regressões de peças diferentes (pa na suíte, pc no E2E)', [F.aEstavel, F.cE2eEstavel], { classes: { 'tests/pa.test.mjs > exporta': 'a', 'tests/e2e/c.spec.ts > grava': 'a' }, regs: ['pa|tests/pa.test.mjs > exporta', 'pc|tests/e2e/c.spec.ts > grava'], verdict: 'fail' }],
  ['uma regressão de pb ao lado de um flaky fora do diff', [F.bEstavel, F.e2eIntermitente], { classes: { 'tests/pb.test.mjs > le': 'a', 'tests/e2e/home.spec.ts > abre': 'c' }, regs: ['pb|tests/pb.test.mjs > le'], verdict: 'fail' }],
  ['R5 um teste que toca em pa e pb → uma regressão a cada peça', [F.duasPecas], { classes: { 'tests/core.test.mjs > junta pa e pb': 'a' }, regs: ['pa|tests/core.test.mjs > junta pa e pb', 'pb|tests/core.test.mjs > junta pa e pb'], verdict: 'fail' }],
];
