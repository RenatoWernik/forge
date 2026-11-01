// V-02 (#126) C1 (M1) e o «Reprova» do mapa: todo o ficheiro de `git ls-files` está no mapa; numa cópia temporária, um ficheiro rastreado
// novo sem regra faz o lint scripts/mapa-suites.test.mjs FALHAR com o caminho. Também: nenhuma regra com uma lista vazia, nomes só do
// manifesto (M2) e nenhuma regra "*" que cubra ficheiros de uma suíte (os que os `ficheiros` dela casam, ou tests/critico/<suíte>/) sem `motivo`.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { ROOT, REL_MANIFESTO, lerJson, lerMapa, nomesManifesto, rastreados, regrasDe, casa, suiteDaPasta, nomes, afetadasAqui,
  copiaRepo, commitaTudo, escreve, lintEm, resumo, limpa } from './helpers.mjs';
import { join } from 'node:path';

after(limpa);

test('C1 [reprova]: o mapa é v1, cada regra tem `caminhos` e `suites` não vazios, e cada suíte é do manifesto ou "*" (M2)', () => {
  const mapa = lerMapa();
  assert.equal(mapa.versao, 1);
  assert.ok(Array.isArray(mapa.regras) && mapa.regras.length > 0, 'sem regras');
  const todas = new Set(nomesManifesto());
  mapa.regras.forEach((r, i) => {
    assert.ok(Array.isArray(r.caminhos) && r.caminhos.length > 0 && r.caminhos.every((c) => typeof c === 'string' && c), `regra ${i}: caminhos vazios`);
    assert.ok(Array.isArray(r.suites) && r.suites.length > 0, `regra ${i}: lista de suítes vazia`);
    const fora = r.suites.filter((s) => s !== '*' && !todas.has(s));
    assert.deepEqual(fora, [], `regra ${i}: suítes que não estão no manifesto`);
  });
});

test('C1 [reprova]: uma regra "*" que cobre ficheiros de uma suíte (os `ficheiros` do manifesto ou tests/critico/<suíte>/) tem `motivo` escrito', () => {
  const mapa = lerMapa(), man = lerJson(join(ROOT, REL_MANIFESTO)), todas = new Set(man.suites.map((s) => s.nome));
  const daSuite = (f) => todas.has(suiteDaPasta(f)) || man.suites.some((s) => (s.ficheiros || []).some((g) => casa(f, g)));
  const fs_ = rastreados().filter(daSuite);
  assert.ok(fs_.length > 300, `controlo: só ${fs_.length} ficheiros de suítes`);
  const sem = mapa.regras.map((r, i) => ({ r, i })).filter(({ r }) => r.suites.includes('*') && !(typeof r.motivo === 'string' && r.motivo.trim()))
    .map(({ r, i }) => ({ regra: i, caminhos: r.caminhos, cobre: fs_.filter((f) => r.caminhos.some((g) => casa(f, g))).slice(0, 5) }))
    .filter((x) => x.cobre.length);
  assert.deepEqual(sem, []);
});

test('C1 (M1): cada ficheiro de git ls-files dá uma lista de afetadas não vazia, só com suítes do manifesto', async () => {
  const todas = nomesManifesto(), fs_ = rastreados();
  assert.ok(fs_.length > 600, `controlo: só ${fs_.length} ficheiros`);
  const vazios = [], estranhos = [];
  for (const f of fs_) {
    const s = nomes(await afetadasAqui([f]), todas);
    if (!s.size) vazios.push(f);
    for (const x of s) if (!todas.includes(x)) estranhos.push(`${f} → ${x}`);
  }
  assert.deepEqual({ vazios, estranhos }, { vazios: [], estranhos: [] });
});

test('C1 (M1): numa cópia temporária o lint passa; com um ficheiro rastreado novo sem regra, FALHA e diz o caminho', () => {
  const d = copiaRepo();
  const antes = lintEm(d);
  assert.ok(antes.status === 0 && antes.fail === 0 && antes.pass > 0, 'o lint não passa na cópia sem mudanças:\n' + resumo(antes));
  const novo = 'zz-v02-sem-regra/novo.txt';
  const quem = regrasDe(lerMapa(d), novo);
  assert.deepEqual(quem.map((r) => r.caminhos), [], `${novo} casa com uma regra: um mapa que cobre tudo torna o M1 vazio`);
  escreve(d, novo, 'sem regra\n');
  commitaTudo(d, 'ficheiro sem regra');
  const depois = lintEm(d);
  assert.notEqual(depois.status, 0, 'o lint passou com um ficheiro rastreado sem regra:\n' + resumo(depois));
  assert.ok(depois.fail > 0, resumo(depois));
  assert.ok(depois.out.includes(novo), `a falha não diz o caminho ${novo}:\n` + resumo(depois));
});