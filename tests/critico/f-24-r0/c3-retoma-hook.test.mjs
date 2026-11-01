// Ronda −1 do F-24 (#80), C3: o regresso depois da compactação, `.claude/hooks/forge-retoma.mjs` no SessionStart `compact`.
// Oráculo: a fixture do C5 com FORGE_VIGIA_NOW_MS; a 1.ª linha é literal e o resto é igual à saída de `node .claude/retoma.mjs` no mesmo projeto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import * as H from './helpers.mjs';

const entrada = (proj) => ({ session_id: 'sessao-c3', transcript_path: join(proj, 'transcript.jsonl'), cwd: proj, permission_mode: 'default', hook_event_name: 'SessionStart', source: 'compact' });
const correHook = (proj) => H.hook(proj, H.RETOMA_HOOK, entrada(proj), H.relogio());
const saiBem = (r) => { assert.equal(r.status, 0, H.mostra(r)); assert.ok(r.ms <= 2000, `o hook demorou ${r.ms} ms (limite 2 s)`); };

test('C3: a 1.ª linha é a literal do contrato e o resto é a saída do retoma.mjs (fixture do C5)', async () => {
  const proj = await H.gerar();
  H.painel(proj, H.FIXTURE_C5());
  const r = correHook(proj);
  saiBem(r);
  const l = H.linhas(r.stdout);
  assert.equal(l[0], H.LINHA_C3, H.mostra(r));
  const ref = H.retoma(proj);
  assert.equal(ref.status, 0, H.mostra(ref));
  assert.deepEqual(l.slice(1), H.linhas(ref.stdout));
  assert.deepEqual(l.slice(1), H.golden('c5.txt'));
});

test('C3: sem nada a acordar, a 1.ª linha literal seguida da saída do retoma.mjs («nothing to resume»)', async () => {
  const proj = await H.gerar();
  const r = correHook(proj);
  saiBem(r);
  assert.deepEqual(H.linhas(r.stdout), [H.LINHA_C3, H.C5_ORQ_FALTA, 'nothing to resume']);
});

for (const [caso, texto] of [['partido', '{"versao":1,"tickets":[{'], ['vazio', ''], ['binário', '\u0000\u0001\u00ff']]) {
  test(`C3: um painel.json ${caso} não impede a 1.ª linha, e o hook sai com 0`, async () => {
    const proj = await H.gerar();
    H.writeFileSync(join(H.CP(proj), 'painel.json'), texto);
    const r = correHook(proj);
    saiBem(r);
    assert.equal(H.linhas(r.stdout)[0], H.LINHA_C3, H.mostra(r));
  });
}

test('C3: stdin vazio ou que não é JSON: o hook sai com 0 em ≤ 2 s (sai sempre com 0)', async () => {
  const proj = await H.gerar();
  for (const input of ['', 'não é JSON']) {
    const r = H.corre(proj, join(proj, H.RETOMA_HOOK), { input, env: { CLAUDE_PROJECT_DIR: proj, ...H.relogio() } });
    saiBem(r);
  }
});