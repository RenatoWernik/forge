// V-03 critério C5 (tempo). O manifesto deixa de ter `blocos`: os do f-06 deixam de ser precisos. As 3 medições da Ronda 0 do V-03 ficam em
// FORGE_V03_MEDICOES, a pasta com os 3 resultados de `executor --todas`, um por corrida. Cada uma está completa, sem falhas nem limite e com
// as suítes todas do manifesto. A mediana do relógio, de 3 corridas, fica ≤ 600 s.
// LEITURA: o relógio de cada resultado é fim − início. Como o --continuar mantém o início, isto inclui as chamadas e o que há entre elas, e
// fica ≥ à soma das chamadas: passar aqui é mais exigente do que o critério.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { soNoTicket } from '../_comum/ambito.mjs';
import { ROOT, lerJson } from './helpers.mjs';

const MANIFESTO = join(ROOT, 'scripts', 'suites.json');

test('C5: nenhuma suíte de scripts/suites.json tem blocos (os do f-06 saíram)', () => {
  const m = lerJson(MANIFESTO);
  assert.deepEqual(m.suites.filter((s) => s.blocos).map((s) => s.nome), []);
});
test('ÂMBITO: C5 — as 3 medições (FORGE_V03_MEDICOES) são --todas completas, sem falhas nem limite, e a mediana do relógio é ≤ 600 s', (t) => {
  if (soNoTicket(t, 'v-03')) return;
  const dir = process.env.FORGE_V03_MEDICOES;
  if (!dir) return t.skip('C5: FORGE_V03_MEDICOES não definido (a medição é verificada pelo crítico da R1)');
  assert.ok(existsSync(dir), `FORGE_V03_MEDICOES=${dir} não existe`);
  const nomes = lerJson(MANIFESTO).suites.map((s) => s.nome).sort();
  const fs = readdirSync(dir).filter((n) => n.endsWith('.json')).sort();
  assert.equal(fs.length, 3, `esperava 3 medições, há ${fs.length}: ${fs.join(', ')}`);
  const relogio = fs.map((n) => {
    const r = lerJson(join(dir, n));
    assert.equal(r.completo, true, `${n}: incompleto`);
    assert.deepEqual(Object.keys(r.suites).sort(), nomes, `${n}: as suítes não são as do manifesto`);
    const mas = r.unidades.filter((u) => u.estado !== 'pass' || u.fail > 0).map((u) => `${u.ficheiro}: ${u.estado}, fail ${u.fail}`);
    assert.deepEqual(mas, [], `${n}: unidades com falha, limite ou erro`);
    return (Date.parse(r.fim) - Date.parse(r.inicio)) / 1000;
  }).sort((a, b) => a - b);
  t.diagnostic(`relógio: ${relogio.map((s) => Math.round(s)).join(', ')} s`);
  assert.ok(relogio[1] <= 600, `mediana ${Math.round(relogio[1])} s > 600 s`);
});