// Ronda −1 do V-05 (#129): o corpus de cenários do C1 (≥ 7, de (a) a (g), mais os que atacam «um passo que dá ok sem ter corrido»).
// Cada cenário diz o que o ramo muda (commitado), o que fica sujo, os globs do --ambito, o código esperado, os passos que têm de dar ok e os
// que têm de dar FAIL, com o que a linha FAIL tem de nomear (e o que não pode nomear). As guardas provam que cada fixture faz o que diz.
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { FX, escreve } from './helpers.mjs';

const A = ['tests/critico/a-r0/**'];
export const CENARIOS = [
  { id: 'a', titulo: 'um ticket limpo dá 0, com os 6 passos ok',
    ramo: (d) => escreve(d, 'tests/critico/a-r0/x.test.mjs', FX.xMais), ambito: A, codigo: 0 },
  { id: 'a-sem-publicar', titulo: 'o mesmo ticket limpo sem --publicar dá 0 e não chama o gh', publicar: false,
    ramo: (d) => escreve(d, 'tests/critico/a-r0/x.test.mjs', FX.xMais), ambito: A, codigo: 0 },
  { id: 'b', titulo: 'um ficheiro fora do âmbito dá FAIL âmbito, que lista só o de fora',
    ramo: (d) => { escreve(d, 'tests/critico/a-r0/x.test.mjs', FX.xMais); escreve(d, 'README.md', '# cenário b\n'); }, ambito: A, codigo: 1,
    ok: ['árvore limpa', 'lint'], fail: { 'âmbito': ['README.md'] }, naoInclui: { 'âmbito': ['x.test.mjs'] } },
  { id: 'c', titulo: 'uma suíte afetada vermelha dá FAIL afetadas no ramo, com o nome da suíte',
    ramo: (d) => escreve(d, 'tests/critico/a-r0/x.test.mjs', FX.xVermelho), ambito: A, codigo: 1,
    ok: ['árvore limpa', 'lint', 'âmbito'], fail: { 'afetadas no ramo': ['a-r0'] } },
  { id: 'd', titulo: 'verde no ramo e vermelho depois do merge (um teste que lê o merge-base) dá FAIL pós-merge, com o nome da suíte',
    ramo: (d) => escreve(d, 'tests/critico/a-r0/d.test.mjs', FX.d), ambito: A, codigo: 1,
    ok: ['árvore limpa', 'lint', 'âmbito', 'afetadas no ramo'], fail: { 'pós-merge': ['a-r0'] } },
  { id: 'e', titulo: 'um teste «ÂMBITO:» sem soNoTicket dá FAIL lint',
    ramo: (d) => escreve(d, 'tests/critico/a-r0/e.test.mjs', FX.e), ambito: A, codigo: 1,
    ok: ['árvore limpa', 'âmbito'], fail: { lint: [] } },
  { id: 'f', titulo: 'uma árvore suja (ficheiro rastreado alterado sem commit) dá FAIL árvore limpa',
    ramo: (d) => escreve(d, 'tests/critico/a-r0/x.test.mjs', FX.xMais), sujo: (d) => escreve(d, 'tests/critico/a-r0/x.test.mjs', FX.x), ambito: A, codigo: 1,
    fail: { 'árvore limpa': [] } },
  { id: 'f2', titulo: 'uma árvore suja (ficheiro novo por seguir) dá FAIL árvore limpa',
    ramo: (d) => escreve(d, 'tests/critico/a-r0/x.test.mjs', FX.xMais), sujo: (d) => escreve(d, 'tests/critico/a-r0/notas.txt', 'por commitar\n'), ambito: A, codigo: 1,
    fail: { 'árvore limpa': [] } },
  { id: 'g', titulo: 'o seed: mudar o esquema das mutações sem atualizar o consumidor dá FAIL afetadas no ramo, que nomeia o consumidor, e FAIL esquema',
    ramo: (d) => escreve(d, 'scripts/corpus/mutations/m1.json', FX.mutacaoComSeed), ambito: ['scripts/corpus/mutations/**'], codigo: 1,
    ok: ['árvore limpa', 'lint', 'âmbito'], fail: { 'afetadas no ramo': ['c-r0'], esquema: [] } },
  { id: 'h', titulo: 'um mapa ilegível nunca dá ok nas afetadas do ramo (afetadas vazias por erro de mapa)',
    ramo: (d) => { escreve(d, 'tests/critico/a-r0/x.test.mjs', FX.xMais); escreve(d, 'scripts/mapa-suites.json', '{ "versao": 1, "regras": [\n'); },
    ambito: [...A, 'scripts/mapa-suites.json'], codigo: 1, ok: ['árvore limpa', 'âmbito'], fail: { 'afetadas no ramo': [] } },
  { id: 'i', titulo: 'uma suíte afetada que ficou sem ficheiros (o executor não a corre) nunca dá ok nas afetadas do ramo',
    ramo: (d) => rmSync(join(d, 'tests/critico/c-r0/z.test.mjs')), ambito: ['tests/critico/c-r0/**'], codigo: 1,
    ok: ['árvore limpa', 'lint', 'âmbito'], fail: { 'afetadas no ramo': [] } },
  { id: 'j', titulo: 'mudar o esquema e atualizar o consumidor no mesmo ticket dá 0, com o esquema ok',
    ramo: (d) => { escreve(d, 'scripts/corpus/mutations/m1.json', FX.mutacaoComSeed); escreve(d, 'tests/critico/c-r0/z.test.mjs', FX.consumidor(['file', 'find', 'replace', 'seed'])); },
    ambito: ['scripts/corpus/mutations/**', 'tests/critico/c-r0/**'], codigo: 0 },
  { id: 'k', titulo: 'um teste «ÂMBITO:» que leria o merge-base faz skip no pós-merge e o ticket dá 0',
    ramo: (d) => escreve(d, 'tests/critico/a-r0/k.test.mjs', FX.k), ambito: A, codigo: 0 },
];