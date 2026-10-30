// F-17 critério 1, pelo processo real: `node scripts/update.mjs ...` com HOME, USERPROFILE e CLAUDE_CONFIG_DIR em pastas temporárias
// e o espião do F-15b pré-carregado (espiao.mjs: zero rede, zero escritas, nenhum processo filho corre). O código de saída do processo
// é o que o `main` devolve: uma máquina vazia com a fixture gravada dá 4 (ATAQUE: 1 na base 712b690); uso inválido continua 2 (GUARDA).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { UPDATE, FIXTURE, ESPIAO, tmp, sandboxEnv, join, mkdirSync, writeFileSync, readFileSync, existsSync } from './helpers.mjs';

const corre = (args) => {
  const d = tmp('critico-f17-cli-');
  const home = join(d, 'home'), config = join(d, 'cfg dir'), log = join(d, 'espiao.log');
  mkdirSync(home, { recursive: true }); mkdirSync(config, { recursive: true }); writeFileSync(log, '');
  const r = spawnSync(process.execPath, [UPDATE, ...args], {
    cwd: d, encoding: 'utf8', timeout: 120000,
    env: sandboxEnv({ HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: config, AI_MEMORY_BIN: undefined, NODE_OPTIONS: `--import=${ESPIAO}`, CRITICO_LOG: log, GITHUB_TOKEN: undefined, GH_TOKEN: undefined }),
  });
  const eventos = readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.deepEqual(eventos.filter((e) => e.t === 'rede' || e.t === 'escrita'), [], 'reprova sempre: rede ou escrita no disco');
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

for (const extra of [[], ['--json']]) {
  test(`C2 ATAQUE processo real: --check ${extra.join(' ')} --versions <fixture> numa máquina vazia sai com 4`, () => {
    assert.ok(existsSync(FIXTURE), 'falta a fixture');
    const r = corre(['--check', ...extra, '--versions', FIXTURE]);
    assert.equal(r.status, 4, r.out.slice(-1200));
  });
}

test('C2 GUARDA processo real: uso inválido (--check --bogus) sai com 2', () => {
  const r = corre(['--check', '--bogus']);
  assert.equal(r.status, 2, r.out.slice(-800));
});
