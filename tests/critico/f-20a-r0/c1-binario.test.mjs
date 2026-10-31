// F-20a critério 1 (A1): a linha `ai-memory: binary` do `check.cjs --env` diz `ok` com o caminho e a versão do candidato vencedor; sem nenhum
// candidato válido é a linha FAIL literal. Oráculo: a tabela de 7 cenários do contrato, com binários falsos em pastas temporárias e o espião a
// responder ao `--version` (cada candidato com uma versão diferente, para o vencedor se ver pela versão), mais CANDIDATES = components.json.
// O cenário 7 corre também sem espião, com o padrão de canários de tests/critico/f-15a-r0/c5-ai-memory-bin.test.mjs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { ROOT, FAIL_BIN, STACK, carregaModulo, caixa, ambiente, binFalso, AIM_OK, corre, linha, projeto, apaga, fwd } from './helpers.mjs';

let proj;
const caixas = [];
before(async () => { proj = await projeto(); });
after(() => { apaga(proj); caixas.forEach((c) => apaga(c.dir)); });
const nova = () => { const c = caixa(); caixas.push(c); return c; };
const binLine = (r) => linha(r, 'ai-memory: binary');
const igualCaminho = (l, p) => fwd(l).toLowerCase().includes(fwd(p).toLowerCase());

test('C1 CANDIDATES é igual, pela mesma ordem, a components.json › ai-memory › installed[0].commands', () => {
  const comps = JSON.parse(readFileSync(join(ROOT, 'components.json'), 'utf8')).components;
  const esperado = comps.find((c) => c.id === 'ai-memory').installed[0].commands;
  assert.deepEqual(esperado, ['%AI_MEMORY_BIN%', 'ai-memory', '%LOCALAPPDATA%/ai-memory/ai-memory.exe', '~/Applications/ai-memory/ai-memory', '~/.local/bin/ai-memory'], 'controlo: components.json mudou');
  assert.deepEqual(carregaModulo().CANDIDATES, esperado);
});

// cada cenário: (sb) => { env extra, vencedor: { versão, caminho? } | null }
const CENARIOS = [
  ['(1) AI_MEMORY_BIN válido e PATH também: ganha o AI_MEMORY_BIN', (sb) => {
    const bin = binFalso(join(sb.dir, 'meu bin', 'aim-custom.exe'), AIM_OK('7.1.1', sb.dataDir));
    binFalso(join(sb.pathDir, 'ai-memory.exe'), AIM_OK('7.2.2', sb.dataDir));
    return { env: { AI_MEMORY_BIN: bin, PATH: sb.pathDir }, versao: '7.1.1', caminho: bin, perde: ['7.2.2'] };
  }],
  ['(2) AI_MEMORY_BIN aponta para um ficheiro inexistente, PATH válido: ganha o PATH', (sb) => {
    binFalso(join(sb.pathDir, 'ai-memory.exe'), AIM_OK('7.2.2', sb.dataDir));
    return { env: { AI_MEMORY_BIN: join(sb.dir, 'nao-existe', 'ai-memory.exe'), PATH: sb.pathDir }, versao: '7.2.2' };
  }],
  ['(3) só %LOCALAPPDATA%/ai-memory/ai-memory.exe: ganha esse', (sb) => {
    const bin = binFalso(join(sb.local, 'ai-memory', 'ai-memory.exe'), AIM_OK('7.3.3', sb.dataDir));
    return { env: {}, versao: '7.3.3', caminho: bin };
  }],
  ['(4) só ~/.local/bin/ai-memory: ganha esse', (sb) => {
    const bin = binFalso(join(sb.home, '.local', 'bin', 'ai-memory'), AIM_OK('7.4.4', sb.dataDir));
    return { env: {}, versao: '7.4.4', caminho: bin };
  }],
  ['(5) um candidato existe mas o --version responde «foo 1.0»: é saltado (ganha o seguinte, ~/.local/bin/ai-memory)', (sb) => {
    const foo = binFalso(join(sb.dir, 'foo', 'ai-memory.exe'), { ...AIM_OK('0.0.0', sb.dataDir), version: 'foo 1.0' });
    binFalso(join(sb.local, 'ai-memory', 'ai-memory.exe'), { ...AIM_OK('0.0.0', sb.dataDir), version: 'foo 1.0' });
    const bin = binFalso(join(sb.home, '.local', 'bin', 'ai-memory'), AIM_OK('7.5.5', sb.dataDir));
    return { env: { AI_MEMORY_BIN: foo }, versao: '7.5.5', caminho: bin, perde: ['foo 1.0'] };
  }],
  ['(5b) o único candidato que existe responde «foo 1.0»: é saltado e a linha é a FAIL literal', (sb) => {
    binFalso(join(sb.home, '.local', 'bin', 'ai-memory'), { ...AIM_OK('0.0.0', sb.dataDir), version: 'foo 1.0' });
    return { env: {}, versao: null };
  }],
  ['(6) nada: a linha FAIL literal', () => ({ env: {}, versao: null })],
];

