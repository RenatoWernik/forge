// Ronda −1 do F-20b (#71), C4: nenhum segredo sai (reprova sempre). Dois canários: um token falso em <dataDir>/auth-tokens/default (escrito pelo
// init falso, ou já lá antes) e AI_MEMORY_AUTH_TOKEN=<canário 2> no ambiente do sys.
// Oráculos: nenhum canário em nenhum ficheiro do projeto (incluindo o .mcp.json, o settings.local.json e o .ai-memory.local.toml), no stdout ou no stderr do --plan e do --apply, nem nos argumentos de nenhum sys.run ou
// sys.spawn; os ficheiros do projeto não têm a string --auth-token nem a chave AI_MEMORY_AUTH_TOKEN.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { CANARIO_1, CANARIO_2, CONFIG_INICIAL, caixa, dataDirWin, sysFalso, plano, aplica, projeto, apaga, ficheiros, portaLivre, MCP, LOCAL, TOML_LOCAL } from './helpers.mjs';

const limpar = [];
after(async () => { for (const f of limpar) await f(); });

const verifica = (proj, regs, saidas) => {
  const maus = [];
  for (const rel of ficheiros(proj)) {
    const t = readFileSync(join(proj, rel), 'utf8');
    for (const k of [CANARIO_1, CANARIO_2, '--auth-token', 'AI_MEMORY_AUTH_TOKEN']) if (t.includes(k)) maus.push(`ficheiro ${rel}: ${k}`);
  }
  for (const [nome, s] of Object.entries(saidas)) for (const k of [CANARIO_1, CANARIO_2]) if (s.includes(k)) maus.push(`saída do ${nome}: ${k}`);
  for (const x of [...regs.run.map((r) => ['run', r]), ...regs.spawn.map((r) => ['spawn', r])]) {
    const a = JSON.stringify([x[1].cmd, ...x[1].args]);
    for (const k of [CANARIO_1, CANARIO_2, '--auth-token']) if (a.includes(k)) maus.push(`args do ${x[0]}: ${k} em ${a}`);
  }
  return maus;
};

test('C4 projeto novo (o init escreve o token): nenhum canário nos ficheiros do projeto, nas saídas do --plan e do --apply, nem nos args de run e spawn', async () => {
  const sb = caixa(), proj = await projeto(), f = sysFalso(sb);
  limpar.push(f.fecha, () => apaga(sb.dir), () => apaga(proj));
  const p = await plano(proj, f.sys);
  assert.equal(p.code, 0, p.out);
  const a1 = await aplica(proj, f.sys);
  assert.equal(a1.code, 0, a1.out);
  assert.equal(readFileSync(join(dataDirWin(sb), 'auth-tokens', 'default'), 'utf8').trim(), CANARIO_1, 'fixture: o init falso não correu');
  for (const rel of [MCP, LOCAL, TOML_LOCAL]) assert.ok(existsSync(join(proj, rel)), 'o canário tem de cobrir ' + rel + ', que não foi escrito');
  const a2 = await aplica(proj, f.sys);
  assert.deepEqual(verifica(proj, f.regs, { '--plan': p.out, '--apply 1': a1.out, '--apply 2': a2.out }), []);
});

test('C4 data-dir já com o token: o mesmo, com o servidor já a responder (estado on)', async () => {
  const port = await portaLivre();
  const sb = caixa(), proj = await projeto(), f = sysFalso(sb, { portas: [port, port, port] });
  limpar.push(f.fecha, () => apaga(sb.dir), () => apaga(proj));
  const dd = dataDirWin(sb);
  mkdirSync(join(dd, 'auth-tokens'), { recursive: true });
  writeFileSync(join(dd, 'config.toml'), CONFIG_INICIAL() + `\n# token file: auth-tokens/default\n`);
  writeFileSync(join(dd, 'auth-tokens', 'default'), CANARIO_1 + '\n');
  const p = await plano(proj, f.sys);
  await f.levanta(port, dd);
  const a = await aplica(proj, f.sys);
  assert.equal(a.code, 0, a.out);
  assert.deepEqual(verifica(proj, f.regs, { '--plan': p.out, '--apply': a.out }), []);
});