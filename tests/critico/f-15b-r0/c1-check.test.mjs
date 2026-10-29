// F-15b critério 1: o --check só lê, funciona sem rede e diz o que está desatualizado.
// Oráculo: as 6 máquinas-fixture do contrato com o sys espião (zero execuções além das sondas de versão do registo, zero escritas,
// manifesto sha256 da máquina igual antes e depois), o fetch global substituído por uma função que lança e conta, os estados
// exatos por componente (incluindo o alvo forge) e o código de saída (0 só com tudo ok).
// Depende do F-15a: o compat.json (verifiedWith e notas) em todos; AI_MEMORY_BIN e mattpocock-skills@mattpocock na máquina 4.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  maquina, instala, estado, upd, latest, compatSint, notaComo, manifesto, diffManifesto, rede, SYN, ALVOS, IDS, VERIFIED, REFERENCIA,
  TUDO_VERIFICADO, TUDO_REFERENCIA, NAO_TESTADA, personalizada, FIXTURE, URL_PONYTAIL, FORGE_ULTIMA,
} from './helpers.mjs';

const soLe = (m, r, antes) => {
  assert.deepEqual(r.execs.map((c) => c.str), [], 'o --check executou algo além das sondas de versão');
  assert.deepEqual(r.events.filter((e) => e.t === 'write' || e.t === 'copy'), [], 'o --check escreveu ou copiou');
  assert.deepEqual(diffManifesto(antes, manifesto(m.root)), [], 'o --check mudou ficheiros da máquina');
};
const estados = (by, ids = ALVOS) => Object.fromEntries(ids.map((id) => [id, by[id]?.status]));

test('C1 máquina 1 (vazia): tudo missing, incluindo o alvo forge; código 1; só lê', async () => {
  const m = maquina();
  const antes = manifesto(m.root);
  const r = await estado(m);
  assert.deepEqual(estados(r.by), Object.fromEntries(ALVOS.map((id) => [id, 'missing'])));
  assert.equal(r.code, 1);
  soLe(m, r, antes);
});

test('C1 máquina 2 (tudo no verifiedWith, forge na mais recente): tudo ok; código 0; só lê', async () => {
  const m = instala(maquina(), TUDO_VERIFICADO);
  const antes = manifesto(m.root);
  const r = await estado(m);
  assert.deepEqual(estados(r.by), Object.fromEntries(ALVOS.map((id) => [id, 'ok'])));
  for (const id of IDS) assert.equal(String(r.by[id].verifiedWith ?? '').replace(/^v/, '').slice(0, VERIFIED[id].length), VERIFIED[id], id + ': o --check não mostra o verifiedWith');
  assert.equal(r.code, 0, 'tudo ok tem de dar o código 0');
  soLe(m, r, antes);
});

test('C1 máquina 3 (tudo na referência de 2026-09-30): outdated onde a mais recente ≤ verifiedWith, sem unverified nem customized falsos; código 1', async () => {
  const m = instala(maquina(), TUDO_REFERENCIA);
  const antes = manifesto(m.root);
  const r = await estado(m);
  assert.deepEqual(estados(r.by), {
    uv: 'outdated', 'gauntlet-loop': 'ok', 'ai-memory': 'outdated', 'ai-memory-mcp': 'outdated', ponytail: 'outdated', 'spec-kit': 'outdated',
    sdd: 'ok', 'mattpocock-skills': 'outdated', graphify: 'outdated', 'graphify-skill': 'outdated', forge: 'outdated',
  });
  assert.equal(r.by.uv.installedVersion, REFERENCIA.uv);
  assert.equal(r.by.uv.latestVersion, '0.13.6');
  assert.equal(r.code, 1);
  soLe(m, r, antes);
});

test('C1 máquina 4 [F-15a: AI_MEMORY_BIN e mattpocock-skills@*] («máquina do utilizador» anonimizada): os estados exatos, gauntlet-loop customized e nada unverified', async () => {
  const m = maquina();
  const bin = join(m.root, 'tools dir', 'ai-memory', 'v2.3.2', 'ai-memory.exe');
  instala(m, { 'ai-memory': '2.3.2', aiMemoryBin: bin, 'gauntlet-loop': personalizada(), mattpocock: ['mattpocock-skills@mattpocock', '1.2.3'], ponytail: '5.3.2', graphify: '0.9.50' });
  const antes = manifesto(m.root);
  const r = await estado(m);
  assert.deepEqual(estados(r.by), {
    uv: 'missing', 'gauntlet-loop': 'customized', 'ai-memory': 'outdated', 'ai-memory-mcp': 'missing', ponytail: 'outdated', 'spec-kit': 'missing',
    sdd: 'missing', 'mattpocock-skills': 'outdated', graphify: 'outdated', 'graphify-skill': 'missing', forge: 'missing',
  });
  assert.equal(r.by['ai-memory'].installedVersion, '2.3.2', 'a versão do ai-memory não veio do AI_MEMORY_BIN');
  assert.equal(r.code, 1);
  soLe(m, r, antes);
});

