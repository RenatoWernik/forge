// F-20a critério 2 (A2): a linha `ai-memory: server answers at <serverUrl> and is this project's` diz `ok` só no estado `on`; nos outros diz FAIL
// com o detalhe literal do contrato. AI_MEMORY_URL deixa de ser lida.
// Oráculos: (a) servidor HTTP falso em 127.0.0.1:0 + espião do `status --json` nos 6 estados (on, off, conflict com outro data_dir, conflict
// com o status a sair ≠ 0, sem [forge], sem binário), nunca `ok` fora de `on`; (b) a tabela de normalização do contrato (4 iguais, 2 diferentes),
// pelo seam `serverState` e, nas linhas win32, também pela caixa preta.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { PREFIXO_SRV, D_OFF, D_OUTRO, D_SEM_DIR, D_SEM_FORGE, D_SEM_BIN, STACK, carregaModulo, caixa, ambiente, binFalso, AIM_OK, statusOut, toml, corre, linha, projeto, apaga, servidor, portaFechada } from './helpers.mjs';

let proj, srv;
const caixas = [];
before(async () => { proj = await projeto(); srv = await servidor(); });
after(async () => { apaga(proj); caixas.forEach((c) => apaga(c.dir)); await srv.fecha(); });
const nova = () => { const c = caixa(); caixas.push(c); return c; };
const srvLines = (r) => linha(r, 'ai-memory: server answers');

// monta um cenário: binário falso em AI_MEMORY_BIN (ou nenhum), [forge] com a url dada (ou nenhuma), e corre o --env com o espião
const cenario = async ({ url, bin = (sb) => AIM_OK('7.0.0', sb.dataDir), forge = true, extra = {} }) => {
  const sb = nova();
  const env = { ...extra };
  if (bin) env.AI_MEMORY_BIN = binFalso(join(sb.dir, 'bin', 'ai-memory.exe'), bin(sb));
  toml(proj, forge ? { serverUrl: url, dataDir: sb.dataDir } : null);
  const r = await corre(proj, ambiente(sb, env));
  const ls = srvLines(r);
  assert.equal(ls.length, 1, 'linhas «ai-memory: server answers» no --env: ' + JSON.stringify(ls) + '\n' + r.out.slice(0, 1500));
  assert.ok(!STACK.test(r.out), 'stack trace no --env:\n' + r.out.slice(0, 2000));
  return { sb, r, l: ls[0] };
};
const falha = (l, url, detalhe) => {
  assert.ok(!l.startsWith('ok'), 'ok fora do estado on: ' + l);
  if (url) assert.ok(l.startsWith('FAIL  ' + PREFIXO_SRV(url)), 'prefixo errado: ' + l);
  else assert.ok(l.startsWith('FAIL  ai-memory: server answers'), 'prefixo errado: ' + l);
  assert.ok(l.endsWith(' ' + detalhe), `detalhe errado (esperado ${detalhe}): ${l}`);
};

test('C2 on: /healthz responde e o status --json devolve o data_dir do projeto: ok, com GET /healthz e o status com --data-dir e AI_MEMORY_SERVER_URL', async () => {
  srv.pedidos.length = 0;
  const { sb, r, l } = await cenario({ url: srv.url });
  assert.ok(l.startsWith('ok    ' + PREFIXO_SRV(srv.url)), 'não diz ok no estado on: ' + l);
  assert.ok(srv.pedidos.includes('GET /healthz'), 'o servidor não recebeu GET /healthz: ' + JSON.stringify(srv.pedidos));
  const st = r.chamadas.filter((c) => c.fake && c.args.includes('status'));
  assert.ok(st.length >= 1, 'o status --json não correu');
  for (const c of st) {
    assert.deepEqual(c.args, ['--data-dir', sb.dataDir, 'status', '--json']);
    assert.equal(c.serverUrlEnv, srv.url, 'o status corre sem AI_MEMORY_SERVER_URL=<serverUrl>');
  }
});

test('C2 off: nada responde na porta do projeto: FAIL com o detalhe off', async () => {
  const url = await portaFechada();
  const { l } = await cenario({ url });
  falha(l, url, D_OFF);
});

test('C2 conflict: /healthz responde mas o status devolve outro data_dir: FAIL com o detalhe de conflito (x reportado, y do projeto)', async () => {
  let outro;
  const { sb, l } = await cenario({ url: srv.url, bin: (sb) => { outro = sb.dataDir.replace(/aim-data$/, 'outro-projeto/data'); return { ...AIM_OK('7.0.0', sb.dataDir), status: statusOut(outro) }; } });
  falha(l, srv.url, D_OUTRO(srv.url, outro, sb.dataDir));
});

test('C2 conflict: /healthz responde mas o status sai ≠ 0: FAIL com o detalhe «did not report its data dir»', async () => {
  const { l } = await cenario({ url: srv.url, bin: (sb) => ({ ...AIM_OK('7.0.0', sb.dataDir), status: { code: 1, out: JSON.stringify({ data_dir: sb.dataDir }), err: 'boom' } }) });
  falha(l, srv.url, D_SEM_DIR(srv.url));
});

