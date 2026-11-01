// Ronda −1 do V-11 (#135, com a RESPOSTA 6563406653): o lint L1/L2/L3 do F-26 passa a ler também as pastas de legado.
// - (a) [comportamento do lint, corre sempre] numa cópia, um ficheiro novo com uma violação L1, L2 e L3 em CADA pasta de legado da base faz o lint
//   falhar com a regra e esse ficheiro: só as entradas de excecoes isentam, e um ficheiro novo não tem nenhuma;
// - (b) [âmbito do v-11] cada exceção é necessária e justificada: excecoes é uma lista de {ficheiro, regra, motivo} (regra L1, L2 ou L3, motivo
//   com pelo menos 15 caracteres, ficheiro que existe numa pasta de legado, sem repetidas) e, com excecoes: [] na cópia, o conjunto
//   (ficheiro, regra) das falhas do lint é exatamente o das excecoes.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { soNoTicket } from '../_comum/ambito.mjs';
import { LINT, LISTA, LEGADO, AMB, NOME_SO, SHA_PLANTADO, pastaDe, arvore, lerJson, copia, escreve, nodeTest, cauda, limpa } from './helpers.mjs';

after(limpa);
const PLANTA = {
  L1: "import { spawnSync } from 'node:child_process';\nspawnSync('git', ['show', '" + SHA_PLANTADO + ":README.md']);\n",
  L2: "import test from 'node:test';\ntest('" + AMB + " v11 plantado sem o helper', () => {});\n",
  L3: "import { spawnSync } from 'node:child_process';\nspawnSync('git', ['diff', '" + NOME_SO + "', 'HEAD']);\n",
};
const achados = (out) => new Set([...out.matchAll(/\b(L[123]) (tests\/critico\/[^\s:]+):\d+:/g)].map((m) => m[1] + ' ' + m[2]));

test('C4 (a) o lint lê as pastas de legado: um ficheiro novo com L1, L2 e L3 em cada uma das 31 dá FAIL com a regra e o ficheiro', () => {
  const d = copia();
  for (const p of LEGADO) for (const [regra, txt] of Object.entries(PLANTA)) escreve(d, `tests/critico/${p}/zz-v11-${regra.toLowerCase()}.mjs`, txt);
  const r = nodeTest(d, [LINT]);
  const a = achados(r.out);
  const faltam = LEGADO.flatMap((p) => Object.keys(PLANTA).map((regra) => `${regra} tests/critico/${p}/zz-v11-${regra.toLowerCase()}.mjs`)).filter((k) => !a.has(k));
  assert.notEqual(r.code, 0, 'o lint passou com as violações plantadas:\n' + cauda(r));
  assert.deepEqual(faltam, [], `${faltam.length} violação(ões) plantada(s) que o lint não apanhou`);
});

test('ÂMBITO: C4 (b) excecoes: cada entrada é {ficheiro, regra, motivo} válida numa pasta de legado, e são exatamente as falhas do lint sem elas', (t) => {
  if (soNoTicket(t, 'v-11')) return;
  const j = lerJson(LISTA);
  assert.ok(Array.isArray(j.legado) && j.legado.every((p) => typeof p === 'string'), 'legado continua uma lista de strings (RESPOSTA 6563406653)');
  assert.ok(Array.isArray(j.excecoes), `${LISTA} › excecoes não é uma lista de {ficheiro, regra, motivo}`);
  const maus = [], chaves = new Set(), existe = new Set(arvore());
  for (const e of j.excecoes) {
    const ok = e && typeof e.ficheiro === 'string' && ['L1', 'L2', 'L3'].includes(e.regra) && typeof e.motivo === 'string' && e.motivo.trim().length >= 15;
    if (!ok) { maus.push('entrada inválida: ' + JSON.stringify(e).slice(0, 200)); continue; }
    const k = e.regra + ' ' + e.ficheiro;
    if (chaves.has(k)) maus.push('repetida: ' + k);
    chaves.add(k);
    if (!existe.has(e.ficheiro) || !j.legado.includes(pastaDe(e.ficheiro))) maus.push('ficheiro inexistente ou fora de uma pasta de legado: ' + e.ficheiro);
  }
  assert.deepEqual(maus, []);
  const d = copia();
  writeFileSync(join(d, LISTA), JSON.stringify({ ...j, excecoes: [] }, null, 2) + '\n');
  const r = nodeTest(d, [LINT]);
  const a = achados(r.out);
  assert.ok(a.size >= 1, 'controlo: sem excecoes, o lint não deu nenhuma falha L1/L2/L3\n' + cauda(r));
  assert.deepEqual([...chaves].filter((k) => !a.has(k)).sort(), [], 'exceções que o lint não precisa (não há essa violação nesse ficheiro)');
  assert.deepEqual([...a].filter((k) => !chaves.has(k)).sort(), [], 'falhas do lint sem exceção (só aparecem sem excecoes? então o lint isenta por outra via)');
});