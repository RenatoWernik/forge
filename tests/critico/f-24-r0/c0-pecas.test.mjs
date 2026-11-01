// Ronda −1 do F-24 (#80): as peças novas no projeto gerado e a junção dos hooks, com a RESPOSTA do orquestrador à PERGUNTA 1
// (comentário 6551678060, prevalece sobre o corpo): os hooks novos juntam-se ao `.claude/settings.local.json`, com as regras de junção do
// F-20b C2, e o `.claude/settings.json` versionado fica byte a byte. O memoria.mjs corre pelo `sys` falso do F-20b (f-20b-r0/helpers.mjs).
// Oráculos: a lista do dry run do scaffold, o settings.local.json depois de --apply (uma vez e duas), a merge-base com a origin/main
// para o vigia do F-13 e, só no ramo do ticket, o diff autorizado do scripts/scaffold.test.mjs.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import * as H from './helpers.mjs';
import * as B from '../f-20b-r0/helpers.mjs';

const CMD_CONTEXTO = 'node ${CLAUDE_PROJECT_DIR}/.claude/hooks/forge-contexto.mjs';
const CMD_RETOMA = 'node ${CLAUDE_PROJECT_DIR}/.claude/hooks/forge-retoma.mjs';
const texto = (h) => [h?.command, ...(Array.isArray(h?.args) ? h.args : [])].filter((x) => x !== undefined).join(' ').replace(/\\/g, '/');
// [{ evento, matcher, hook }] de todas as entradas do settings cujo comando é `cmd`, ou que nomeiam o script dele
const entradas = (s, cmd) => Object.entries(s?.hooks ?? {}).flatMap(([evento, gs]) => (Array.isArray(gs) ? gs : []).flatMap((g) => (g?.hooks ?? []).map((hook) => ({ evento, matcher: g.matcher, hook }))))
  .filter((x) => texto(x.hook) === cmd || texto(x.hook).includes(cmd.split('/').pop()));

const limpar = [];
after(async () => { for (const f of limpar) await f(); });
const cenario = async () => {
  const sb = B.caixa(), proj = await B.projeto(), f = B.sysFalso(sb);
  limpar.push(f.fecha, () => B.apaga(sb.dir), () => B.apaga(proj));
  return { sb, proj, ...f };
};

for (const [nome, over] of [['sem resposta de hooks', {}], ['com os três hooks do F-13', { hooks: { killByName: true, backgroundTests: true, idleWatch: true } }], ['com os três hooks recusados', { hooks: { killByName: false, backgroundTests: false, idleWatch: false } }]]) {
  test(`peças: o scaffold (${nome}) gera as 4 peças novas: ${H.PECAS.join(', ')}`, async () => {
    const { files } = await (await H.scaffoldFn())(H.ANSWERS(over), { dest: join(H.tmp(), 'seco'), dryRun: true });
    assert.deepEqual(H.PECAS.filter((p) => !files.includes(p)), [], 'em falta no dry run');
    const proj = await H.gerar(over);
    assert.deepEqual(H.PECAS.filter((p) => !H.existsSync(join(proj, p))), [], 'em falta no projeto gerado');
  });
}

test('memoria --plan lista os hooks novos (forge-contexto.mjs e forge-retoma.mjs)', async () => {
  const c = await cenario();
  const r = await B.plano(c.proj, c.sys);
  assert.equal(r.code, 0, r.out);
  for (const s of ['forge-contexto.mjs', 'forge-retoma.mjs']) assert.ok(r.out.includes(s), `o --plan não lista ${s}:\n${r.out}`);
});

test('memoria --apply junta ao settings.local.json o forge-contexto em UserPromptSubmit e PostToolUse e o forge-retoma em SessionStart matcher "compact", uma vez cada', async () => {
  const c = await cenario();
  const r = await B.aplica(c.proj, c.sys);
  assert.equal(r.code, 0, r.out);
  const s = B.leJson(c.proj, B.LOCAL);
  const ctx = entradas(s, CMD_CONTEXTO), ret = entradas(s, CMD_RETOMA);
  assert.deepEqual(ctx.map((x) => x.evento).sort(), ['PostToolUse', 'UserPromptSubmit'], JSON.stringify(ctx));
  assert.ok(ctx.every((x) => texto(x.hook) === CMD_CONTEXTO), 'o comando do forge-contexto não é «' + CMD_CONTEXTO + '»: ' + JSON.stringify(ctx.map((x) => x.hook)));
  assert.equal(ret.length, 1, JSON.stringify(ret));
  assert.equal(ret[0].evento, 'SessionStart');
  assert.equal(ret[0].matcher, 'compact');
  assert.equal(texto(ret[0].hook), CMD_RETOMA);
});

test('memoria --apply duas vezes não duplica os hooks novos, guarda os do utilizador e deixa o .claude/settings.json byte a byte', async () => {
  const c = await cenario();
  const alheio = { env: { MINHA: '1' }, hooks: { PostToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'echo meu-post' }] }], SessionStart: [{ matcher: 'compact', hooks: [{ type: 'command', command: 'echo meu-compact' }] }] } };
  B.escreve(c.proj, B.LOCAL, JSON.stringify(alheio, null, 2) + '\n');
  const versionado = B.le(c.proj, '.claude/settings.json');
  for (let i = 0; i < 2; i++) { const r = await B.aplica(c.proj, c.sys); assert.equal(r.code, 0, r.out); }
  assert.equal(B.le(c.proj, '.claude/settings.json'), versionado, 'o .claude/settings.json versionado mudou');
  const s = B.leJson(c.proj, B.LOCAL);
  assert.equal(entradas(s, CMD_CONTEXTO).length, 2, 'forge-contexto: ' + JSON.stringify(entradas(s, CMD_CONTEXTO)));
  assert.equal(entradas(s, CMD_RETOMA).length, 1, 'forge-retoma: ' + JSON.stringify(entradas(s, CMD_RETOMA)));
  assert.deepEqual(s.env, alheio.env);
  for (const [ev, gs] of Object.entries(alheio.hooks)) for (const g of gs) assert.ok((s.hooks?.[ev] ?? []).some((x) => JSON.stringify(x) === JSON.stringify(g)), 'perdeu o hook do utilizador em ' + ev);
});

test('o hook forge-vigia-de-agentes.mjs do F-13 fica byte a byte igual ao da merge-base com a origin/main', () => {
  const base = H.naBase('scripts/hooks/forge-vigia-de-agentes.mjs');
  assert.ok(base, 'o vigia não existe na merge-base');
  assert.equal(H.readFileSync(join(H.ROOT, 'scripts/hooks/forge-vigia-de-agentes.mjs'), 'utf8'), base);
});

test('âmbito (assert autorizado): a lista do scripts/scaffold.test.mjs ganha os 4 ficheiros novos, e só isso', H.SO_NO_RAMO, () => {
  const d = H.git('diff', '-U0', '--no-color', H.mergeBase(), '--', 'scripts/scaffold.test.mjs').stdout.replace(/\r/g, '');
  const mais = d.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1).trim()).sort();
  const menos = d.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---'));
  assert.deepEqual(menos, [], 'linhas apagadas no scaffold.test.mjs');
  assert.deepEqual(mais, H.PECAS.map((p) => `'${p}',`).sort());
});