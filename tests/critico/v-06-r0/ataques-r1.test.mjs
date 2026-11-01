// Crítico R1 do V-06 (#130, PR #144, HEAD 60b286f): ataques próprios contra as propriedades de segurança do avancar.mjs.
// Copiado tal como estava no crítico (E:\Guilda\.checkpoints\critico-forge-v06-r1-scripts\ataques-r1.test.mjs); só mudou o import dos helpers.
// A1: um VEREDITO REPROVADO do MESMO head, posterior ao APROVADO, no formato real dos críticos (BOM do PowerShell; cabeçalho + bloco de
//     código), tem de bloquear o merge: o «último comentário com VEREDITO» é o REPROVADO. Esperado: saída 2, 0 pr merge, origem intacta.
// A2: correr o avancar outra vez depois de um merge feito (PR já MERGED) nunca faz um 2.º merge: saída 2 e 1 só pr merge no total.
// A3 (lacuna, não segurança): um .forge/proxima-fase.json de uma corrida anterior não pode ficar a parecer a fase desta corrida vermelha.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { montaCenario, correAvancar, saida, prMerges, merges, limpa } from './helpers.mjs';
after(limpa);

const CAMPOS = 'BARRA: critérios de aceite — critérios visuais 0/0 — vencedor cego: empate (nosso era A)';
const aprovado = { corpo: `VEREDITO: APROVADO\nHEAD: @H\nEXECUTOR: .forge/resultados/@H-limpa-p1.json @SHA256\n${CAMPOS}\nCRITÉRIOS: 5/5\nFALHAS (todas, numeradas): nenhuma` };
const check = { corpo: 'CHECK-TICKET: VERDE @H @SHA256' };
const reprovadoCorpo = 'VEREDITO: REPROVADO\nHEAD: @H\nEXECUTOR: .forge/resultados/@H-limpa-p1.json @SHA256\n' + CAMPOS
  + '\nCRITÉRIOS: 4/5\nFALHAS (todas, numeradas): 1. C2 — falha de segurança — tests/critico/v-99-r0/c2.test.mjs';
const base = (nome, comentarios, posMerge = 'verde') => ({ nome, modo: 'forge', comentarios,
  pr: { isDraft: false, base: 'main', posMerge, headMuda: false } });

const VARIANTES = [
  ['BOM do PowerShell (Out-File utf8) antes do VEREDITO', `\uFEFF${reprovadoCorpo}`],
  ['cabeçalho + bloco de código (formato real dos críticos no forge)', `## Crítico R2 — V-99 (PR #9110), HEAD @H\n\n\`\`\`\n${reprovadoCorpo}\n\`\`\``],
  ['BOM + cabeçalho + bloco de código (9 de 18 vereditos reais no forge começam por BOM)', `\uFEFF## Crítico R2\n\n\`\`\`\n${reprovadoCorpo}\n\`\`\``],
];
for (const [i, [nome, corpo]] of VARIANTES.entries()) {
  test(`A1.${i + 1}: REPROVADO posterior do mesmo head, ${nome}: recusa (2), 0 pr merge, origem intacta`, { timeout: 300000 }, async () => {
    const m = montaCenario(base(`a1-${i + 1}`, [aprovado, check, { corpo }]));
    const r = await correAvancar(m);
    const diz = saida(r);
    assert.equal(prMerges(r).length, 0, `fez pr merge com um REPROVADO posterior do head\n${diz}`);
    assert.equal(merges(r).length, 0, `merge feito\n${diz}`);
    assert.deepEqual(r.refsDepois, m.refsAntes, 'a origem mudou');
    assert.equal(r.status, 2, diz);
  });
}

test('A2: segundo avancar sobre o mesmo PR depois do merge (PR MERGED): recusa (2) e nenhum 2.º pr merge', { timeout: 300000 }, async () => {
  const m = montaCenario(base('a2-rerun', [aprovado, check]));
  const r1 = await correAvancar(m);
  assert.equal(r1.status, 0, saida(r1));
  assert.equal(merges(r1).length, 1, saida(r1));
  const depois1 = r1.refsDepois;
  const r2 = await correAvancar(m);
  const diz = saida(r2);
  assert.equal(r2.status, 2, diz);
  assert.equal(prMerges(r2).length, 1, `chamadas pr merge no total (2 corridas)\n${diz}`);
  assert.equal(merges(r2).length, 1, diz);
  assert.deepEqual(r2.refsDepois, depois1, 'a origem mudou na 2.ª corrida (revert, push ou 2.º merge)');
});

test('A3 (LACUNA): pós-merge vermelho com um .forge/proxima-fase.json de uma corrida anterior: não fica uma fase seguinte velha', { timeout: 300000 }, async () => {
  const m = montaCenario(base('a3-velho', [aprovado, check], 'vermelho'));
  mkdirSync(join(m.trab, '.forge'), { recursive: true });
  const velho = JSON.stringify({ spec: 9100, geradoEm: '2026-10-01T00:00:00.000Z', proximas: [{ numero: 9105, titulo: 'V-15: velha' }] });
  writeFileSync(join(m.trab, '.forge', 'proxima-fase.json'), velho);
  const r = await correAvancar(m);
  assert.equal(r.status, 1, saida(r));
  const f = join(m.trab, '.forge', 'proxima-fase.json');
  assert.ok(!existsSync(f) || readFileSync(f, 'utf8') !== velho, 'a fase seguinte da corrida anterior ficou intacta depois de um pós-merge vermelho');
});