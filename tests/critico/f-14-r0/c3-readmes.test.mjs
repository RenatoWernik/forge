// F-14 critério 3, a emenda 6503240709 e o seguimento dos READMEs: os READMEs em inglês e em pt-BR descrevem os 7 componentes, os
// 2 modos, o painel (o mod e a página), os 3 hooks e o contrato nas GitHub Issues, sem o claude-mem; documentam o /forge:update
// (--check, um sim por componente e as barreiras --accept-unverified, --backup-confirmed e --overwrite); os requisitos dizem Node
// ≥ 22.1; o componente 1 aponta para o fork RenatoWernik/gauntlet-loop e nenhum link aponta para o robonuggets.
// Oráculo (o do contrato): os termos literais. Como a redação é livre (fora da barra), os termos são os identificadores que não se
// traduzem (PERGUNTA 6 na #15):
//   modos       `rigorous` e `accelerated` (os valores de mode no forge.json);
//   painel      a página (`panel.html` ou `.claude/dashboard`) e o mod (a palavra «mod»);
//   hooks       por hook, a chave das respostas (killByName, backgroundTests, idleWatch) ou o nome do script (forge-matar-por-nome, ...);
//   contrato    «GitHub Issues»;
//   update      `/forge:update`, `--check`, `--accept-unverified`, `--backup-confirmed`, `--overwrite`;
//   requisitos  na secção «## Requirements» / «## Requisitos», «22.1» e já não «20.12»;
//   fonte       a linha 1 da tabela dos componentes tem github.com/RenatoWernik/gauntlet-loop; nenhum «github.com/robonuggets».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, readFileSync } from './helpers.mjs';

const READMES = ['README.md', 'README.pt-BR.md'];
const ler = (f) => readFileSync(join(ROOT, f), 'utf8');
const seccao = (text, re) => {
  const ls = text.split(/\r?\n/), i = ls.findIndex((l) => re.test(l));
  if (i < 0) return '';
  const j = ls.findIndex((l, k) => k > i && /^## /.test(l));
  return ls.slice(i, j < 0 ? undefined : j).join('\n');
};
const HOOKS = [['killByName', 'forge-matar-por-nome'], ['backgroundTests', 'forge-testes-em-primeiro-plano'], ['idleWatch', 'forge-vigia-de-agentes']];
const TERMOS = {
  'modo rigorous': /\brigorous\b/, 'modo accelerated': /\baccelerated\b/,
  'painel: a página': /panel\.html|\.claude\/dashboard/, 'painel: o mod': /\bmod\b/i,
  'contrato nas GitHub Issues': /GitHub Issues/,
  '/forge:update': /\/forge:update\b/, '--check': /--check\b/, '--accept-unverified': /--accept-unverified\b/, '--backup-confirmed': /--backup-confirmed\b/, '--overwrite': /--overwrite\b/,
};

for (const f of READMES) {
  test(`C3 ${f}: tem os termos dos 2 modos, do painel (mod e página), do contrato nas GitHub Issues e do /forge:update com as 4 opções`, () => {
    const t = ler(f);
    assert.deepEqual(Object.entries(TERMOS).filter(([, re]) => !re.test(t)).map(([n]) => n), []);
  });
  test(`C3 ${f}: nomeia os 3 hooks (a chave da resposta ou o nome do script)`, () => {
    const t = ler(f);
    assert.deepEqual(HOOKS.filter(([k, s]) => !t.includes(k) && !t.includes(s)).map(([k]) => k), []);
  });
  test(`emenda ${f}: a secção dos requisitos pede Node 22.1 ou mais recente, e não 20.12`, () => {
    const s = seccao(ler(f), /^## (Requirements|Requisitos)\b/);
    assert.ok(s, 'secção dos requisitos não encontrada');
    assert.match(s, /\b22\.1\b/);
    assert.doesNotMatch(s, /\b20\.12\b/);
  });
  test(`seguimento ${f}: o componente 1 aponta para o fork RenatoWernik/gauntlet-loop e nenhum link aponta para o robonuggets`, () => {
    const t = ler(f);
    const linha1 = t.split(/\r?\n/).find((l) => /^\|\s*1\s*\|/.test(l));
    assert.ok(linha1, 'linha 1 da tabela dos componentes não encontrada');
    assert.match(linha1, /github\.com\/RenatoWernik\/gauntlet-loop\b/);
    assert.doesNotMatch(t, /github\.com\/robonuggets/i);
  });
}
