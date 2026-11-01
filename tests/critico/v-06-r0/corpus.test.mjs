// V-06 (#130) C1–C4 sobre o corpus de cenarios/*.json: cada cenário corre o scripts/avancar.mjs contra o gh falso (gh-falso.mjs) e uma
// origem local, e verifica o código e as chamadas esperadas (C1); depois, as propriedades sobre o corpus inteiro: nenhum merge nas
// recusas (C2), a fase seguinte exata (C3, no cenário tudo-ok) e o token falso em lado nenhum (C4). Ver a LEITURA DO CONTRATO no helpers.mjs.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  corpus, montaCenario, correAvancar, exigeAvancar, saida, prMerges, merges, comentariosEm, issuesCriadas, indice, flagsDoMerge, validaFase,
  mencionaNumero, procuraToken, ambiente, limpa, PR, SPEC, PACOTE, NOME_REGRESSAO, TOKEN,
} from './helpers.mjs';

after(limpa);

const CORPUS = corpus();
const CORRIDAS = new Map();
const TITULOS = new Map(PACOTE.map((i) => [i.number, i.title]));
const pai = (gitDir, sha) => spawnSync('git', ['--git-dir', gitDir, 'rev-parse', `${sha}^`], { encoding: 'utf8', env: ambiente() }).stdout.trim();

for (const c of CORPUS) {
  test(`C1: ${c.nome}: ${c.descricao}`, { timeout: 300000 }, async () => {
    exigeAvancar();
    const m = montaCenario(c);
    const r = await correAvancar(m);
    CORRIDAS.set(c.nome, { m, r });
    const e = c.esperado, diz = saida(r);
    assert.equal(r.pendurado, false, `o avancar não acabou\n${diz}`);
    assert.equal(r.status, e.codigo, `códigos: 0 ok, 1 pós-merge vermelho, 2 recusa\n${diz}`);

    // as chamadas `pr merge`: quantas, e cada uma com --squash e --match-head-commit <o head que o gh mostra>
    const pm = prMerges(r);
    if (e.pr_merge !== undefined) assert.equal(pm.length, e.pr_merge, `chamadas pr merge\n${diz}`);
    if (e.pr_merge_max !== undefined) assert.ok(pm.length <= e.pr_merge_max, `chamadas pr merge: ${pm.length} > ${e.pr_merge_max}\n${diz}`);
    for (const ch of pm) {
      const f = flagsDoMerge(ch.argv);
      assert.ok(f.squash, `pr merge sem --squash: gh ${ch.argv.join(' ')}`);
      assert.equal(f.match, m.H, `pr merge sem --match-head-commit ${m.H}: gh ${ch.argv.join(' ')}`);
    }
    // os merges feitos e as refs da origem: sem merge nada muda; com merge só a base avança um commit (nem revert nem push forçado)
    const feitos = merges(r);
    assert.equal(feitos.length, e.merges, `merges feitos\n${diz}`);
    const base = c.pr.base;
    if (e.merges === 0) assert.deepEqual(r.refsDepois, m.refsAntes, 'a origem mudou sem merge');
    else {
      const ref = `refs/heads/${base}`;
      assert.deepEqual({ ...r.refsDepois, [ref]: m.refsAntes[ref] }, m.refsAntes, 'mudou outra ref da origem além da base do PR');
      assert.equal(r.refsDepois[ref], feitos[0].sha, `a ${base} da origem não ficou no commit squash (revert ou push depois do merge?)`);
      assert.equal(pai(m.origem, feitos[0].sha), m.refsAntes[ref], 'o squash não assenta na base anterior');
      if (base !== 'main') assert.equal(r.refsDepois['refs/heads/main'], m.refsAntes['refs/heads/main'], 'modo projeto: a main mudou');
    }
    if (e.pr_ready) {
      const ready = indice(r, (ch) => ch.argv[0] === 'pr' && ch.argv[1] === 'ready'), merge = indice(r, (ch) => ch.argv[0] === 'pr' && ch.argv[1] === 'merge');
      assert.ok(ready >= 0 && ready < merge, `o PR em rascunho precisa de pr ready antes do pr merge\n${diz}`);
    }
    // a issue regressao (P2 = a: abre-a, não avança, nunca reverte)
    if (e.regressao !== undefined) {
      const reg = issuesCriadas(r).filter((i) => i.labels.includes('regressao'));
      assert.equal(reg.length, e.regressao, `issues com a label regressao\n${diz}`);
      for (const i of reg) {
        assert.ok(mencionaNumero(i.corpo, PR) || i.corpo.includes(`/pull/${PR}`), `a issue regressao não cita o PR de origem #${PR}:\n${i.corpo}`);
        assert.ok(i.corpo.includes(NOME_REGRESSAO) || /not ok/.test(i.corpo) || /\bfail\b\D{0,4}[1-9]/i.test(i.corpo),
          `a issue regressao não traz o resumo do TAP (o teste que falhou, «not ok» ou a contagem de falhas):\n${i.corpo}`);
      }
    }
    // PÓS-MERGE VERDE <sha do squash>, comentário do PR
    if (e.pos_merge_verde !== undefined) {
      const ditos = comentariosEm(r, PR);
      if (e.pos_merge_verde) assert.ok(ditos.some((k) => k.corpo.includes(`PÓS-MERGE VERDE ${feitos[0]?.sha}`)), `falta o comentário PÓS-MERGE VERDE ${feitos[0]?.sha}\n${diz}`);
      else assert.ok(!ditos.some((k) => k.corpo.includes('PÓS-MERGE VERDE')), `comentou PÓS-MERGE VERDE sem pós-merge verde\n${diz}`);
    }
    // a fase seguinte (C3): exatamente as 2 livres no .forge/proxima-fase.json, impressas e comentadas na spec; sem avanço, nada disso
    if (e.fase === null) {
      assert.equal(r.proxima, null, `gravou .forge/proxima-fase.json sem avançar:\n${r.proxima}`);
      assert.deepEqual(comentariosEm(r, SPEC).map((k) => k.corpo), [], 'comentou a fase seguinte na spec sem avançar');
    } else if (e.fase !== undefined) {
      assert.notEqual(r.proxima, null, `falta .forge/proxima-fase.json\n${diz}`);
      const fase = JSON.parse(r.proxima);
      assert.deepEqual(validaFase(fase, TITULOS), [], `esquema { spec, geradoEm, proximas: [{ numero, titulo }] }:\n${r.proxima}`);
      assert.deepEqual(fase.proximas.map((x) => x.numero).toSorted(), e.fase, `a fase seguinte tem de listar exatamente ${e.fase.join(', ')}:\n${r.proxima}`);
      for (const n of e.fase) assert.ok(mencionaNumero(r.out, n), `o avancar não imprimiu a fase seguinte (falta ${n})\n${diz}`);
      const naSpec = comentariosEm(r, SPEC);
      assert.ok(naSpec.some((k) => e.fase.every((n) => mencionaNumero(k.corpo, n))), `falta o comentário da fase seguinte na spec #${SPEC}\n${diz}`);
    }
  });
}

