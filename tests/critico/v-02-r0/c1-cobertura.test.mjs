// V-02 (#126) C1 (M1) e o «Reprova» do mapa: todo o ficheiro de `git ls-files` dá uma lista de afetadas não vazia, só com suítes do manifesto.
// AJUSTADO (MECANISMO FINAL do orquestrador, #126, «autorizado pelo orquestrador (#126, este comentário)»): as regras de glob saíram do JSON e
// passaram para o código (um ficheiro fora de tests/critico dá TODAS as suítes), por isso o mapa já não tem `regras`, nem "*" com `motivo`,
// nem um ficheiro «sem regra» que o lint recuse: o ficheiro novo, em vez de falhar o lint, dá todas as suítes.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { lerMapa, nomesManifesto, rastreados, nomes, afetadasAqui, afetadasEm, copiaRepo, commitaTudo, escreve, lintEm, resumo, limpa } from './helpers.mjs';

after(limpa);

test('C1 [reprova]: o mapa é v1, não tem regras de glob e o `sempre` é uma lista não vazia de suítes do manifesto (M2)', () => {
  const mapa = lerMapa();
  assert.equal(mapa.versao, 1);
  assert.equal('regras' in mapa, false, 'o mapa não pode ter regras de glob editáveis: a seleção não se reduz por dados');
  const todas = new Set(nomesManifesto());
  const sempre = Object.keys(mapa.sempre ?? {});
  assert.ok(sempre.length > 0, 'sempre vazio');
  assert.deepEqual(sempre.filter((s) => !todas.has(s)), [], 'sempre: suítes que não estão no manifesto');
});

test('C1 [reprova]: o mapa não tem nenhuma lista vazia nem "*" escondido: só as chaves versao, sempre e foraDaLista', () => {
  assert.deepEqual(Object.keys(lerMapa()).filter((k) => !['versao', 'sempre', 'foraDaLista'].includes(k)), []);
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

test('C1 (M1): numa cópia temporária o lint passa; um ficheiro rastreado novo, fora de tests/critico, dá TODAS as suítes', () => {
  const d = copiaRepo();
  const antes = lintEm(d);
  assert.ok(antes.status === 0 && antes.fail === 0 && antes.pass > 0, 'o lint não passa na cópia sem mudanças:\n' + resumo(antes));
  const novo = 'zz-v02-sem-regra/novo.txt';
  escreve(d, novo, 'sem regra\n');
  commitaTudo(d, 'ficheiro novo');
  const todas = nomesManifesto(d);
  assert.deepEqual([...nomes(afetadasEm(d, [novo]), todas)].sort(), [...todas].sort(), `${novo} tem de dar todas as suítes`);
});
