// F-25 C2: escrita atómica (scripts/painel-gravar.mjs, copiado pelo scaffold para .claude/painel-gravar.mjs) e o manual.
// Oráculos: 200 escritas seguidas com um leitor em ciclo noutro processo (nunca vê JSON inválido); JSON inválido ou com erros do
// validar() dá exit 1 com o sha256 igual e sem .tmp-*; a contagem de «node .claude/painel-gravar.mjs» no §6 e nos SAME_DATA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ROOT, BASE, GRAVAR, tmp, base, buildProject, sandboxEnv, git } from './helpers.mjs';

const CMD = 'node .claude/painel-gravar.mjs';
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const tmps = (dir) => readdirSync(dir).filter((n) => /\.tmp/i.test(n));
const gravar = (cwd, input) => spawnSync(process.execPath, ['.claude/painel-gravar.mjs'], { cwd, input, encoding: 'utf8', env: sandboxEnv(), timeout: 30000 });

let projetoGerado;
const gerado = async () => {
  assert.ok(existsSync(GRAVAR), 'falta scripts/painel-gravar.mjs');
  projetoGerado ??= await buildProject(join(tmp(), 'gerado'));
  return projetoGerado;
};

test('C2: o scaffold copia scripts/painel-gravar.mjs para .claude/painel-gravar.mjs, byte a byte, ao lado do leitor que importa', async () => {
  const dest = await gerado();
  const f = join(dest, '.claude/painel-gravar.mjs');
  assert.ok(existsSync(f), 'o projeto gerado não tem .claude/painel-gravar.mjs');
  assert.ok(readFileSync(f).equals(readFileSync(GRAVAR)), 'a cópia não é byte a byte');
  assert.ok(existsSync(join(dest, '.claude/painel-leitor.mjs')));
});

test('C2: um painel.json válido grava-se: exit 0, o ficheiro tem o objeto do stdin e não fica nenhum .tmp-*', async () => {
  const dest = await gerado();
  const o = { ...base(), objetivo: 'Gravado pelo painel-gravar' };
  const r = gravar(dest, JSON.stringify(o));
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(dest, '.checkpoints/painel.json'), 'utf8')), o);
  assert.deepEqual(tmps(join(dest, '.checkpoints')), []);
});

const RECUSAS = {
  'JSON partido': ['{"versao": 1, "modo": "rigo', []],
  'texto vazio': ['', []],
  'erros do validar()': [JSON.stringify({ ...base(), modo: 'turbo', tickets: [{ ...base().tickets[0], estado: 'feito' }] }), ['modo', 'tickets[0].estado']],
  'agente com caminho no checkpoint': [JSON.stringify({ ...base(), agentes: [{ ...base().agentes[0], checkpoint: '../fora.md' }] }), ['agentes[0].checkpoint']],
};
for (const [nome, [input, campos]] of Object.entries(RECUSAS)) {
  test(`C2: ${nome}: exit 1, mostra os erros, o sha256 do painel.json fica igual e não fica nenhum .tmp-*`, async () => {
    const dest = await gerado();
    const f = join(dest, '.checkpoints/painel.json');
    writeFileSync(f, JSON.stringify(base(), null, 2) + '\n');
    const antes = sha(f);
    const r = gravar(dest, input);
    assert.equal(r.status, 1, `exit ${r.status}; stderr: ${r.stderr}`);
    assert.ok(r.stderr.trim().length > 0, 'não mostra os erros');
    for (const c of campos) assert.ok(r.stderr.includes(c), `os erros não citam ${c}: ${r.stderr}`);
    assert.equal(sha(f), antes, 'o painel.json mudou');
    assert.deepEqual(tmps(join(dest, '.checkpoints')), []);
  });
}

test('C2: nunca deixa um .tmp-*, nem quando o rename falha (painel.json é uma pasta)', async () => {
  assert.ok(existsSync(GRAVAR), 'falta scripts/painel-gravar.mjs');
  const dest = join(tmp(), 'rename-falha');
  await buildProject(dest);
  const f = join(dest, '.checkpoints/painel.json');
  rmSync(f);
  mkdirSync(join(f, 'dentro'), { recursive: true });
  const r = gravar(dest, JSON.stringify(base()));
  assert.notEqual(r.status, 0, 'o rename para uma pasta não pode dar sucesso');
  assert.deepEqual(tmps(join(dest, '.checkpoints')), [], 'ficou um .tmp-* depois de uma escrita falhada');
});

