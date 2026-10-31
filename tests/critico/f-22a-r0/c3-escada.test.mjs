// F-22a critério 3: escada, prazos e caminhos.
// - Recorrência: a mesma CLASS numa entrada de id maior exige PREVENTION estritamente mais forte do que a mais forte das anteriores dessa
//   classe (força: test 1, hook 2, check 2, contract 3, text 4, memory 5), salvo se essa já for test; senão FAIL com a mensagem literal
//   `E-NNN PREVENTION: class <c> recurred (E-xxx had <camada>), the prevention must climb a layer`.
// - Prazo curto: com text ou memory, REVIEW-BY ≤ DATE + 14 dias.
// - Caminhos: test, hook e check exigem PREVENTION-PATH, REGRESSION e CLEAN-CASE existentes (nenhum `none`); contract exige o PREVENTION-PATH
//   existente; text exige `CLAUDE.md`; memory exige o prefixo `ai-memory:`; nenhum caminho absoluto nem com um segmento `..`.
// Oráculo: um cenário por regra sobre a árvore falsa de helpers.mjs, e o caso válido memory → text → check → test.
// LACUNA DA BARRA: o C3 não diz a linha; aceita-se FAIL em qualquer linha `learnings:` (sem git a do C4 fica ok). O campo nomeado só se exige
// onde a regra o fixa (a mensagem da subida, e cada caminho pelo seu campo).
import { test, before, after } from 'node:test';
import { join, dirname, basename } from 'node:path';
import { L_FORMA, SUBIDA, ARVORE, entrada, ficheiro, projeto, caso, escreve, esperaFailLearnings, esperaOk, apaga } from './helpers.mjs';

let P;
before(async () => { P = await projeto(); });
after(() => apaga(P));
const um = (...es) => ({ '2026-10.md': ficheiro('2026-10', es) });
const fwd = (p) => p.replace(/\\/g, '/');

// Recorrência
test('C3 GUARDA DO ORÁCULO: a classe sobe memory → text → check → test e dá ok', () => {
  esperaOk(caso(P, um(entrada(1, 'memory'), entrada(2, 'text'), entrada(3, 'check'), entrada(4, 'test'))), L_FORMA);
});
test('C3 GUARDA: classes diferentes não se comparam (memory e memory em classes distintas dão ok)', () => {
  esperaOk(caso(P, um(entrada(1, 'memory', { CLASS: 'a-a' }), entrada(2, 'memory', { CLASS: 'b-b' }))), L_FORMA);
});
test('C3 GUARDA: test depois de test na mesma classe dá ok (a mais forte já é test)', () => {
  esperaOk(caso(P, um(entrada(1, 'test'), entrada(2, 'test'))), L_FORMA);
});
test('C3 a mesma camada outra vez (memory, memory): FAIL com a mensagem literal da subida', () => {
  esperaFailLearnings(caso(P, um(entrada(1, 'memory'), entrada(2, 'memory'))), SUBIDA('E-002', 'fixed-test-port', 'E-001', 'memory'));
});
test('C3 camada de força igual (hook 2 e depois check 2): FAIL com a mensagem literal da subida', () => {
  esperaFailLearnings(caso(P, um(entrada(1, 'hook'), entrada(2, 'check'))), SUBIDA('E-002', 'fixed-test-port', 'E-001', 'hook'));
});
test('C3 camada mais fraca (contract e depois text): FAIL com a mensagem literal da subida', () => {
  esperaFailLearnings(caso(P, um(entrada(1, 'contract'), entrada(2, 'text'))), SUBIDA('E-002', 'fixed-test-port', 'E-001', 'contract'));
});
test('C3 compara com a MAIS FORTE das anteriores, não com a última (check, memory, depois text): FAIL em E-002 e em E-003, as duas a nomear E-001 com check', () => {
  // a última anterior de E-003 é E-002 (memory, mais fraca do que text); a mais forte é E-001 (check)
  esperaFailLearnings(caso(P, um(entrada(1, 'check'), entrada(2, 'memory'), entrada(3, 'text'))), SUBIDA('E-002', 'fixed-test-port', 'E-001', 'check'), SUBIDA('E-003', 'fixed-test-port', 'E-001', 'check'));
});
test('C3 a recorrência atravessa ficheiros (memory em 2026-10.md, memory em 2026-11.md): FAIL com a mensagem literal da subida', () => {
  esperaFailLearnings(caso(P, {
    '2026-10.md': ficheiro('2026-10', [entrada(1, 'memory')]),
    '2026-11.md': ficheiro('2026-11', [entrada(2, 'memory', { DATE: '2026-11-02', 'REVIEW-BY': '2026-11-16' })]),
  }), SUBIDA('E-002', 'fixed-test-port', 'E-001', 'memory'));
});