for (const [nome, monta] of CENARIOS) {
  test('C1 ' + nome, async () => {
    const sb = nova();
    const c = monta(sb);
    const r = await corre(proj, ambiente(sb, c.env));
    const ls = binLine(r);
    assert.equal(ls.length, 1, 'linhas «ai-memory: binary» no --env: ' + JSON.stringify(ls) + '\n' + r.out.slice(0, 1500));
    const [l] = ls;
    if (c.versao === null) {
      assert.equal(l, FAIL_BIN);
    } else {
      assert.ok(l.startsWith('ok    ai-memory: binary'), 'não diz ok: ' + l);
      assert.ok(l.includes(c.versao), `não diz a versão do vencedor (${c.versao}): ${l}`);
      if (c.caminho) assert.ok(igualCaminho(l, c.caminho), `não diz o caminho do vencedor (${c.caminho}): ${l}`);
      for (const p of c.perde ?? []) assert.ok(!l.includes(p), `ganhou o candidato errado (${p}): ${l}`);
    }
    assert.ok(!STACK.test(r.out), 'stack trace no --env:\n' + r.out.slice(0, 2000));
    assert.deepEqual(r.chamadas.filter((x) => x.shell), [], 'chamadas com shell');
  });
}

// (7) AI_MEMORY_BIN hostil
const SHELLS = /(^|[\\/])(sh|bash|zsh|dash|cmd|powershell|pwsh)(\.exe)?$/i;
const HOSTIS = ['x & calc', 'x && calc', 'x | calc', '$(calc)', '`calc`', 'x; calc', '"x" & calc', "x' & calc '", 'C:\\a b\\"; calc; "\\ai-memory.exe'];
test('C1 (7) AI_MEMORY_BIN hostil (&, |, ;, $(), crases, aspas): nenhuma chamada com shell, nenhuma shell, e o valor nunca é partido em argumentos', async () => {
  const maus = [];
  for (const v of HOSTIS) {
    const sb = nova();
    const r = await corre(proj, ambiente(sb, { AI_MEMORY_BIN: v }));
    for (const c of r.chamadas) {
      if (c.shell) maus.push(`${JSON.stringify(v)}: chamada com shell ${JSON.stringify(c)}`);
      if (SHELLS.test(c.cmd)) maus.push(`${JSON.stringify(v)}: shell ${JSON.stringify(c)}`);
      if (c.cmd !== v && [c.cmd, ...c.args].some((a) => a.includes('calc'))) maus.push(`${JSON.stringify(v)}: partido em argumentos ${JSON.stringify(c)}`);
    }
    const [l] = binLine(r);
    if (l !== FAIL_BIN) maus.push(`${JSON.stringify(v)}: a linha não é a FAIL literal: ${l}`);
  }
  assert.deepEqual(maus, []);
});

test('reprova sempre (7, ensaio real sem espião, sem PATH): um AI_MEMORY_BIN que seria código numa shell não corre (nenhum canário)', async () => {
  const sb = nova();
  const canary = (n) => fwd(join(sb.dir, 'canario-' + n));
  const js = (n) => `require('fs').writeFileSync('${canary(n)}','x')`; // o ` --` final faz o node passar o --version que o check acrescenta ao script, em vez de o tratar como opção
  const valores = process.platform === 'win32'
    ? [`"${process.execPath}" -e "${js(1)}" --`, `x & "${process.execPath}" -e "${js(2)}" --`, `x" & "${process.execPath}" -e "${js(3)}`, `x $(& "${process.execPath}" -e "${js(4)}")`]
    : [`${process.execPath} -e "${js(1)}" --`, `x; ${process.execPath} -e "${js(2)}" --`, `x$(${process.execPath} -e "${js(3)}")`, `x\`${process.execPath} -e "${js(4)}"\``];
  for (const v of valores) {
    const r = await corre(proj, ambiente(sb, { AI_MEMORY_BIN: v }), { espiao: false });
    assert.ok([0, 1].includes(r.status), 'o check rebentou com AI_MEMORY_BIN=' + v + '\n' + r.out.slice(-800));
  }
  assert.deepEqual([1, 2, 3, 4].filter((n) => existsSync(canary(n))), [], 'o AI_MEMORY_BIN foi executado como código por uma shell');
});