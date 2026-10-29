// F-15a critério 5 (D8): com env.AI_MEMORY_BIN a apontar para um executável, esse é o PRIMEIRO candidato do ai-memory: a versão vem
// desse binário, sem «missing» nem proposta de instalação em %LOCALAPPDATA%. Com um caminho inexistente, o doctor continua pelos
// candidatos de hoje. Oráculo: os 3 casos do contrato com o sys falso (variável válida 2.3.2, inválida, ausente) nas 3 plataformas,
// mais a ordem (válida ganha ao PATH), o MCP que segue o dono, e a injeção: um AI_MEMORY_BIN com `;`, aspas ou `$()` nunca é
// interpretado como comando, nem pelo doctor (ensaio real do script, sem rede e sem PATH) nem nos comandos impressos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { ROOT, registry, loadDoctor, fakeSys, LATEST_URLS, PLATFORMS, commandsOf, unsafeAt, tmp, sandboxEnv, semRedeEnv } from './helpers.mjs';

const BIN = 'D:\\bin dir\\aim\\ai-memory.exe';
const CJ = join('/h', '.claude.json');
const run = async (platform, env, exec, files = { [CJ]: JSON.stringify({ mcpServers: { 'ai-memory': {} } }) }) => {
  const { runDoctor } = await loadDoctor();
  const calls = [];
  const r = await runDoctor({ components: registry().components }, fakeSys({ platform, env, exec, files, calls, urls: LATEST_URLS() }));
  return { by: Object.fromEntries(r.components.map((c) => [c.id, c])), calls, report: r };
};
const aim = (by) => [by['ai-memory'], by['ai-memory-mcp']];

for (const [platform] of PLATFORMS) {
  test(`C5 (${platform}) variável válida (2.3.2): a versão vem do binário de AI_MEMORY_BIN, sem missing, e é o primeiro candidato (ganha ao ai-memory do PATH)`, async () => {
    const { by, calls } = await run(platform, { AI_MEMORY_BIN: BIN }, { [BIN + ' --version']: 'ai-memory 2.3.2', 'ai-memory --version': 'ai-memory 3.2.10' });
    const [cli, mcp] = aim(by);
    assert.equal(cli.installed, true);
    assert.equal(cli.installedVersion, '2.3.2', 'a versão não veio do AI_MEMORY_BIN');
    assert.equal(cli.status, 'outdated');
    assert.equal(mcp.status === 'missing', false, 'MCP registado ficou missing');
    assert.equal(mcp.installedVersion, '2.3.2', 'o MCP não segue a versão do dono encontrado por AI_MEMORY_BIN');
    const first = calls.find((c) => c[0] === BIN || c[0] === 'ai-memory' || /ai-memory(\.exe)?$/.test(c[0]));
    assert.deepEqual(first, [BIN, '--version'], 'o primeiro candidato do ai-memory não foi o AI_MEMORY_BIN, inteiro e sem shell');
  });

  test(`C5 (${platform}) variável inválida: o doctor continua pelos candidatos de hoje (o do PATH responde 3.2.10 → ok)`, async () => {
    const { by } = await run(platform, { AI_MEMORY_BIN: 'D:\\nao existe\\ai-memory.exe' }, { 'ai-memory --version': 'ai-memory 3.2.10' });
    const [cli, mcp] = aim(by);
    assert.equal(cli.installedVersion, '3.2.10');
    assert.equal(cli.status, 'ok');
    assert.equal(mcp.status, 'ok');
  });

  test(`C5 (${platform}) variável ausente: tudo como hoje (process.env não conta; o PATH responde 3.2.10 → ok)`, async () => {
    process.env.AI_MEMORY_BIN = BIN; // um doctor que leia o process.env em vez do sys.env cai aqui
    try {
      const { by, calls } = await run(platform, {}, { 'ai-memory --version': 'ai-memory 3.2.10', [BIN + ' --version']: 'ai-memory 2.3.2' });
      assert.equal(by['ai-memory'].installedVersion, '3.2.10');
      assert.equal(by['ai-memory'].status, 'ok');
      assert.ok(!calls.some((c) => c[0] === BIN), 'usou o AI_MEMORY_BIN do process.env');
    } finally { delete process.env.AI_MEMORY_BIN; }
  });
}

test('C5 (win32) variável válida (MCP registado): nenhum missing, e nenhum comando do ai-memory nem do MCP propõe instalar ou extrair em %LOCALAPPDATA%', async () => {
  const { by } = await run('win32', { AI_MEMORY_BIN: BIN }, { [BIN + ' --version']: 'ai-memory 2.3.2' });
  for (const c of aim(by)) {
    assert.notEqual(c.status, 'missing', c.id);
    assert.deepEqual((c.command ?? []).filter((x) => /LOCALAPPDATA/i.test(x)), [], `${c.id} (${c.status}) propõe %LOCALAPPDATA% com AI_MEMORY_BIN definido`);
  }
});

