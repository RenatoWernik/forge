// Ronda −1 do V-11 (#135): o inventário fechado dos usos de BASE com sha fixo e a transformação do F-29 (#121) byte a byte.
// Oráculos (todos de âmbito: comparam a árvore do ticket com o merge-base e com a classificação do dev; fora dos ramos v-11* fazem skip):
// - os .mjs de tests/critico que declaram BASE = '<sha>' são exatamente os 22 helpers.mjs do inventário (nenhum se apaga, nenhum se muda);
// - cada uso de BASE nessas pastas está num teste «ÂMBITO:» com soNoTicket(t, '<id da pasta>') ou numa entrada de referencia com motivo;
// - cada entrada de referencia aponta para um uso que existe (sem entradas soltas nem repetidas);
// - cada teste convertido pelo ticket fica byte a byte em relação ao merge-base, tirando o prefixo «ÂMBITO: », o (t) e a linha do soNoTicket.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { soNoTicket } from '../_comum/ambito.mjs';
import { ROOT, LISTA, INVENTARIO, LEGADO, DECL, AMBITO, idDaPasta, pastaDe, arvore, mjsDaPasta, ler, lerJson, usos, testes, semPrefixo, deAmbito,
  naRevisao, listaNaBase, base, limpa } from './helpers.mjs';

after(limpa);
const MOTIVO_MIN = 15;
const referencia = () => {
  const j = lerJson(LISTA);
  assert.ok(Array.isArray(j.referencia), `${LISTA} › referencia não é uma lista de {ficheiro, trecho, motivo} (a classificação dos usos de BASE)`);
  return j.referencia;
};
const valida = (e) => e && typeof e.ficheiro === 'string' && typeof e.trecho === 'string' && typeof e.motivo === 'string' && e.motivo.trim().length >= MOTIVO_MIN;

test('ÂMBITO: C1 inventário fechado: os .mjs de tests/critico que declaram BASE = <sha> são exatamente os 22 helpers.mjs da #135', (t) => {
  if (soNoTicket(t, 'v-11')) return;
  const achados = arvore().filter((f) => f.startsWith('tests/critico/') && !f.startsWith('tests/critico/v-11-r0/') && /\.(?:mjs|cjs|js)$/.test(f))
    .filter((f) => DECL.test(ler(f)));
  assert.deepEqual(achados.sort(), INVENTARIO.map((p) => `tests/critico/${p}/helpers.mjs`).sort());
});

test('ÂMBITO: C1 cada uso de BASE nas 22 pastas está classificado: num teste «ÂMBITO:» com soNoTicket(t, <id da pasta>) ou em referencia, com motivo', (t) => {
  if (soNoTicket(t, 'v-11')) return;
  const r = lerJson(LISTA).referencia, ref = Array.isArray(r) ? r : []; // sem a lista, a falha nomeia todos os usos
  const sem = [];
  let n = 0;
  for (const p of INVENTARIO) for (const f of mjsDaPasta(p)) for (const u of usos(ler(f))) {
    n++;
    if (u.teste && deAmbito(u.teste, idDaPasta(p))) continue;
    if (ref.some((e) => valida(e) && e.ficheiro === f && e.trecho === u.trecho)) continue;
    sem.push(`${f}:${u.linha}${u.teste ? ` (no teste «${u.teste.titulo.slice(0, 60)}»)` : ' (fora de um teste)'}: ${u.trecho.slice(0, 120)}`);
  }
  assert.ok(n >= 39, 'controlo: só ' + n + ' usos de BASE (eram 39 na base)');
  assert.deepEqual(sem, [], `${sem.length} uso(s) de BASE sem classificação:\n${sem.join('\n')}`);
});

test('ÂMBITO: C1 referencia: cada entrada tem ficheiro, trecho e motivo (≥ 15 caracteres), aponta para um uso de BASE que existe e não se repete', (t) => {
  if (soNoTicket(t, 'v-11')) return;
  const ref = referencia();
  const maus = [], vistos = new Set();
  for (const e of ref) {
    const k = JSON.stringify([e?.ficheiro, e?.trecho]);
    if (!valida(e)) { maus.push('entrada inválida: ' + JSON.stringify(e).slice(0, 200)); continue; }
    if (vistos.has(k)) maus.push('repetida: ' + k);
    vistos.add(k);
    const p = pastaDe(e.ficheiro);
    if (!INVENTARIO.includes(p) || !arvore().includes(e.ficheiro)) { maus.push('ficheiro fora do inventário ou inexistente: ' + e.ficheiro); continue; }
    if (!usos(ler(e.ficheiro)).some((u) => u.trecho === e.trecho)) maus.push(`sem uso de BASE com este trecho em ${e.ficheiro}: ${e.trecho.slice(0, 120)}`);
  }
  assert.deepEqual(maus, []);
});