test('C2: em todas as recusas do corpus, nenhum merge: 0 chamadas pr merge (no head-mudou, ≤ 1, recusada pelo gh) e a origem intacta', () => {
  const recusas = CORPUS.filter((c) => c.esperado.recusa);
  assert.ok(recusas.length >= 7, `o corpus só tem ${recusas.length} recusas`);
  const falhas = [];
  for (const c of recusas) {
    const x = CORRIDAS.get(c.nome);
    if (!x) { falhas.push(`${c.nome}: não correu`); continue; }
    const pm = prMerges(x.r).length, max = c.esperado.pr_merge_max ?? 0;
    if (pm > max) falhas.push(`${c.nome}: ${pm} chamadas pr merge`);
    if (merges(x.r).length) falhas.push(`${c.nome}: ${merges(x.r).length} merges feitos`);
    if (JSON.stringify(x.r.refsDepois) !== JSON.stringify(x.m.refsAntes)) falhas.push(`${c.nome}: a origem mudou`);
  }
  assert.deepEqual(falhas, []);
});

test('C4: o valor falso do token nunca aparece no argv (gh, git, node), nos logs nem nos ficheiros de nenhum cenário do corpus', () => {
  assert.ok(TOKEN.startsWith('ghp_FALSOv06') && TOKEN.length > 30);
  const falhas = [];
  for (const c of CORPUS) {
    const x = CORRIDAS.get(c.nome);
    if (!x) { falhas.push(`${c.nome}: não correu`); continue; }
    for (const onde of procuraToken(x.m, x.r)) falhas.push(`${c.nome}: ${onde}`);
  }
  assert.deepEqual(falhas, []);
});