test('C2: 200 escritas seguidas com o painel-gravar e um leitor em ciclo noutro processo: o leitor nunca vê JSON inválido', { timeout: 300000 }, async () => {
  const dest = await gerado();
  const f = join(dest, '.checkpoints/painel.json');
  const parar = join(tmp(), 'parar');
  const leitor = join(tmp(), 'leitor.cjs');
  writeFileSync(leitor, [
    "const fs = require('fs'); const [f, parar] = process.argv.slice(2);",
    'let lidas = 0, invalidas = 0, erros = 0; const exemplos = [];',
    'while (!fs.existsSync(parar)) {',
    "  let t; try { t = fs.readFileSync(f, 'utf8'); } catch { erros++; continue; }",
    '  try { JSON.parse(t); lidas++; } catch { invalidas++; if (exemplos.length < 3) exemplos.push(t.slice(0, 60)); }',
    '}',
    'process.stdout.write(JSON.stringify({ lidas, invalidas, erros, exemplos }));',
  ].join('\n'));
  const proc = spawn(process.execPath, [leitor, f, parar], { stdio: ['ignore', 'pipe', 'inherit'] });
  let saida = '';
  proc.stdout.on('data', (d) => { saida += d; });
  const fim = new Promise((r) => proc.on('close', r));
  // ~100 KB por escrita: uma escrita que não seja atómica fica muito tempo a meio
  const grande = (i) => ({ ...base(), objetivo: `escrita ${i}`, tickets: Array.from({ length: 500 }, (_, k) => ({ id: `T-${k}`, issue: k + 1, titulo: `Ticket ${k} `.repeat(12), estado: 'dev', rondas: i % 3 })) });
  const falhas = [];
  for (let i = 0; i < 200; i++) {
    const r = spawnSync(process.execPath, ['.claude/painel-gravar.mjs'], { cwd: dest, input: JSON.stringify(grande(i)), encoding: 'utf8', env: sandboxEnv(), timeout: 30000 });
    if (r.status !== 0) falhas.push(`${i}: exit ${r.status} ${r.stderr.trim()}`);
  }
  writeFileSync(parar, '');
  await fim;
  const v = JSON.parse(saida);
  assert.deepEqual(falhas, [], 'escritas que falharam');
  assert.equal(v.invalidas, 0, `o leitor viu JSON inválido ${v.invalidas}× (ex.: ${JSON.stringify(v.exemplos)})`);
  assert.ok(v.lidas >= 20, `o leitor quase não leu (${v.lidas}): a prova não se sobrepôs às escritas`);
  assert.equal(JSON.parse(readFileSync(f, 'utf8')).objetivo, 'escrita 199');
  assert.deepEqual(tmps(join(dest, '.checkpoints')), []);
});

// O §6 do FRAMEWORK: do título «## 6.» ao título seguinte
const sec6 = (t) => { const i = t.indexOf('\n## 6.'); const j = t.indexOf('\n## ', i + 1); return t.slice(i, j < 0 ? undefined : j); };
const conta = (t, s) => t.split(s).length - 1;
const naBase = (rel) => { const r = git('show', `${BASE}:${rel}`); assert.equal(r.status, 0, r.stderr); return r.stdout.replace(/\r\n/g, '\n'); };
const atual = (rel) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

test('C2: o §6 do FRAMEWORK manda escrever o painel.json com «node .claude/painel-gravar.mjs» (1×) e mantém o texto que lá estava', () => {
  const novo = sec6(atual('templates/FRAMEWORK.md'));
  assert.equal(conta(novo, CMD), 1, `«${CMD}» aparece ${conta(novo, CMD)}× no §6`);
  for (const l of sec6(naBase('templates/FRAMEWORK.md')).split('\n').filter((x) => x.trim()))
    assert.ok(novo.includes(l), 'o §6 perdeu ou mudou esta linha: ' + l.slice(0, 120));
});

const sameData = (t) => { const m = /const SAME_DATA = (['"`])((?:\\.|(?!\1).)*)\1/s.exec(t); return m ? m[2] : null; };
for (const wf of ['gauntlet-build.js', 'gauntlet-batch.js', 'gauntlet-ponytail.js']) {
  test(`C2: o SAME_DATA de ${wf} manda escrever com «node .claude/painel-gravar.mjs» (1×) e mantém o texto que lá estava`, () => {
    const rel = `templates/.claude/workflows/${wf}`;
    const novo = sameData(atual(rel)), velho = sameData(naBase(rel));
    assert.ok(velho, 'sem SAME_DATA na base');
    assert.ok(novo, 'o SAME_DATA desapareceu');
    assert.equal(conta(novo, CMD), 1, `«${CMD}» aparece ${conta(novo, CMD)}× no SAME_DATA`);
    assert.ok(novo.includes(velho), 'o texto existente do SAME_DATA mudou (as mutações painel-estado-fora-do-* procuram-no)');
  });
}