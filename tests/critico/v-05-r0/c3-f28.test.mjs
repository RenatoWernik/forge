// V-05 (#129) C3, ponta real do F-28: reaplicar num clone temporário o diff do commit do F-22a (o `seed` das mutações) sobre o pai dele dá
// FAIL no passo 4 (afetadas no ramo) com f-02-r0, e um código ≠ 0. No pai não há check-ticket, manifesto nem mapa, por isso o clone leva:
// - na main (= origin/main): o pai + um commit com as ferramentas deste HEAD (o scripts/check-ticket.mjs e os .mjs que ele importa de forma
//   relativa, o scripts/suites.json só com as suítes que existem depois do commit reaplicado, o scripts/mapa-suites.json só com essas suítes,
//   sem as regras que ficam vazias, e a linha .forge/ no .gitignore);
// - no ramo f-22a-reaplicado: o cherry-pick do commit; o --ambito são os ficheiros que ele muda.
// Lido assim como PERGUNTA na #129. Só corre com FORGE_V05_PONTA=<pasta>: as afetadas do commit passam dos 540 s de uma chamada. Cada chamada do
// teste faz uma chamada ao check-ticket (com --continuar depois de um código 3) e guarda o estado em <pasta>/c3-<sha>/; enquanto der 3, o teste
// falha a pedir que se corra de novo com a mesma pasta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { ROOT, gitOk, shaDe, correr, linhas, saida, exigeCheck, escreve } from './helpers.mjs';

const PONTA = process.env.FORGE_V05_PONTA;
const COMMIT_F28 = '8ff53ac';
const RAMO = 'f-22a-reaplicado';

// os .mjs que o check-ticket importa de forma relativa (fecho transitivo), como caminhos do repo
function ferramentas() {
  const vistos = new Set(), fila = ['scripts/check-ticket.mjs'];
  while (fila.length) {
    const rel = fila.pop();
    if (vistos.has(rel)) continue;
    vistos.add(rel);
    const src = gitOk(ROOT, 'show', `HEAD:${rel}`);
    for (const m of src.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.{1,2}\/[^'"]+)['"]/g)) fila.push(posix.normalize(posix.join(posix.dirname(rel), m[1])));
  }
  return [...vistos];
}

function prepara(repo) {
  mkdirSync(dirname(repo), { recursive: true });
  gitOk(ROOT, 'clone', '-q', '--no-checkout', ROOT, repo);
  gitOk(repo, 'checkout', '-q', '-B', 'main', `${COMMIT_F28}^`);
  for (const rel of ferramentas()) escreve(repo, rel, gitOk(ROOT, 'show', `HEAD:${rel}`));
  const depois = new Set(gitOk(repo, 'ls-tree', '-r', '--name-only', COMMIT_F28, '--', 'tests/critico').split(/\r?\n/).filter((f) => f.endsWith('.test.mjs')).map((f) => f.split('/')[2]));
  const m = JSON.parse(gitOk(ROOT, 'show', 'HEAD:scripts/suites.json'));
  m.suites = m.suites.filter((s) => s.nome === 'scripts' || depois.has(s.nome));
  const nomes = new Set(m.suites.map((s) => s.nome));
  escreve(repo, 'scripts/suites.json', JSON.stringify(m, null, 2) + '\n');
  const mapa = JSON.parse(gitOk(ROOT, 'show', 'HEAD:scripts/mapa-suites.json'));
  mapa.regras = mapa.regras.map((r) => ({ ...r, suites: r.suites.filter((s) => s === '*' || nomes.has(s)) })).filter((r) => r.suites.length);
  escreve(repo, 'scripts/mapa-suites.json', JSON.stringify(mapa, null, 2) + '\n');
  appendFileSync(join(repo, '.gitignore'), '\n.forge/\n');
  gitOk(repo, 'add', '-A');
  gitOk(repo, 'commit', '-q', '-m', 'ferramentas do V-05 sobre o pai do commit do F-22a');
  gitOk(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  gitOk(repo, 'checkout', '-q', '-b', RAMO);
  gitOk(repo, 'cherry-pick', '--no-edit', COMMIT_F28);
}

test('C3 (ponta real do F-28): o diff do commit do F-22a reaplicado sobre o pai dele dá FAIL afetadas no ramo com f-02-r0', async (t) => {
  if (!PONTA) return t.skip('ponta real: corre só com FORGE_V05_PONTA=<pasta> (crítico da R1 e Ronda 0)');
  exigeCheck();
  const pasta = join(PONTA, `c3-${shaDe(ROOT).slice(0, 12)}`), repo = join(pasta, 'repo'), fEstado = join(pasta, 'estado.json');
  if (!existsSync(join(repo, '.git'))) prepara(repo);
  assert.equal(gitOk(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), RAMO);
  const estado = existsSync(fEstado) ? JSON.parse(readFileSync(fEstado, 'utf8')) : { chamadas: [] };
  const ambito = gitOk(repo, 'show', '--name-only', '--format=', 'HEAD').split(/\r?\n/).filter(Boolean);
  const continuar = estado.chamadas.at(-1)?.codigo === 3;
  const r = await correr(repo, ['--ambito', ...ambito, '--base', 'origin/main', ...(continuar ? ['--continuar'] : [])], { limite_ms: 520000, tempReal: true });
  estado.chamadas.push({ codigo: r.status, ms: r.ms, pendurado: r.pendurado });
  writeFileSync(fEstado, JSON.stringify(estado, null, 2));
  writeFileSync(join(pasta, `chamada-${estado.chamadas.length}.log`), r.out + '\n--- stderr ---\n' + r.err);
  assert.equal(r.pendurado, false, `a chamada passou dos 520 s (o orçamento é 500 s)\n${saida(r)}`);
  assert.notEqual(r.status, 3, `incompleto (código 3): corra de novo com o mesmo FORGE_V05_PONTA (a chamada seguinte leva --continuar; ${pasta})`);
  assert.notEqual(r.status, 0, saida(r));
  const p4 = linhas(r.out).find((l) => l.passo === 'afetadas no ramo');
  assert.ok(p4, `sem a linha do passo 4\n${saida(r)}`);
  assert.equal(p4.estado, 'FAIL', p4.linha);
  assert.match(p4.linha, /\bf-02-r0\b/, p4.linha);
});