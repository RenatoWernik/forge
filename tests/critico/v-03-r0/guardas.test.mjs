// Guardas do V-03 (regra 8 dos briefs; «Reprova» da #127): comparam com base(), o git merge-base HEAD origin/main.
//   - os ficheiros de tests/critico/ da base fora da lista autorizada do ticket ficam byte a byte: a conversão só toca na lista;
//   - nos ficheiros da lista, os asserts (a chamada inteira, com a mensagem) e as declarações dos testes (título e opções, sem os parâmetros
//     da função) ficam iguais, como multiconjunto; um ficheiro da lista que mude chama o doLote. É a única alteração autorizada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { base } from '../_comum/base.mjs';
import { ROOT, crit, AUTORIZADOS, LF, git, textoNaBase } from './helpers.mjs';

// as chamadas assert(...)/assert.x(...) inteiras, com o espaço normalizado (as strings são saltadas ao contar os parênteses)
export function asserts(src) {
  const out = [], re = /\bassert(?:\.\w+)?\s*\(/g;
  for (let m; (m = re.exec(src));) {
    let i = m.index + m[0].length;
    for (let d = 1; i < src.length && d; i++) {
      const c = src[i];
      if (c === '"' || c === "'" || c === '`') { for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++; }
      else if (c === '(') d++;
      else if (c === ')') d--;
    }
    out.push(src.slice(m.index, i).replace(/\s+/g, ' '));
    re.lastIndex = i;
  }
  return out.sort();
}
// o que vai de test( / it( / describe( até à seta da função, sem os parâmetros: o título e as opções
export const declaracoes = (src) => [...src.matchAll(/\b(?:test|it|describe)\s*\(([\s\S]*?)=>/g)]
  .map((m) => m[1].replace(/(?:async\s+)?(?:\(\s*\w*\s*\)|\w+)\s*$/, '').replace(/\s+/g, ' ').trim()).sort();

const ficheirosDaBase = (b) => git(ROOT, ['ls-tree', '-r', '--name-only', b, '--', crit('')]).split('\n').filter(Boolean);

test('GUARDA: os ficheiros de tests/critico/ da base fora da lista autorizada do ticket ficam byte a byte', (t) => {
  const b = base();
  if (!b) return t.skip('sem origin/main');
  const fs = ficheirosDaBase(b).filter((f) => !AUTORIZADOS.includes(f));
  assert.ok(fs.length > 100, 'controlo: ' + fs.length);
  const mudados = fs.filter((f) => !existsSync(join(ROOT, f)) || LF(readFileSync(join(ROOT, f), 'utf8')) !== LF(textoNaBase(b, f)));
  assert.deepEqual(mudados, []);
});
test('GUARDA: nos ficheiros da lista autorizada, os asserts e as declarações dos testes ficam iguais, e um ficheiro que mude chama o doLote', (t) => {
  const b = base();
  if (!b) return t.skip('sem origin/main');
  const falhas = [];
  for (const f of AUTORIZADOS) {
    const velho = textoNaBase(b, f);
    if (velho === null) { falhas.push(`${f}: não existe na base`); continue; }
    if (!existsSync(join(ROOT, f))) { falhas.push(`${f}: apagado`); continue; }
    const novo = readFileSync(join(ROOT, f), 'utf8');
    if (LF(novo) === LF(velho)) continue;
    if (!/\bdoLote\s*\(/.test(novo)) falhas.push(`${f}: mudou sem chamar o doLote`);
    const [av, an] = [asserts(velho), asserts(novo)];
    const tirados = av.filter((a) => !an.includes(a)), novos = an.filter((a) => !av.includes(a));
    if (tirados.length || novos.length || av.length !== an.length) falhas.push(`${f}: asserts tirados ${JSON.stringify(tirados)}, novos ${JSON.stringify(novos)}`);
    const [dv, dn] = [declaracoes(velho), declaracoes(novo)];
    if (JSON.stringify(dv) !== JSON.stringify(dn)) falhas.push(`${f}: declarações dos testes mudaram: ${JSON.stringify(dv.filter((x) => !dn.includes(x)))} → ${JSON.stringify(dn.filter((x) => !dv.includes(x)))}`);
  }
  assert.deepEqual(falhas, []);
});
test('controlo: o extrator de asserts e o de declarações apanham as chamadas inteiras e ignoram os parâmetros', () => {
  const src = "test('a (b)', { skip: x && 'm' }, async (t) => { assert.ok(r.pass >= 94, 'passaram ' + r.pass + ')');\n  assert.equal(\n    r.status, 0);\n});\ntest(`c ${d}`, () => 1);";
  assert.deepEqual(asserts(src), ["assert.equal( r.status, 0)", "assert.ok(r.pass >= 94, 'passaram ' + r.pass + ')')"]);
  assert.deepEqual(declaracoes(src), ["'a (b)', { skip: x && 'm' },", '`c ${d}`,']);
});