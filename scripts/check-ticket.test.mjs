// Testes do passo `lint` do check-ticket (V-08, #132): o `lints` do manifesto. O resto do check-ticket é provado por tests/critico/v-05-r0/ e v-08-r0/.
// Sem merge-base com a base o resto do check-ticket falha logo, por isso estes testes são rápidos.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHECK = fileURLToPath(new URL('./check-ticket.mjs', import.meta.url));
const pastas = [];
after(() => { for (const d of pastas) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

const linhaDoLint = (manifesto) => {
  const d = mkdtempSync(join(tmpdir(), 'forge-check-teste-'));
  pastas.push(d);
  mkdirSync(join(d, '.claude'));
  writeFileSync(join(d, '.claude/suites.json'), JSON.stringify(manifesto));
  const g = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...a], { cwd: d, encoding: 'utf8' });
  g('init', '-q'); g('add', '-A'); g('commit', '-q', '-m', 'x');
  const t = join(d, 'tmp');
  mkdirSync(t);
  const r = spawnSync(process.execPath, [CHECK, '--ambito', '**', '--base', 'nao-existe', '--raiz', d], { cwd: d, encoding: 'utf8', timeout: 120000, env: { ...process.env, TEMP: t, TMP: t, TMPDIR: t } });
  return (r.stdout + r.stderr).split(/\r?\n/).find((l) => /^(ok|FAIL|pendente) lint\b/.test(l));
};
const base = { versao: 1, paralelo: 1, vagas_globais: 1, carga_sensivel: 1, orcamento_s: 30, suites: [{ nome: 's', tipo: 'comando', comando: ['node', '-v'] }] };

test('lint: `lints: []` dá ok com o motivo dito por extenso, nunca um ok mudo', () => {
  assert.equal(linhaDoLint({ ...base, lints: [] }), 'ok lint (nenhum lint declarado)');
});

test('lint: um lint declarado que não existe é FAIL com o nome dele', () => {
  assert.match(linhaDoLint({ ...base, lints: ['scripts/nao-existe.test.mjs'] }), /^FAIL lint .*scripts\/nao-existe\.test\.mjs em falta/);
});

test('lint: `lints` que não é uma lista de caminhos é FAIL, não uma exceção', () => {
  for (const lints of ['scripts/x.test.mjs', [1], [''], {}]) assert.match(linhaDoLint({ ...base, lints }), /^FAIL lint \(suites\.json: lints tem de ser uma lista de caminhos\)/, JSON.stringify(lints));
});