// O F-29: o título ganha «ÂMBITO: », o callback recebe t, a primeira instrução é o soNoTicket; tudo o resto fica byte a byte
const normaliza = (texto) => texto.replace(/\r\n/g, '\n')
  .replace(/^((?:test|it|describe)\s*\(\s*['"`])\u00C2MBITO: /, '$1')
  .replace(/^[ \t]*if \(soNoTicket\(t, (['"])[^'"\n]+\1\)\) return;[^\n]*\n/m, '')
  .replace(/(,\s*(?:async\s+)?)\(\s*t?\s*\)(\s*=>)/, '$1()$2');
test('ÂMBITO: C1 cada teste convertido pelo ticket (pastas de legado e g-guardas do f-26) fica byte a byte, salvo o prefixo, o (t) e a linha do soNoTicket', (t) => {
  if (soNoTicket(t, 'v-11')) return;
  const mb = base();
  if (!mb) return t.skip('sem origin/main');
  const fs = [...LEGADO.flatMap((p) => listaNaBase(mb, `tests/critico/${p}`)), 'tests/critico/f-26-r0/g-guardas.test.mjs'].filter((f) => /\.(?:mjs|cjs|js)$/.test(f));
  const antes = naRevisao(mb, fs), mudados = [];
  let convertidos = 0;
  for (const f of fs) {
    if (!arvore().includes(f) || antes.get(f) === null) continue;
    const velhos = testes(antes.get(f));
    for (const te of testes(ler(f))) {
      const id = idDaPasta(pastaDe(f));
      if (!deAmbito(te, id)) continue;
      const v = velhos.filter((x) => semPrefixo(x.titulo) === semPrefixo(te.titulo));
      if (v.length && v.every((x) => x.ids.includes(id))) continue; // já era de âmbito no merge-base (o f-20a do F-29)
      convertidos++;
      if (!v.some((x) => normaliza(x.texto) === normaliza(te.texto))) mudados.push(`${f}:${te.linha}: «${te.titulo.slice(0, 90)}»${v.length ? '' : ' (sem teste com este título no merge-base)'}`);
    }
  }
  t.diagnostic(`testes convertidos pelo ticket: ${convertidos}`);
  assert.deepEqual(mudados, [], 'testes convertidos que mudaram além da transformação do F-29:\n' + mudados.join('\n'));
});
// RESPOSTA 6563406653: os títulos «âmbito:» antigos sem soNoTicket (os 11 do L2, com a opção skip do ramo exato ou de comportamento) ficam byte a byte
test('ÂMBITO: C1 os testes «âmbito:» antigos sem soNoTicket das pastas de legado ficam byte a byte (cada um entra em excecoes L2)', (t) => {
  if (soNoTicket(t, 'v-11')) return;
  const mb = base();
  if (!mb) return t.skip('sem origin/main');
  const fs = LEGADO.flatMap((p) => listaNaBase(mb, `tests/critico/${p}`)).filter((f) => /\.(?:mjs|cjs|js)$/.test(f));
  const antes = naRevisao(mb, fs), mudados = [];
  let n = 0;
  for (const f of fs) {
    const velhos = testes(antes.get(f) ?? '').filter((x) => AMBITO.test(x.titulo) && !x.ids.length);
    if (!velhos.length) continue;
    const agora = arvore().includes(f) ? testes(ler(f)).map((x) => x.texto.replace(/\r\n/g, '\n')) : [];
    for (const v of velhos) { n++; if (!agora.includes(v.texto.replace(/\r\n/g, '\n'))) mudados.push(`${f}:${v.linha}: «${v.titulo.slice(0, 90)}»`); }
  }
  assert.equal(n, 11, 'controlo: eram 11 os «âmbito:» antigos sem soNoTicket nas pastas de legado');
  assert.deepEqual(mudados, [], 'mudaram:\n' + mudados.join('\n'));
});