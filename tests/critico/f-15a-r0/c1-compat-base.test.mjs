// F-15a critério 1 (base verificada): o compat.json tem exatamente as 10 entradas do registo, cada uma com o verifiedWith do
// contrato, o campo `source` com o URL de origem na tag ou no sha verificados (P7), e o aviso do ai-memory 3.0.0.
// Não depende do F-05.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { COMPAT, IDS, VERIFIED, entries, readJson, registry, stripV, surfaceNames, strayUrls, strings, personalHits, GAUNTLET_FORK } from './helpers.mjs';

const compat = () => {
  assert.ok(existsSync(COMPAT), 'falta compat.json na raiz do pacote');
  return readJson(COMPAT);
};

test('C1: o compat.json tem exatamente as 10 entradas, uma por componente do registo (nem a mais nem a menos)', () => {
  const ids = Object.keys(entries(compat())).sort();
  assert.deepEqual(ids, [...IDS].sort());
  assert.deepEqual([...registry().components.map((c) => c.id)].sort(), [...IDS].sort(), 'o registo deixou de ter os 10 ids');
});

test('C1 (P1): uma só forma — components é um objeto indexado pelo id; cada entrada tem verifiedWith (texto) e surface.skills e surface.commands (arrays de strings)', () => {
  const c = compat();
  assert.ok(c.components && typeof c.components === 'object' && !Array.isArray(c.components), 'components tem de ser um objeto { <id>: {...} }');
  const maus = [];
  for (const [id, e] of Object.entries(c.components)) {
    if (typeof e?.verifiedWith !== 'string' || !e.verifiedWith) maus.push(id + ': verifiedWith');
    if (!e?.surface || typeof e.surface !== 'object' || Array.isArray(e.surface)) { maus.push(id + ': surface'); continue; }
    for (const k of ['skills', 'commands']) if (!Array.isArray(e.surface[k]) || !e.surface[k].every((s) => typeof s === 'string')) maus.push(`${id}: surface.${k} não é um array de strings`);
  }
  assert.deepEqual(maus, []);
  assert.deepEqual(Object.keys(c).filter((k) => k !== 'components' && !k.startsWith('$')), [], 'chaves de topo fora da forma fixada');
});

test('C1: o verifiedWith de cada entrada é o do contrato (uv 0.13.6, gauntlet-loop fc6b2fc do fork, ai-memory 3.2.10, ponytail 5.3.3, specify-cli 1.2.5, sdd 2.1.0, mattpocock 1.3.2, graphifyy 0.9.97)', () => {
  const e = entries(compat());
  const errados = [];
  for (const id of IDS) {
    const v = e[id]?.verifiedWith;
    const ok = id === 'gauntlet-loop' ? typeof v === 'string' && /^fc6b2fc[0-9a-f]{0,33}$/.test(v) : stripV(v) === VERIFIED[id];
    if (!ok) errados.push(`${id}: ${JSON.stringify(v)} (esperado ${VERIFIED[id]})`);
  }
  assert.deepEqual(errados, []);
});