test('C2 conflict: /healthz responde e o status sai 0 mas sem data_dir: FAIL com o detalhe «did not report its data dir»', async () => {
  const { l } = await cenario({ url: srv.url, bin: (sb) => ({ ...AIM_OK('7.0.0', sb.dataDir), status: { code: 0, out: '{"version":"7.0.0"}' } }) });
  falha(l, srv.url, D_SEM_DIR(srv.url));
});

test('C2 sem [forge] no .ai-memory.toml: FAIL com o detalhe «not set up», mesmo com um servidor vivo em AI_MEMORY_URL', async () => {
  const { l } = await cenario({ url: srv.url, forge: false, extra: { AI_MEMORY_URL: srv.url } });
  falha(l, null, D_SEM_FORGE);
});

test('C2 sem binário: FAIL com o detalhe «no binary», mesmo com o servidor do projeto vivo', async () => {
  const { l } = await cenario({ url: srv.url, bin: null });
  falha(l, srv.url, D_SEM_BIN);
});

test('C2 AI_MEMORY_URL deixa de ser lida: com o [forge] numa porta fechada e AI_MEMORY_URL num servidor vivo, a linha é off e o servidor de AI_MEMORY_URL não recebe nada', async () => {
  const url = await portaFechada();
  srv.pedidos.length = 0;
  const { r, l } = await cenario({ url, extra: { AI_MEMORY_URL: srv.url } });
  falha(l, url, D_OFF);
  assert.deepEqual(srv.pedidos, [], 'o check pediu ao servidor de AI_MEMORY_URL');
  assert.ok(!r.out.includes(srv.url), 'a url de AI_MEMORY_URL aparece no --env');
});

// Tabela de normalização do contrato: [reportado, do projeto, plataforma, igual?]
const TABELA = [
  ['\\\\?\\C:\\X\\y', 'C:/X/y', 'win32', true],
  ['C:\\X\\y\\', 'c:/x/Y', 'win32', true],
  ['//?/C:/A', 'C:/A', 'win32', true],
  ['/home/a/x', '/home/a/x/', 'linux', true],
  ['/home/a/x', '/home/a/X', 'linux', false],
  ['C:/X/y', 'C:/X/yz', 'win32', false],
];
// `run` tem a assinatura do implementador (o contrato não a fixa): o falso aceita (cmd, args, opts) e devolve um resultado à spawnSync que também é a
// própria string do stdout, para servir a quem leia .status/.stdout, a quem use o valor como texto, e a quem o aguarde.
const runFalso = (reportado, chamadas) => (...a) => {
  chamadas.push(a);
  const out = JSON.stringify({ data_dir: reportado });
  return Object.assign(new String(out), { status: 0, code: 0, exitCode: 0, ok: true, stdout: out, stderr: '', output: [null, out, ''], signal: null, error: undefined });
};
const fetchFalso = (pedidos) => async (u) => { pedidos.push(String(u?.url ?? u)); return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }); };

for (const [rep, proj_, plat, igual] of TABELA) {
  for (const [x, y] of [[rep, proj_], [proj_, rep]]) {
    test(`C2 normalização (serverState, ${plat}): reportado ${JSON.stringify(x)} e do projeto ${JSON.stringify(y)} → ${igual ? 'on' : 'conflict'}`, async () => {
      const { serverState } = carregaModulo();
      const chamadas = [], pedidos = [];
      const s = await serverState({ serverUrl: 'http://127.0.0.1:1', dataDir: y, bin: 'ai-memory-falso', platform: plat, fetch: fetchFalso(pedidos), run: runFalso(x, chamadas) });
      assert.ok(pedidos.some((u) => u === 'http://127.0.0.1:1/healthz'), 'não pediu /healthz: ' + JSON.stringify(pedidos));
      assert.ok(chamadas.length >= 1, 'o status não correu');
      assert.equal(s.state, igual ? 'on' : 'conflict', JSON.stringify(s));
    });
  }
}

test('C2 normalização (caixa preta, win32): as linhas win32 da tabela dão ok quando iguais e FAIL de conflito quando diferentes', { skip: process.platform !== 'win32' && 'só em win32' }, async () => {
  const maus = [];
  for (const [rep, dd, plat, igual] of TABELA.filter((t) => t[2] === 'win32')) {
    const sb = nova();
    const env = { AI_MEMORY_BIN: binFalso(join(sb.dir, 'bin', 'ai-memory.exe'), { ...AIM_OK('7.0.0', dd), status: statusOut(rep) }) };
    toml(proj, { serverUrl: srv.url, dataDir: dd });
    const r = await corre(proj, ambiente(sb, env));
    const [l = '(sem linha)'] = srvLines(r);
    if (igual ? !l.startsWith('ok    ' + PREFIXO_SRV(srv.url)) : !(l.startsWith('FAIL  ') && l.includes('(port conflict:'))) maus.push(`${rep} vs ${dd} (${plat}, ${igual ? 'igual' : 'diferente'}): ${l}`);
  }
  assert.deepEqual(maus, []);
});