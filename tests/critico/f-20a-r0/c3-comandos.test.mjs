// F-20a critério 3: as linhas de captura e da página-semente usam o binário resolvido, o data-dir e a URL do projeto.
// Oráculo: o espião regista o argv e o AI_MEMORY_SERVER_URL efetivo de cada spawn.
// - todos os spawns do ai-memory (fora os --version) usam o bin resolvido, com --data-dir <dataDir> e com a URL do projeto;
// - os argv das duas linhas são os literais do contrato;
// - sem [forge] ou sem binário não há spawn além dos --version, e as duas linhas dão FAIL sem stack trace.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { L_CAPTURA, L_PAGINA, STACK, caixa, ambiente, binFalso, AIM_OK, toml, memoria, corre, linha, projeto, apaga, servidor, ehVersao, spawnsAim } from './helpers.mjs';

let proj, srv;
const caixas = [];
before(async () => { proj = await projeto(); srv = await servidor(); });
after(async () => { apaga(proj); caixas.forEach((c) => apaga(c.dir)); await srv.fecha(); });
const nova = () => { const c = caixa(); caixas.push(c); return c; };
const usaUrl = (c, url) => c.serverUrlEnv === url || c.args.some((a, i) => a === '--server-url' && c.args[i + 1] === url);
const vencedor = (r) => r.chamadas.find((c) => ehVersao(c) && c.fake); // cada cenário tem um só binário falso, e válido

for (const [via, monta] of [
  ['AI_MEMORY_BIN (pasta com espaço)', (sb) => ({ AI_MEMORY_BIN: binFalso(join(sb.dir, 'pasta com espaço', 'aim.exe'), AIM_OK('7.0.0', sb.dataDir)) })],
  ['PATH', (sb) => { binFalso(join(sb.pathDir, 'ai-memory.exe'), AIM_OK('7.0.0', sb.dataDir)); return { PATH: sb.pathDir }; }],
]) {
  test(`C3 (binário via ${via}): captura e página-semente com os argv literais do contrato, e todos os spawns do ai-memory com o bin resolvido, --data-dir e a URL do projeto`, async () => {
    const sb = nova();
    const env = monta(sb);
    toml(proj, { serverUrl: srv.url, dataDir: sb.dataDir });
    const { workspace: W, project: P } = memoria(proj);
    const r = await corre(proj, ambiente(sb, env));
    assert.ok(!STACK.test(r.out), 'stack trace no --env:\n' + r.out.slice(0, 2000));
    const v = vencedor(r);
    assert.ok(v, 'nenhum --version respondeu: ' + JSON.stringify(r.chamadas));
    const bin = v.cmd;
    const outros = spawnsAim(r);
    assert.ok(outros.length >= 2, 'faltam spawns do ai-memory: ' + JSON.stringify(outros));
    const maus = outros.filter((c) => c.cmd !== bin || c.args[0] !== '--data-dir' || c.args[1] !== sb.dataDir || !usaUrl(c, srv.url) || c.shell);
    assert.deepEqual(maus, [], 'spawns do ai-memory sem o bin resolvido (' + bin + '), sem --data-dir ' + sb.dataDir + ' ou sem a URL ' + srv.url);
    const cap = outros.filter((c) => c.args.includes('hook'));
    assert.deepEqual(cap.map((c) => c.args), [['--data-dir', sb.dataDir, 'hook', '--event', 'user-prompt-submit', '--agent', 'claude-code', '--server-url', srv.url, '--check-capture']]);
    const pag = outros.filter((c) => c.args.includes('read-page'));
    assert.deepEqual(pag.map((c) => c.args), [['--data-dir', sb.dataDir, 'read-page', '--path', '_rules/framework.md', '--workspace', W, '--project', P]]);
    assert.equal(pag[0].serverUrlEnv, srv.url, 'o read-page corre sem AI_MEMORY_SERVER_URL=<serverUrl>');
    // os nomes das duas linhas não mudam, e com o binário falso a responder como o ai-memory as duas dão ok
    assert.deepEqual(linha(r, L_CAPTURA), ['ok    ' + L_CAPTURA]);
    assert.deepEqual(linha(r, L_PAGINA), ['ok    ' + L_PAGINA]);
  });
}

for (const [nome, monta] of [
  ['sem [forge]', (sb) => { toml(proj, null); return { AI_MEMORY_BIN: binFalso(join(sb.dir, 'bin', 'ai-memory.exe'), AIM_OK('7.0.0', sb.dataDir)), AI_MEMORY_URL: srv.url }; }],
  ['sem binário', (sb) => { toml(proj, { serverUrl: srv.url, dataDir: sb.dataDir }); return {}; }],
]) {
  test(`C3 ${nome}: nenhum spawn do ai-memory além dos --version, e as linhas de captura e da página-semente dão FAIL sem stack trace`, async () => {
    const sb = nova();
    const r = await corre(proj, ambiente(sb, monta(sb)));
    assert.deepEqual(r.chamadas.filter((c) => !ehVersao(c) && (c.fake || /ai-memory/i.test(c.cmd) || c.args.some((a) => /check-capture|read-page/.test(a)))), [], 'spawns além dos --version');
    for (const n of [L_CAPTURA, L_PAGINA]) assert.deepEqual(linha(r, n).map((l) => l.slice(0, 6)), ['FAIL  '], 'a linha ' + n + ' não é um FAIL único:\n' + r.out.slice(0, 1500));
    assert.ok(!STACK.test(r.out), 'stack trace no --env:\n' + r.out.slice(0, 2000));
  });
}