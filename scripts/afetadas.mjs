#!/usr/bin/env node
// Suítes afetadas por um diff (V-02, #126; spec #123 §4.3, com o MECANISMO FINAL da #126). Só biblioteca padrão.
//   afetadas(ficheiros, { raiz }) → { suites, porque }; o manifesto, o mapa e os ficheiros lidos vêm de `raiz` (por omissão, o repo deste módulo).
//   O desenho é conservador: um mapa fino falha em silêncio, um largo só custa tempo. As regras estão AQUI, no código, nunca em dados editáveis:
//     1. as suítes `sempre` do scripts/mapa-suites.json (as guardas por diff e varrimento) entram em todas as seleções;
//     2. um diff só com ficheiros de tests/critico/<x>/** (x do manifesto) dá cada <x>, as suítes que importam ficheiros dessa pasta
//        (helpers e golden) e as `sempre`;
//     3. qualquer outro ficheiro (código, templates, corpus, documentação, tests/critico/_comum, uma pasta fora do manifesto) dá TODAS as suítes;
//     4. um diff vazio dá as `sempre`;
//     e, sobre o resultado, o fecho do lote: as suítes-alvo dos doLote das suítes afetadas, até não entrar nenhuma.
//   `porque` é { <suíte>: [{ regra, ficheiro }] }, com `regra` = `fora de tests/critico`, `tests/critico/_comum`, `pasta fora do manifesto`,
//   `implícita`, `importa <pasta>`, `sempre` ou `doLote:<suíte de origem>`.
//   node scripts/afetadas.mjs --base <ref>   imprime, por suíte, a regra e o ficheiro que a trouxeram (diff contra git merge-base HEAD <ref>).
import { spawnSync } from 'node:child_process';
import { existsSync, globSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../', import.meta.url));
const PASTA = 'tests/critico/';
const json = (raiz, rel) => JSON.parse(readFileSync(join(raiz, rel), 'utf8'));
// shortcut: o que só depende da árvore (manifesto, mapa, ficheiros de cada suíte, pastas que ela importa, alvos dos doLote) fica em memória, por raiz,
// durante o processo (refazê-lo custava ~370 ms por chamada: o c1-cobertura chama-a 812 vezes). Assume uma árvore que não muda neste processo; quem a altera
// chama afetadas() num processo novo. O diff dos ficheiros nunca entra na cache; uma exceção não fica guardada.
const CACHE = new Map();
const memo = (raiz, chave, f) => {
  const c = CACHE.get(raiz) ?? CACHE.set(raiz, new Map()).get(raiz);
  if (!c.has(chave)) c.set(chave, f());
  return c.get(chave);
};
const ficheirosDe = (raiz, suite) => memo(raiz, `ficheiros:${suite.nome}`, () => ficheirosDaSuite(raiz, suite));

export function lerMapa(raiz = RAIZ) {
  const m = json(raiz, 'scripts/mapa-suites.json');
  if (m.versao !== 1) throw new Error('mapa-suites.json: versao 1 esperada');
  if (m.sempre !== undefined && !(m.sempre && typeof m.sempre === 'object' && !Array.isArray(m.sempre))) throw new Error('mapa-suites.json: sempre é { suíte: motivo }');
  return m; // shortcut: chaves a mais (como as antigas `regras`) são ignoradas aqui; é o lint que as recusa no mapa do repo
}

// os imports relativos (de forma transitiva) dos ficheiros dados, com eles; os que não existem ficam de fora
export function fechoImports(raiz, ficheiros) {
  const vistos = new Set(), pend = [...ficheiros];
  while (pend.length) {
    const f = pend.pop();
    if (vistos.has(f) || !existsSync(join(raiz, f)) || !statSync(join(raiz, f)).isFile()) continue;
    vistos.add(f);
    for (const m of readFileSync(join(raiz, f), 'utf8').matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\1/g)) pend.push(posix.normalize(posix.join(dirname(f), m[2])));
  }
  return [...vistos].sort();
}

// os ficheiros de uma suíte `node-test` (os do manifesto e os imports relativos deles); uma suíte `comando` não tem ficheiros
export const ficheirosDaSuite = (raiz, suite) =>
  fechoImports(raiz, [...new Set((suite.ficheiros ?? []).flatMap((g) => globSync(g, { cwd: raiz }).map((f) => f.replaceAll('\\', '/'))))]);

const pastaDe = (f) => (f.startsWith(PASTA) && f.slice(PASTA.length).includes('/') ? f.slice(PASTA.length).split('/')[0] : null);

// as regras 1 a 4, sem o fecho do lote
export function diretas(ficheiros, raiz = RAIZ) {
  const suites = memo(raiz, 'suites', () => json(raiz, 'scripts/suites.json').suites), nomes = suites.map((s) => s.nome), porque = {};
  const junta = (s, regra, ficheiro) => (porque[s] ??= []).push({ regra, ficheiro });
  const sempre = Object.keys(memo(raiz, 'mapa', () => lerMapa(raiz)).sempre ?? {});
  const desconhecidas = sempre.filter((s) => !nomes.includes(s));
  if (desconhecidas.length) throw new Error(`mapa-suites.json: sempre com suítes que não estão no manifesto: ${desconhecidas.join(', ')}`);
  const fora = ficheiros.find((f) => !nomes.includes(pastaDe(f)));
  if (fora !== undefined) {
    const regra = !fora.startsWith(PASTA) ? 'fora de tests/critico' : fora.startsWith(`${PASTA}_comum/`) ? 'tests/critico/_comum' : 'pasta fora do manifesto';
    for (const n of nomes) junta(n, regra, fora);
    return { nomes, porque };
  }
  let deps; // suíte → pastas de tests/critico que ela importa (as dos helpers de outras suítes)
  for (const f of ficheiros) {
    const pasta = pastaDe(f);
    junta(pasta, 'implícita', f);
    deps ??= memo(raiz, 'deps', () => Object.fromEntries(suites.map((s) => [s.nome, new Set(ficheirosDe(raiz, s).map(pastaDe).filter((p) => p && p !== s.nome))])));
    for (const n of nomes) if (deps[n].has(pasta)) junta(n, `importa ${PASTA}${pasta}/`, f);
  }
  for (const s of sempre) junta(s, 'sempre', ficheiros[0] ?? '(diff vazio)');
  return { nomes, porque };
}

