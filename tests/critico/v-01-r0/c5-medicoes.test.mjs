// V-01 critério C5 (a base verde, medida): o FORMATO das 3 medições que o dev anexa à Ronda 0. A medição em si (3 corridas reais de
// `node scripts/executor.mjs --todas`, a mediana de relógio ≤ 1 500 s somando as chamadas) é verificada pelo crítico da R1, não aqui.
// FORGE_V01_MEDICOES = a pasta com os 3 ficheiros de resultados (cópias de .forge/resultados/<sha>-<arvore>-p1.json, uma por corrida).
// Sem a variável, o teste faz skip com o motivo: é o que acontece dentro das próprias corridas do C5, que correm esta pasta.
// Oráculo: exatamente 3 .json; cada um passa o esquema da spec §4.2, está completo, tem as suítes todas do manifesto e cada ficheiro de teste
// que os `ficheiros` do manifesto casam, e nenhuma unidade com estado diferente de «pass» (nem falha, nem limite).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, globSync } from 'node:fs';
import { join } from 'node:path';
import { soNoTicket } from '../_comum/ambito.mjs';
import { ROOT, MANIFESTO, lerJson, validaResultado } from './helpers.mjs';

test('ÂMBITO: C5 — as 3 medições da Ronda 0 (FORGE_V01_MEDICOES) são resultados completos de --todas, com todas as suítes, sem falhas e sem limite', (t) => {
  if (soNoTicket(t, 'v-01')) return;
  const dir = process.env.FORGE_V01_MEDICOES;
  if (!dir) return t.skip('C5: FORGE_V01_MEDICOES não definido (a pasta das 3 medições da Ronda 0; a medição é verificada pelo crítico da R1)');
  assert.ok(existsSync(dir), `FORGE_V01_MEDICOES=${dir} não existe`);
  assert.ok(existsSync(MANIFESTO), 'falta scripts/suites.json');
  const m = lerJson(MANIFESTO), nomes = m.suites.map((s) => s.nome).sort();
  const esperados = [...new Set(m.suites.flatMap((s) => (s.ficheiros || []).flatMap((g) => globSync(g, { cwd: ROOT }).map((f) => f.replaceAll('\\', '/')))))].sort();
  const fs = readdirSync(dir).filter((n) => n.endsWith('.json')).sort();
  assert.equal(fs.length, 3, `esperava 3 medições, há ${fs.length}: ${fs.join(', ')}`);
  for (const n of fs) {
    const r = lerJson(join(dir, n));
    assert.deepEqual(validaResultado(r), [], n);
    assert.equal(r.completo, true, `${n}: incompleto`);
    assert.deepEqual(Object.keys(r.suites).sort(), nomes, `${n}: as suítes não são as do manifesto`);
    const corridos = new Set(r.unidades.map((u) => u.ficheiro));
    assert.deepEqual(esperados.filter((f) => !corridos.has(f)), [], `${n}: ficheiros do manifesto que não correram`);
    const mas = r.unidades.filter((u) => u.estado !== 'pass' || u.fail > 0).map((u) => `${u.ficheiro}${u.bloco ? ` [${u.bloco}]` : ''}: ${u.estado}, fail ${u.fail}`);
    assert.deepEqual(mas, [], `${n}: unidades com falha ou limite`);
    t.diagnostic(`${n}: ${r.unidades.length} unidades, relógio do ficheiro ${Math.round((Date.parse(r.fim) - Date.parse(r.inicio)) / 1000)} s`);
  }
});