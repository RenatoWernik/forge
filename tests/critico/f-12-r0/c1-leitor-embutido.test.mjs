// F-12, critério 1: o leitor embutido na página gerada é idêntico, byte a byte, ao módulo partilhado do F-10, e é ele que corre.
// Oráculo: os bytes de scripts/painel-leitor.mjs aparecem uma só vez, contíguos, na página de cada projeto do corpus (8 conjuntos)
// e de um projeto noutra língua; o template tem zero cópias (uma só fonte, embutida pelo scaffold); e uma mutação feita só na cópia
// embutida muda as contagens que a página desenha (se a página tivesse outra lógica, a mutação não se via).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, LEITOR, PAGINA, corpusAnswers, respostas, paginaDe, sessao, docsDe, base } from './helpers.mjs';

const fonte = () => readFileSync(LEITOR, 'utf8');
const ocorrencias = (txt, sub) => txt.split(sub).length - 1;

test('C1: em cada projeto do corpus (8) e num projeto em espanhol, a página tem os bytes do leitor exatamente uma vez', async () => {
  const L = fonte();
  const casos = [...corpusAnswers().map((a) => [a.name, a.value]),
    ['es (panelStrings)', { ...respostas('en-noplain-published'), language: 'Spanish', langTag: 'es', panelStrings: { running: 'En ejecucion', live: 'en vivo</script>' } }]];
  const falhas = [];
  for (const [nome, ans] of casos) {
    const n = ocorrencias(await paginaDe(ans), L);
    if (n !== 1) falhas.push(`${nome}: ${n} cópias`);
  }
  assert.deepEqual(falhas, []);
});

test('C1: o template da página não traz uma cópia do leitor (a única fonte é scripts/painel-leitor.mjs)', () => {
  const tpl = readFileSync(join(ROOT, 'templates', PAGINA), 'utf8');
  for (const marca of ['export function ler(', 'export function validar(', "const vida = (mtime, agora)"]) assert.ok(!tpl.includes(marca), 'o template tem uma cópia do leitor: ' + marca);
});

let B;
before(async () => { B = await sessao(); });
after(async () => { await B?.fechar(); });

test('C1: é a cópia embutida que corre: mutar só essa cópia (cada ticket conta 100) muda as contagens desenhadas', async () => {
  const L = fonte();
  const DE = 'for (const t of o.tickets) n[t.estado]++;';
  assert.ok(L.includes(DE), 'pré-condição: o leitor do F-10 tem a linha das contagens');
  const pagina = await paginaDe();
  assert.equal(ocorrencias(pagina, L), 1, 'a página não tem o leitor (critério 1)');
  const mutante = pagina.replace(L, L.replace(DE, 'for (const t of o.tickets) n[t.estado] += 100;'));
  await B.abrir(mutante, { docs: docsDe(base()) });
  const v = await B.vista();
  assert.deepEqual(v.contagens, [['main', 100], ['aprovado', 100], ['critico', 100], ['dev', 0], ['reprovado', 0], ['espera', 0], ['falta', 100]]);
});