// o 2.º argumento (o alvo) de cada doLote( do texto: do 1.º ao 2.º vírgula de nível 0, sem olhar para dentro de cadeias
function alvosEm(texto) {
  const args = [];
  for (const m of texto.matchAll(/\bdoLote\(/g)) {
    let prof = 0, virgulas = 0, ini = -1, q = null;
    for (let i = m.index + m[0].length; i < texto.length; i++) {
      const c = texto[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
      if ('\'"`'.includes(c)) q = c;
      else if ('([{'.includes(c)) prof++;
      else if (')]}'.includes(c)) { if (prof-- === 0) { if (ini >= 0) args.push(texto.slice(ini, i)); break; } }
      else if (c === ',' && prof === 0 && ++virgulas === 1) ini = i + 1;
      else if (c === ',' && prof === 0) { args.push(texto.slice(ini, i)); break; }
    }
  }
  return args;
}
const literais = (s) => [...s.matchAll(/(['"`])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2]);

// as suítes-alvo dos doLote dos ficheiros da suíte: os literais do alvo (texto, lista, `{ suite: 'x' }`) e os das listas literais que ele nomeia
// (`dirs.map(...)` com `const dirs = ['a', 'b']` no mesmo ficheiro). shortcut: um alvo montado em runtime (o `d` de um ciclo) não se vê; o doLote
// falha em voz alta na fase 2 com um alvo em falta, nunca em silêncio
const alvosDoLote = (raiz, suite) => memo(raiz, `alvos:${suite.nome}`, () => new Set(ficheirosDe(raiz, suite).flatMap((f) => {
  const texto = readFileSync(join(raiz, f), 'utf8');
  return alvosEm(texto).flatMap((arg) => {
    const ids = new Set(arg.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '').match(/[A-Za-z_$][\w$]*/g) ?? []);
    const listas = [...ids].flatMap((id) => [...texto.matchAll(new RegExp(`\\b(?:const|let|var)\\s+${id.replaceAll('$', '\\$')}\\s*=\\s*(\\[[^\\]]*\\])`, 'g'))].map((m) => m[1]));
    return [arg, ...listas].flatMap(literais);
  });
})));

export function afetadas(ficheiros, { raiz = RAIZ } = {}) {
  const { nomes, porque } = diretas(ficheiros, raiz), suites = memo(raiz, 'suites', () => json(raiz, 'scripts/suites.json').suites);
  const fila = Object.keys(porque);
  while (fila.length && Object.keys(porque).length < nomes.length) {
    const s = fila.shift();
    for (const alvo of alvosDoLote(raiz, suites.find((x) => x.nome === s))) {
      if (!nomes.includes(alvo) || porque[alvo]) continue;
      porque[alvo] = [{ regra: `doLote:${s}`, ficheiro: porque[s][0].ficheiro }];
      fila.push(alvo);
    }
  }
  return { suites: Object.keys(porque), porque };
}

// o diff contra `git merge-base HEAD <base>` e as suítes que ele afeta
export function desdeBase(base, raiz = RAIZ) {
  const g = (...a) => spawnSync('git', a, { cwd: raiz, encoding: 'utf8', maxBuffer: 1 << 28 });
  const mb = g('merge-base', 'HEAD', base);
  if (mb.status !== 0) throw new Error(`git merge-base HEAD ${base} falhou: ${mb.stderr.trim()}`);
  const d = g('diff', '--name-only', '--no-renames', '-z', mb.stdout.trim(), 'HEAD');
  if (d.status !== 0) throw new Error(`git diff falhou: ${d.stderr.trim()}`);
  const ficheiros = d.stdout.split('\0').filter(Boolean);
  return { base: mb.stdout.trim(), ficheiros, ...afetadas(ficheiros, { raiz }) };
}

// uma linha por suíte: a primeira razão e quantas mais há
export function linhas({ suites, porque }) {
  return suites.map((s) => { const [r, ...mais] = porque[s]; return `${s}  ${r.regra}  ${r.ficheiro}${mais.length ? `  (+${mais.length})` : ''}`; });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const a = process.argv.slice(2);
  if (a.length !== 2 || a[0] !== '--base' || a[1].startsWith('--')) { console.error('uso: node scripts/afetadas.mjs --base <ref>'); process.exit(2); }
  try {
    const r = desdeBase(a[1]);
    for (const l of linhas(r)) console.log(l);
    console.log(`afetadas: ${r.suites.length} suítes, ${r.ficheiros.length} ficheiros no diff contra ${r.base.slice(0, 7)}`);
  } catch (e) { console.error(`afetadas: ${e.message}`); process.exit(2); }
}
