// Crítico R1 do V-03 (#127): a fase 2 do executor que não corre nenhum dos testes do lote dá pass (falso verde).
// Mini-repo com o executor e o lote.mjs da árvore em FORGE_RAIZ. A suíte «conv» tem dois testes doLote cujo corpo FALHA sempre depois do doLote:
//   - b1: título simples (controlo): a fase 2 corre-o e a unidade fica fail;
//   - b2: título com uma barra invertida: o TAP escreve-a como «\\», a fase 2 procura «\\» literal, não corre nada e a unidade fica pass.
// Uso: node --test <este ficheiro>
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { ROOT as RAIZ } from './helpers.mjs';
const pai = mkdtempSync(join(tmpdir(), 'crit-v03-h2-')), d = join(pai, 'r');
after(() => process.env.H2_GUARDA || rmSync(pai, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
const escreve = (rel, txt) => { mkdirSync(dirname(join(d, rel)), { recursive: true }); writeFileSync(join(d, rel), txt); };
const corpo = (titulo) => `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { doLote } from '../_comum/lote.mjs';\n`
  + `test(${JSON.stringify(titulo)}, (t) => { const r = doLote(t, 'alvo', { corre: () => ({ status: 1 }) }); if (!r) return; assert.fail('a fase 2 correu: este teste falha sempre'); });\n`;

test('a fase 2 que não corre nenhum dos testes do lote não pode dar pass', () => {
  for (const f of ['scripts/executor.mjs', 'tests/critico/_comum/lote.mjs']) { mkdirSync(dirname(join(d, f)), { recursive: true }); cpSync(join(RAIZ, f), join(d, f)); }
  escreve('scripts/suites.json', JSON.stringify({ versao: 1, paralelo: 2, vagas_globais: 4, carga_sensivel: 2, orcamento_s: 300, suites: [
    { nome: 'alvo', tipo: 'node-test', ficheiros: ['tests/critico/x-alvo/*.test.mjs'], limite_s: 60 },
    { nome: 'conv', tipo: 'node-test', ficheiros: ['tests/critico/x-conv/*.test.mjs'], limite_s: 60 } ] }));
  escreve('tests/critico/x-alvo/a.test.mjs', `import { test } from 'node:test';\ntest('a', () => {});\n`);
  escreve('tests/critico/x-conv/b1.test.mjs', corpo('controlo: título simples'));
  escreve('tests/critico/x-conv/b2.test.mjs', corpo('barra \\ invertida no título'));
  escreve('.gitignore', '.forge/\n');
  const g = (...a) => spawnSync('git', ['-c', 'user.name=c', '-c', 'user.email=c@example.invalid', '-c', 'commit.gpgsign=false', ...a], { cwd: d, encoding: 'utf8' });
  g('init', '-q'); g('add', '-A'); g('commit', '-q', '-m', 'h2');
  const r = spawnSync(process.execPath, ['scripts/executor.mjs', '--todas'], { cwd: d, encoding: 'utf8', timeout: 300000, env: { ...process.env, TMP: pai, TEMP: pai, TMPDIR: pai } });
  const pasta = join(d, '.forge', 'resultados'), json = readdirSync(pasta).filter((x) => x.endsWith('.json'))[0];
  const us = JSON.parse(readFileSync(join(pasta, json), 'utf8')).unidades.filter((u) => u.suite === 'conv')
    .map((u) => `${u.ficheiro}: ${u.estado} pass ${u.pass} fail ${u.fail} skip ${u.skip}`);
  const b1 = us.find((x) => x.includes('b1.test')), b2 = us.find((x) => x.includes('b2.test'));
  assert.match(b1, /: fail /, 'controlo: a fase 2 devia correr o b1 e falhar\n' + us.join('\n') + '\n' + r.stdout);
  assert.doesNotMatch(b2, /: pass /, `a fase 2 não correu o teste do b2 e a unidade ficou pass (saída do executor ${r.status})\n` + us.join('\n') + '\n' + r.stdout);
});