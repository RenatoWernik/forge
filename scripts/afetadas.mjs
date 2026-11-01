#!/usr/bin/env node
// Suítes afetadas por um diff (V-02, #126; spec #123 §4.3). Só biblioteca padrão.
//   afetadas(ficheiros) → { suites, porque }: a união de três coisas
//     1. as regras de scripts/mapa-suites.json cujo glob casa com um ficheiro do diff ("*" = todas as suítes);
//     2. a regra implícita: tests/critico/<x>/** afeta a suíte <x>;
//     3. o fecho do lote: as suítes-alvo dos doLote das suítes já afetadas (repetido até não entrar nenhuma).
//   Um ficheiro que nenhuma regra cobre conta como "*" (a regra «sem regra»): o lint M1 do mapa existe para isso nunca acontecer.
//   `porque` é { <suíte>: [{ regra, ficheiro }] }, com `regra` = o glob que casou, `implícita`, `doLote:<suíte de origem>` ou `sem regra`.
//   node scripts/afetadas.mjs --base <ref>   imprime, por suíte, a regra e o ficheiro que a trouxeram (diff contra git merge-base HEAD <ref>).
import { spawnSync } from 'node:child_process';
import { existsSync, globSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../', import.meta.url));
const PASTA = 'tests/critico/';
// o oráculo dos testes usa o mesmo path.posix.matchesGlob: `**` não casa com pastas de ponto, por isso `templates/.claude/**` é explícito no mapa
export const casa = (ficheiro, glob) => posix.matchesGlob(ficheiro, glob);
const json = (raiz, rel) => JSON.parse(readFileSync(join(raiz, rel), 'utf8'));

export function lerMapa(raiz = RAIZ) {
  const m = json(raiz, 'scripts/mapa-suites.json');
  if (m.versao !== 1 || !Array.isArray(m.regras)) throw new Error('mapa-suites.json: versao 1 com regras[] esperada');
  m.regras.forEach((r, i) => {
    if (!Array.isArray(r.caminhos) || !r.caminhos.length) throw new Error(`mapa-suites.json: regra ${i} sem caminhos`);
    if (!Array.isArray(r.suites) || !r.suites.length) throw new Error(`mapa-suites.json: regra ${i} com a lista de suites vazia`);
  });
  return m;
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

// o que cada suíte afetada traz só pelas regras e pela regra implícita, sem o fecho do lote
export function diretas(ficheiros, raiz = RAIZ) {
  const nomes = json(raiz, 'scripts/suites.json').suites.map((s) => s.nome), mapa = lerMapa(raiz), porque = {};
  const junta = (s, regra, ficheiro) => (porque[s] ??= []).push({ regra, ficheiro });
  for (const f of ficheiros) {
    let achou = false;
    for (const r of mapa.regras) {
      const g = r.caminhos.find((x) => casa(f, x));
      if (g) { achou = true; for (const s of r.suites) junta(s, g, f); }
    }
    const pasta = f.startsWith(PASTA) ? f.slice(PASTA.length).split('/')[0] : null;
    if (nomes.includes(pasta)) { achou = true; junta(pasta, 'implícita', f); }
    if (!achou) junta('*', 'sem regra', f);
  }
  const todas = porque['*'] ?? [];
  delete porque['*'];
  if (todas.length) for (const n of nomes) for (const e of todas) junta(n, e.regra, e.ficheiro);
  return { nomes, porque };
}

// as suítes-alvo (literais) dos doLote dos ficheiros da suíte; um alvo montado em runtime não se vê
const reLote = /\bdoLote\(\s*[\w$.]+\s*,\s*(['"`])([^'"`\n]+)\1/g;
const alvosDoLote = (raiz, suite) => new Set(ficheirosDaSuite(raiz, suite).flatMap((f) => [...readFileSync(join(raiz, f), 'utf8').matchAll(reLote)].map((m) => m[2])));

export function afetadas(ficheiros, raiz = RAIZ) {
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
  return { base: mb.stdout.trim(), ficheiros, ...afetadas(ficheiros, raiz) };
}

// uma linha por suíte: a primeira razão (as das regras vêm antes das do fecho) e quantas mais há
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
