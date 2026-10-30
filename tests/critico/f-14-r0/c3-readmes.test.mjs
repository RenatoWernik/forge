// F-14 critério 3, a emenda 6503240709 e o seguimento dos READMEs. Oráculo fixado pela resposta 4 do orquestrador na #15: os READMEs
// (EN e PT) têm, à letra, `/forge:update`, `RenatoWernik/gauntlet-loop` e `Node 22.1`; o `robonuggets` só aparece como crédito do
// original. Da emenda: as opções `--check`, `--accept-unverified`, `--backup-confirmed` e `--overwrite` do /forge:update, e os
// requisitos com Node 22.1 em vez de 20.12. Crédito = a linha com robonuggets diz original, credit/crédito ou fork, e não é a linha 1
// da tabela dos componentes (a fonte oficial passa a ser o fork).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, readFileSync } from './helpers.mjs';

const ler = (f) => readFileSync(join(ROOT, f), 'utf8');
const seccao = (text, re) => {
  const ls = text.split(/\r?\n/), i = ls.findIndex((l) => re.test(l));
  if (i < 0) return '';
  const j = ls.findIndex((l, k) => k > i && /^## /.test(l));
  return ls.slice(i, j < 0 ? undefined : j).join('\n');
};
const LITERAIS = ['/forge:update', 'RenatoWernik/gauntlet-loop', 'Node 22.1', '--check', '--accept-unverified', '--backup-confirmed', '--overwrite'];

for (const f of ['README.md', 'README.pt-BR.md']) {
  test(`C3 ${f}: tem à letra ${LITERAIS.join(', ')}`, () => {
    const t = ler(f);
    assert.deepEqual(LITERAIS.filter((x) => !t.includes(x)), []);
  });
  test(`emenda ${f}: a secção dos requisitos diz Node 22.1 e já não 20.12`, () => {
    const s = seccao(ler(f), /^## (Requirements|Requisitos)\b/);
    assert.ok(s, 'secção dos requisitos não encontrada');
    assert.ok(s.includes('Node 22.1'), s);
    assert.doesNotMatch(s, /\b20\.12\b/);
  });
  test(`seguimento ${f}: o componente 1 aponta para o fork e o robonuggets só aparece como crédito do original`, () => {
    const ls = ler(f).split(/\r?\n/);
    const linha1 = ls.find((l) => /^\|\s*1\s*\|/.test(l));
    assert.ok(linha1 && linha1.includes('RenatoWernik/gauntlet-loop'), 'linha 1 da tabela: ' + linha1);
    assert.doesNotMatch(linha1, /robonuggets/i);
    assert.deepEqual(ls.filter((l) => /robonuggets/i.test(l) && !/original|credit|crédito|fork/i.test(l)), []);
  });
}
