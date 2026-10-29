// Corpus literal da Ronda −1 do F-09: os casos dos oráculos dos critérios 1, 3 e 4, escritos à mão (nunca calculados como o código).
// Peças do lote: pa, pb e pc, com owns src/<id>.js e tests/<id>.test.mjs. Fora do lote: src/core.js, tests/core.test.mjs, tests/e2e/*.

// Critério 1: [modo, peças, aceita?] — 8 casos
export const SIZES = [
  ['rigorous', 3, true], ['rigorous', 4, false], ['rigorous', 5, false], ['rigorous', 6, false],
  ['accelerated', 3, true], ['accelerated', 4, true], ['accelerated', 5, true], ['accelerated', 6, false],
];

// Falhas. suite/e2e: as execuções (1..2 e 1..3) em que o teste falha; isolated: passa na repetição isolada; truthFlaky e owner: o
// veredito do contrato (só para mentir nos rótulos e para a leitura humana; os testes comparam com o `expect` literal de cada caso).
const F = {
  coreIntermitente: { test: 'tests/core.test.mjs > soma', files: ['tests/core.test.mjs', 'src/core.js'], suite: [2], isolated: true, truthFlaky: true, owner: null },
  aIntermitente: { test: 'tests/pa.test.mjs > exporta', files: ['tests/pa.test.mjs', 'src/pa.js'], suite: [1], isolated: true, truthFlaky: false, owner: 'pa' },
  coreEstavel: { test: 'tests/core.test.mjs > soma', files: ['tests/core.test.mjs', 'src/core.js'], suite: [1, 2], isolated: false, truthFlaky: false, owner: null },
  bEstavel: { test: 'tests/pb.test.mjs > le', files: ['tests/pb.test.mjs', 'src/pb.js'], suite: [1, 2], isolated: false, truthFlaky: false, owner: 'pb' },
  // «pelo diff»: o ficheiro do teste não é de nenhuma peça, mas o teste toca num ficheiro do lote
  coreTocaA: { test: 'tests/core.test.mjs > usa pa', files: ['tests/core.test.mjs', 'src/pa.js'], suite: [2], isolated: true, truthFlaky: false, owner: 'pa' },
  e2eIntermitente: { test: 'tests/e2e/home.spec.ts > abre', files: ['tests/e2e/home.spec.ts', 'src/core.js'], e2e: [3], isolated: true, truthFlaky: true, owner: null },
  aEstavel: { test: 'tests/pa.test.mjs > exporta', files: ['tests/pa.test.mjs', 'src/pa.js'], suite: [1, 2], isolated: false, truthFlaky: false, owner: 'pa' },
  cE2eEstavel: { test: 'tests/e2e/c.spec.ts > grava', files: ['tests/e2e/c.spec.ts', 'src/pc.js'], e2e: [1, 2, 3], isolated: false, truthFlaky: false, owner: 'pc' },
};
export const FAIL = F;

// Critério 4: os 4 casos do oráculo (+2 variantes: «pelo diff» e no E2E). expect: flaky, regressões peça|teste, aprovado
export const FLAKY_CASES = [
  ['1 intermitente fora do diff → flaky, não reprova', [F.coreIntermitente], { flaky: ['tests/core.test.mjs > soma'], regs: [], approved: true }],
  ['2 intermitente no diff → regressão de pa, reprova', [F.aIntermitente], { flaky: [], regs: ['pa|tests/pa.test.mjs > exporta'], approved: false }],
  ['3 estável fora do diff → não é flaky, reprova (PERGUNTA 3)', [F.coreEstavel], { flaky: [], regs: null, approved: false }],
  ['4 estável no diff → regressão de pb, reprova', [F.bEstavel], { flaky: [], regs: ['pb|tests/pb.test.mjs > le'], approved: false }],
  ['2b intermitente que toca num ficheiro de pa (pelo diff) → regressão de pa', [F.coreTocaA], { flaky: [], regs: ['pa|tests/core.test.mjs > usa pa'], approved: false }],
  ['1b intermitente fora do diff no E2E → flaky, não reprova', [F.e2eIntermitente], { flaky: ['tests/e2e/home.spec.ts > abre'], regs: [], approved: true }],
];

// Critério 3: os 3 casos do oráculo (+1: uma regressão ao lado de um flaky)
export const REGRESSION_CASES = [
  ['nenhuma regressão', [], { flaky: [], regs: [], approved: true }],
  ['uma regressão de uma peça (pa)', [F.aEstavel], { flaky: [], regs: ['pa|tests/pa.test.mjs > exporta'], approved: false }],
  ['duas regressões de peças diferentes (pa na suíte, pc no E2E)', [F.aEstavel, F.cE2eEstavel], { flaky: [], regs: ['pa|tests/pa.test.mjs > exporta', 'pc|tests/e2e/c.spec.ts > grava'], approved: false }],
  ['uma regressão de pb ao lado de um flaky fora do diff', [F.bEstavel, F.e2eIntermitente], { flaky: ['tests/e2e/home.spec.ts > abre'], regs: ['pb|tests/pb.test.mjs > le'], approved: false }],
];
