// V-06 (#130), R2: o oráculo por propriedade da correção 2 (mecanismo fixado pelo orquestrador na #130): a primeira instrução do avancar
// invalida o .forge/proxima-fase.json, por isso, com um ficheiro velho no sítio, TODA a saída ≠ 0 o deixa com `proximas: []` e `motivo`,
// seja qual for a classe: argumentos inválidos, provas, head, modo projeto, merge recusado ou pós-merge vermelho. Com saída 0 há fase nova.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpus, montaCenario, correAvancar, ambienteDoCenario, saida, limpa, AVANCAR, REPO, PR } from './helpers.mjs';

after(limpa);

const VELHO = JSON.stringify({ spec: 9100, geradoEm: '2026-10-01T00:00:00.000Z', proximas: [{ numero: 9105, titulo: 'V-15: velha' }] });
const poeVelho = (m) => { mkdirSync(join(m.trab, '.forge'), { recursive: true }); writeFileSync(join(m.trab, '.forge', 'proxima-fase.json'), VELHO); };
const lerFase = (m) => JSON.parse(readFileSync(join(m.trab, '.forge', 'proxima-fase.json'), 'utf8'));
const T = { timeout: 540000 };

test('fase velha: em todos os cenários do corpus, a saída ≠ 0 deixa proximas vazio com motivo; a saída 0 grava a fase desta corrida', T, async () => {
  const falhas = [];
  const todos = corpus();
  for (let i = 0; i < todos.length; i += 4) {
    await Promise.all(todos.slice(i, i + 4).map(async (c) => {
      const m = montaCenario({ ...c, nome: `fv-${c.nome}` });
      poeVelho(m);
      const r = await correAvancar(m);
      const fase = lerFase(m);
      if (r.status !== 0) {
        if (!Array.isArray(fase.proximas) || fase.proximas.length) falhas.push(`${c.nome}: saída ${r.status} e ficou ${JSON.stringify(fase.proximas)}`);
        else if (typeof fase.motivo !== 'string' || !fase.motivo) falhas.push(`${c.nome}: sem motivo`);
      } else if (JSON.stringify(fase) === VELHO || fase.motivo) falhas.push(`${c.nome}: saída 0 e a fase não é desta corrida\n${saida(r)}`);
    }));
  }
  assert.deepEqual(falhas, []);
});

test('fase velha: toda a recusa de argumentos (lerArgs) deixa proximas vazio com motivo, antes de qualquer chamada ao gh', T, async () => {
  const m = montaCenario({ ...corpus().find((c) => c.nome === 'tudo-ok'), nome: 'fv-args' });
  const base = ['--pr', String(PR), '--repo', REPO];
  const falhas = [];
  for (const args of [[], base, [...base, '--modo', 'tudo'], [...base, '--modo', 'projeto'], [...base, '--modo', 'projeto', '--integracao', '--x'],
    [...base, '--modo', 'forge', '--integracao', 'int'], ['--pr', '0', '--repo', REPO, '--modo', 'forge'], ['--pr', String(PR), '--repo', 'x', '--modo', 'forge'],
    [...base, '--modo', 'forge', '--desconhecido', 'x'], [...base, '--modo']]) {
    poeVelho(m);
    const r = spawnSync(process.execPath, [AVANCAR, ...args], { cwd: m.trab, env: ambienteDoCenario(m), encoding: 'utf8' });
    const fase = lerFase(m);
    if (r.status !== 2) falhas.push(`${args.join(' ')}: saída ${r.status}`);
    else if (fase.proximas.length || !fase.motivo) falhas.push(`${args.join(' ')}: ficou ${JSON.stringify(fase)}`);
  }
  assert.deepEqual(falhas, []);
});