test('C1 máquina 5 (a mais recente acima do verifiedWith): unverified, «não testada com o forge» e só as notas entre a instalada e a mais recente', async () => {
  const base = compatSint();
  const pony = base.components.ponytail;
  pony.notes = { ...(pony.notes ?? {}), '5.0.0': notaComo(base, 'NOTA-ABAIXO-critico'), '5.3.4': notaComo(base, 'NOTA-DENTRO-critico'), '5.6.0': notaComo(base, 'NOTA-ACIMA-critico') };
  const m = instala(maquina({ compat: base, fontes: latest({ ponytail: '5.4.0', uv: '0.14.0', graphify: '0.9.99' }) }), TUDO_VERIFICADO);
  const antes = manifesto(m.root);
  const r = await estado(m);
  for (const id of ['ponytail', 'uv', 'graphify', 'graphify-skill']) assert.equal(r.by[id].status, 'unverified', id);
  for (const id of ['ai-memory', 'spec-kit', 'sdd', 'mattpocock-skills', 'gauntlet-loop']) assert.equal(r.by[id].status, 'ok', id + ': unverified falso');
  assert.equal(r.code, 1);
  soLe(m, r, antes);
  const txt = await upd(m, ['--check']);
  assert.match(txt.out, NAO_TESTADA, 'o texto não diz «não testada com o forge»');
  assert.match(txt.out, /NOTA-DENTRO-critico/, 'não mostra a nota de uma versão entre a instalada e a mais recente');
  assert.doesNotMatch(txt.out, /NOTA-ABAIXO-critico|NOTA-ACIMA-critico/, 'mostra notas fora do intervalo instalada → mais recente');
  assert.match(txt.out, /5\.3\.3[^\n]*(→|->)[^\n]*5\.4\.0/, 'não mostra «instalado → mais recente» (5.3.3 → 5.4.0)');
  assert.deepEqual(txt.execs, []);
});

test('C1 máquina 6 (um URL ausente da fonte de versões): a componente fica unknown, as outras não; código 1', async () => {
  const m = instala(maquina({ fontes: latest({ sem: [URL_PONYTAIL] }) }), TUDO_VERIFICADO);
  const antes = manifesto(m.root);
  const r = await estado(m);
  assert.equal(r.by.ponytail.status, 'unknown');
  for (const id of ALVOS.filter((x) => x !== 'ponytail')) assert.equal(r.by[id].status, 'ok', id);
  assert.equal(r.code, 1);
  soLe(m, r, antes);
});

test('C1: sem flags, o update é o --check (só lê, não executa, não escreve)', async () => {
  const m = instala(maquina(), TUDO_REFERENCIA);
  const antes = manifesto(m.root);
  const r = await upd(m, []);
  assert.equal(r.code, 1);
  soLe(m, r, antes);
});

test('C1: com --versions <fixture>, nem o fetch global nem o sys.fetchText são chamados, e nenhuma fonte do registo fica unknown', async () => {
  const m = instala(maquina(), TUDO_VERIFICADO);
  const antes = manifesto(m.root);
  const r0 = rede.length;
  const r = await estado(m, ['--versions', FIXTURE]);
  assert.equal(rede.length, r0, 'fetch global chamado com --versions');
  assert.deepEqual(m.fetches, [], 'com --versions, a fonte das versões tem de ser só a fixture (o sys.fetchText foi chamado)');
  for (const id of ['uv', 'ai-memory', 'ponytail', 'spec-kit', 'sdd', 'mattpocock-skills', 'graphify', 'graphify-skill', 'forge']) {
    assert.notEqual(r.by[id].status, 'unknown', id + ': a fixture não responde à fonte desta componente');
    assert.ok(r.by[id].latestVersion, id + ': sem mais recente');
  }
  soLe(m, r, antes);
});

test('C1: o --check só lê mesmo com --yes, --overwrite e as outras flags do --apply (sem --apply nada corre)', async () => {
  const m = instala(maquina(), { ...TUDO_REFERENCIA, 'gauntlet-loop': personalizada() });
  const antes = manifesto(m.root);
  const r = await upd(m, ['--check', '--yes', '--overwrite', '--accept-unverified', '--backup-confirmed']);
  soLe(m, r, antes);
});

test('C1: a mais recente igual ao verifiedWith é outdated, nunca unverified; acima por um patch é unverified (fronteira)', async () => {
  const m1 = instala(maquina({ fontes: latest({ ponytail: '5.3.3' }) }), { ...TUDO_VERIFICADO, ponytail: '5.3.2' });
  assert.equal((await estado(m1)).by.ponytail.status, 'outdated');
  const m2 = instala(maquina({ fontes: latest({ ponytail: '5.3.4' }) }), { ...TUDO_VERIFICADO, ponytail: '5.3.2' });
  assert.equal((await estado(m2)).by.ponytail.status, 'unverified');
  const m3 = instala(maquina({ fontes: latest({ ponytail: '5.3.4' }) }), { ...TUDO_VERIFICADO, ponytail: '5.3.4' });
  assert.equal((await estado(m3)).by.ponytail.status, 'ok', 'instalada = mais recente (acima do verifiedWith) já está atualizada: ok');
});

test('C1: o forge aparece no --check com a versão instalada e a mais recente', async () => {
  const m = instala(maquina(), { forge: '0.1.0' });
  const r = await estado(m);
  assert.equal(r.by.forge?.status, 'outdated');
  assert.equal(r.by.forge.installedVersion, '0.1.0');
  assert.equal(String(r.by.forge.latestVersion).replace(/^v/, ''), FORGE_ULTIMA);
});

test('C1: SYN é o conteúdo do pristine sintético (sanidade do próprio ataque)', () => {
  assert.equal(SYN['gauntlet-loop'].split('\n').length, 133);
  assert.equal(personalizada().split('\n').length, 189);
});