// Prazo curto (DATE 2026-10-25: +14 dias = 2026-11-08, atravessa o mês)
for (const c of ['text', 'memory']) {
  test(`C3 GUARDA: ${c} com REVIEW-BY = DATE + 14 (2026-10-25 → 2026-11-08) dá ok`, () => {
    esperaOk(caso(P, um(entrada(1, c, { DATE: '2026-10-25', 'REVIEW-BY': '2026-11-08' }))), L_FORMA);
  });
  test(`C3 ${c} com REVIEW-BY = DATE + 15 (2026-10-25 → 2026-11-09): FAIL que nomeia E-001`, () => {
    esperaFailLearnings(caso(P, um(entrada(1, c, { DATE: '2026-10-25', 'REVIEW-BY': '2026-11-09' }))), 'E-001 ');
  });
}
test('C3 GUARDA: o prazo curto não se aplica a check (REVIEW-BY = DATE + 40 dá ok)', () => {
  esperaOk(caso(P, um(entrada(1, 'check', { DATE: '2026-10-20', 'REVIEW-BY': '2026-11-29' }))), L_FORMA);
});

// Caminhos
const FALTA_F = 'tests/learn/nao-existe.test.mjs';
for (const c of ['test', 'hook', 'check']) {
  for (const campo of ['PREVENTION-PATH', 'REGRESSION', 'CLEAN-CASE']) {
    test(`C3 ${c} com ${campo} que não existe no repositório: FAIL com «E-001 ${campo}:»`, () => {
      esperaFailLearnings(caso(P, um(entrada(1, c, { [campo]: FALTA_F }))), `E-001 ${campo}:`);
    });
    test(`C3 ${c} com ${campo}: none: FAIL com «E-001 ${campo}:»`, () => {
      esperaFailLearnings(caso(P, um(entrada(1, c, { [campo]: 'none' }))), `E-001 ${campo}:`);
    });
  }
}
test('C3 contract com PREVENTION-PATH que não existe: FAIL com «E-001 PREVENTION-PATH:»', () => {
  esperaFailLearnings(caso(P, um(entrada(1, 'contract', { 'PREVENTION-PATH': 'docs/nao-existe.md' }))), 'E-001 PREVENTION-PATH:');
});
test('C3 GUARDA: contract com o PREVENTION-PATH existente e REGRESSION e CLEAN-CASE none dá ok', () => {
  esperaOk(caso(P, um(entrada(1, 'contract'))), L_FORMA);
});
test('C3 text com PREVENTION-PATH que não é CLAUDE.md (AGENTS.md existe): FAIL com «E-001 PREVENTION-PATH:»', () => {
  esperaFailLearnings(caso(P, um(entrada(1, 'text', { 'PREVENTION-PATH': 'AGENTS.md' }))), 'E-001 PREVENTION-PATH:');
});
test('C3 memory com PREVENTION-PATH sem «ai-memory:» (gotchas/fixed-test-port.md): FAIL com «E-001 PREVENTION-PATH:»', () => {
  esperaFailLearnings(caso(P, um(entrada(1, 'memory', { 'PREVENTION-PATH': 'gotchas/fixed-test-port.md' }))), 'E-001 PREVENTION-PATH:');
});
test('C3 memory com PREVENTION-PATH de um ficheiro do repositório (CLAUDE.md): FAIL com «E-001 PREVENTION-PATH:»', () => {
  esperaFailLearnings(caso(P, um(entrada(1, 'memory', { 'PREVENTION-PATH': 'CLAUDE.md' }))), 'E-001 PREVENTION-PATH:');
});
for (const campo of ['PREVENTION-PATH', 'REGRESSION', 'CLEAN-CASE']) {
  test(`C3 test com ${campo} absoluto (o ficheiro existe): FAIL com «E-001 ${campo}:»`, () => {
    const rel = { 'PREVENTION-PATH': ARVORE.testPath, REGRESSION: ARVORE.regress, 'CLEAN-CASE': ARVORE.limpo }[campo];
    esperaFailLearnings(caso(P, um(entrada(1, 'test', { [campo]: fwd(join(P, rel)) }))), `E-001 ${campo}:`);
  });
  test(`C3 test com ${campo} com um segmento «..» que volta ao mesmo ficheiro existente: FAIL com «E-001 ${campo}:»`, () => {
    const rel = { 'PREVENTION-PATH': ARVORE.testPath, REGRESSION: ARVORE.regress, 'CLEAN-CASE': ARVORE.limpo }[campo];
    esperaFailLearnings(caso(P, um(entrada(1, 'test', { [campo]: rel.replace('tests/learn/', 'tests/learn/../learn/') }))), `E-001 ${campo}:`);
  });
}
test('C3 test com PREVENTION-PATH «../<ficheiro>» que existe fora do projeto: FAIL com «E-001 PREVENTION-PATH:»', () => {
  const nome = basename(P) + '-fora.test.mjs', fora = escreve(dirname(P), nome, '// fora do projeto\n');
  try { esperaFailLearnings(caso(P, um(entrada(1, 'test', { 'PREVENTION-PATH': '../' + nome }))), 'E-001 PREVENTION-PATH:'); } finally { apaga(fora); }
});
test('C3 contract com PREVENTION-PATH absoluto (o ficheiro existe): FAIL com «E-001 PREVENTION-PATH:»', () => {
  esperaFailLearnings(caso(P, um(entrada(1, 'contract', { 'PREVENTION-PATH': fwd(join(P, ARVORE.contrato)) }))), 'E-001 PREVENTION-PATH:');
});