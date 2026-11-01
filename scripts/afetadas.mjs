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
  const suites = json(raiz, 'scripts/suites.json').suites, nomes = suites.map((s) => s.nome), porque = {};
  const junta = (s, regra, ficheiro) => (porque[s] ??= []).push({ regra, ficheiro });
  const sempre = Object.keys(lerMapa(raiz).sempre ?? {});
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
    deps ??= Object.fromEntries(suites.map((s) => [s.nome, new Set(ficheirosDaSuite(raiz, s).map(pastaDe).filter((p) => p && p !== s.nome))]));
    for (const n of nomes) if (deps[n].has(pasta)) junta(n, `importa ${PASTA}${pasta}/`, f);
  }
  for (const s of sempre) junta(s, 'sempre', ficheiros[0] ?? '(diff vazio)');
  return { nomes, porque };
}

// as suítes-alvo (literais) dos doLote dos ficheiros da suíte; um alvo montado em runtime não se vê
const reLote = /\bdoLote\(\s*[\w$.]+\s*,\s*(['"`])([^'"`\n]+)\1/g;
const alvosDoLote = (raiz, suite) => new Set(ficheirosDaSuite(raiz, suite).flatMap((f) => [...readFileSync(join(raiz, f), 'utf8').matchAll(reLote)].map((m) => m[2])));

export function afetadas(ficheiros, { raiz = RAIZ } = {}) {
  const { nomes, porque } = diretas(ficheiros, raiz), suites = json(raiz, 'scripts/suites.json').suites;
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