// P7: o URL de origem é o campo próprio `source` de cada entrada, um só URL do repositório da componente, na tag ou no sha do
// verifiedWith (nunca main, master ou HEAD). O sdd não tem tags: o sha verificado é eba9606.
const ref = (id) => (id === 'gauntlet-loop' ? 'fc6b2fc' : id === 'sdd' ? 'eba9606' : null);
test('C1 (P7): cada uma das 10 entradas tem `source`, um só URL https no repositório da componente e na tag ou no sha verificados', () => {
  const e = entries(compat());
  const src = Object.fromEntries(registry().components.map((c) => [c.id, c.source.replace(/^https:\/\/github\.com\//, '').toLowerCase()]));
  src['gauntlet-loop'] = GAUNTLET_FORK.toLowerCase(); // emenda: sempre o fork, qualquer que seja o registo
  const falhas = [];
  for (const id of IDS) {
    const u = e[id]?.source;
    if (typeof u !== 'string') { falhas.push(`${id}: falta o campo source (um só URL, texto)`); continue; }
    const tag = ref(id);
    {
      const low = u.toLowerCase();
      const repoOk = low.includes(src[id]) || (id === 'spec-kit' && low.includes('github/spec-kit'));
      const refOk = tag ? new RegExp(`[/=@]${tag}[0-9a-f]*([/?#]|$)`).test(u) : new RegExp(`[/=@]v?${VERIFIED[id].replace(/\./g, '\\.')}([/?#]|$)`).test(u);
      if (!/^https:\/\//.test(u)) falhas.push(`${id}: URL sem https: ${u}`);
      if (!repoOk) falhas.push(`${id}: URL fora do repositório ${src[id]}: ${u}`);
      if (!refOk) falhas.push(`${id}: URL fora da tag/sha verificados: ${u}`);
      if (/[/=@](main|master|HEAD)([/?#]|$)/.test(u)) falhas.push(`${id}: URL num ramo móvel: ${u}`);
    }
  }
  assert.deepEqual(falhas, []);
});

test('C1 (P7): o URL de origem só está em `source` — nenhum URL na surface nem noutro campo da entrada', () => {
  const e = entries(compat());
  const fora = IDS.flatMap((id) => strayUrls(e[id]).map((u) => `${id}: ${u}`));
  assert.deepEqual(fora, []);
});

test('C1: as componentes que os templates usam têm surface com nomes (mattpocock-skills, spec-kit, ponytail, graphify, ai-memory)', () => {
  const e = entries(compat());
  for (const id of ['mattpocock-skills', 'spec-kit', 'ponytail', 'graphify', 'ai-memory']) assert.ok(surfaceNames(e[id]).length > 0, id + ' sem nomes na surface');
});

test('C1: notes do ai-memory tem o aviso da 3.0.0: migração da base de dados, backup obrigatório e docs/upgrading-to-3.0.md', () => {
  const notes = entries(compat())['ai-memory']?.notes;
  assert.ok(notes && typeof notes === 'object' && !Array.isArray(notes), 'notes do ai-memory tem de ser um mapa versão → aviso');
  const key = Object.keys(notes).find((k) => stripV(k) === '3.0.0');
  assert.ok(key, 'falta a chave 3.0.0 em notes do ai-memory: ' + Object.keys(notes).join(', '));
  const txt = strings(notes[key]).join(' ');
  assert.match(txt, /migra/i, 'o aviso não fala da migração da base de dados');
  assert.match(txt, /backup/i, 'o aviso não fala do backup');
  assert.match(txt, /docs\/upgrading-to-3\.0\.md/, 'o aviso não cita docs/upgrading-to-3.0.md');
});

test('C1: notes é sempre um mapa cujas chaves são versões (x.y.z), em todas as entradas que o têm', () => {
  for (const [id, e] of Object.entries(entries(compat()))) {
    if (e.notes === undefined) continue;
    assert.ok(e.notes && typeof e.notes === 'object' && !Array.isArray(e.notes), id + ': notes não é um mapa');
    for (const k of Object.keys(e.notes)) assert.match(stripV(k), /^\d+\.\d+\.\d+$/, `${id}: chave de notes que não é versão: ${k}`);
  }
});

test('reprova sempre: o compat.json não tem caminhos da máquina, dados pessoais nem tokens', () => {
  assert.deepEqual(personalHits(readFileSync(COMPAT, 'utf8')), []);
});

test('D1: sem pins — o components.json continua sem "version" e nenhum comando (install, update nem o update de um detector) fixa versão', () => {
  const real = registry().components;
  assert.ok(!/"version"\s*:/.test(JSON.stringify(real)), 'o components.json ganhou um "version"');
  assert.ok(!/(@v?[0-9]+[.][0-9]+|==[0-9]|--tag|\/download\/v[0-9])/.test(JSON.stringify(real.map((c) => [c.install, c.update, c.installed.map((i) => i.update)]))), 'um comando do registo fixa uma versão');
});