// PERGUNTA 5: o contrato diz «nem proposta de instalação em %LOCALAPPDATA%»; com o MCP por registar, o install-mcp de hoje corre
// o binário de %LOCALAPPDATA%, que nesta máquina não existe. O crítico lê isto como dentro do critério 5.
test('C5 (win32) variável válida (MCP por registar): o ai-memory não fica missing e o install do MCP não corre o binário de %LOCALAPPDATA%', async () => {
  const { by } = await run('win32', { AI_MEMORY_BIN: BIN }, { [BIN + ' --version']: 'ai-memory 2.3.2' }, {});
  assert.notEqual(by['ai-memory'].status, 'missing');
  for (const c of aim(by)) assert.deepEqual((c.command ?? []).filter((x) => /LOCALAPPDATA/i.test(x)), [], `${c.id} (${c.status}) usa %LOCALAPPDATA% com AI_MEMORY_BIN definido`);
});

// AI_MEMORY_BIN hostil: o doctor nunca o passa a uma shell nem o parte em argumentos; os comandos impressos nunca o executam
const PS = ["D:\\aim$(Write-Warning critico7f3)\\ai-memory.exe", "D:\\aim'; Write-Warning critico7f3; '\\ai-memory.exe", 'D:\\aim"; Write-Warning critico7f3; "\\ai-memory.exe', 'D:\\aim&Write-Warning critico7f3'];
const SH = ['/aim$(touch critico7f3)/ai-memory', '/aim`touch critico7f3`/ai-memory', "/aim'; touch critico7f3; '/ai-memory", '/aim"; touch critico7f3; "/ai-memory', '/aim; touch critico7f3'];
const SHELLS = /^(sh|bash|zsh|cmd|cmd\.exe|powershell|powershell\.exe|pwsh|pwsh\.exe)$/i;
for (const [platform, key] of PLATFORMS) {
  test(`reprova sempre (${platform}): um AI_MEMORY_BIN com ;, aspas ou $() não é interpretado como comando, nem pelo doctor nem nos comandos impressos`, async () => {
    const [payloads, token, dialect] = key === 'windows' ? [PS, 'Write-Warning critico7f3', 'ps'] : [SH, 'touch critico7f3', 'sh'];
    const maus = [];
    for (const p of payloads) {
      for (const files of [undefined, {}]) { // MCP registado (update do dono) e MCP por registar (install do MCP)
        const { calls, report } = await run(platform, { AI_MEMORY_BIN: p }, { [p + ' --version']: 'ai-memory 2.3.2' }, files);
        for (const c of calls) {
          if (SHELLS.test(c[0])) maus.push(`exec numa shell: ${JSON.stringify(c)}`);
          if (c[0] !== p && c.some((a) => a.includes('critico7f3'))) maus.push(`AI_MEMORY_BIN partido em argumentos: ${JSON.stringify(c)}`);
        }
        for (const cmd of commandsOf(report)) if (unsafeAt(cmd, token, dialect).length) maus.push(`${JSON.stringify(p)} → ${cmd.slice(0, 200)}`);
      }
    }
    assert.deepEqual(maus, []);
  });
}

test('reprova sempre (ensaio real do script, sem rede e sem PATH): um AI_MEMORY_BIN que seria código numa shell não corre', () => {
  const d = tmp('critico-f15a-aim-');
  const log = join(d, 'rede.log');
  writeFileSync(log, '');
  const canary = (n) => join(d, 'canario-' + n).replace(/\\/g, '/');
  const js = (n) => `require('fs').writeFileSync('${canary(n)}','x')`;
  const valores = process.platform === 'win32'
    ? [`"${process.execPath}" -e "${js(1)}"`, `x & "${process.execPath}" -e "${js(2)}"`, `x" & "${process.execPath}" -e "${js(3)}`]
    : [`${process.execPath} -e "${js(1)}"`, `x; ${process.execPath} -e "${js(2)}"`, `x$(${process.execPath} -e "${js(3)}")`];
  for (const v of valores) {
    const env = sandboxEnv({ HOME: d, USERPROFILE: d, CLAUDE_CONFIG_DIR: join(d, 'cfg'), LOCALAPPDATA: d, TEMP: d, TMP: d, PATH: '', Path: '', AI_MEMORY_BIN: v, GITHUB_TOKEN: undefined, ...semRedeEnv(log) });
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts/doctor.mjs'), '--json'], { cwd: d, encoding: 'utf8', env, timeout: 240000 });
    assert.ok([0, 1].includes(r.status), 'o doctor rebentou com AI_MEMORY_BIN=' + v + '\n' + (r.stderr || '').slice(-800));
  }
  assert.deepEqual([1, 2, 3].filter((n) => existsSync(canary(n))), [], 'o AI_MEMORY_BIN foi executado como código por uma shell');
  const rede = readFileSync(log, 'utf8').split('\n').filter((l) => l && !/ fetch /.test(l));
  assert.deepEqual(rede, [], 'tentativas de rede fora do fetch stubado');
});
