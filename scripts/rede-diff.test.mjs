// V-11 (#135, RESPOSTA da Ronda 2): a rede do diff. As guardas «reprova sempre» (dados pessoais) e «só biblioteca padrão» dos tickets f-04 a f-15a
// passaram a testes de âmbito e só correm no ramo do ticket antigo; esta é a que olha, em todos os ramos, para o que um ticket NOVO acrescenta.
// Compara com base() (git merge-base HEAD origin/main) e vê só as linhas acrescentadas fora de tests/ (as novas linhas do diff e os ficheiros
// por seguir); o que já estava na base e não foi tocado nunca falha. Os padrões e as exclusões são os das guardas convertidas (f-04, f-07, f-10, f-11).
// Não tem soNoTicket: corre em todos os ramos. Na main, base() é o HEAD e o diff é vazio. Os textos proibidos montam-se a partir de pedaços, para
// este ficheiro (que é do pacote e passa pela própria rede) não os trazer escritos.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { builtinModules } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { base } from '../tests/critico/_comum/base.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const P = (...a) => a.join('');

// dados pessoais e caminhos da máquina (a lista do f-07, que contém as do f-04 e do f-10; a do f-11 é mais curta)
const eu = userInfo().username;
const PROIBIDO = [/\b[A-Z]:\\\\?[A-Za-z]/, /\b[A-Z]:\/[A-Za-z]/, /\/Users\//, /\/home\/[a-z]/, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  new RegExp(P('gui', 'lda'), 'i'), new RegExp(P('re', 'nat'), 'i'), new RegExp(P('@key', 'rus\\.'), 'i'), new RegExp(P('Agent', 'Homes|dev-', 'mods|forge-', 'wt|forge-', 'ref'), 'i'),
  ...(eu && eu.length >= 3 ? [new RegExp(`\\b${eu.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')] : [])];
// os repositórios do próprio projeto não contam como dado pessoal
const DO_PROJETO = new RegExp(P('(?:github(?:usercontent)?\\.com\\/(?:repos\\/)?|(?<![\\w\\/.-]))', 'Re', 'natoWernik\\/(?:gauntlet-loop|forge)(?![\\w.-])'), 'gi');
// os imports e requires (o f-10 e o f-11)
const IMPORTS = [/\bimport\s+[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g, /\bimport\s*['"]([^'"]+)['"]/g, /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, /\bexport\s+[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g, /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g];
const CODIGO = ['.mjs', '.js', '.cjs', '.ts', '.tsx'];

const git = (cwd, ...a) => spawnSync('git', ['-c', 'core.quotepath=off', ...a], { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

// ficheiro → [[nº da linha, texto]] do que o diff contra `desde` acrescenta fora de tests/ (e dos ficheiros novos por seguir)
function acrescentado(raiz, desde) {
  const out = new Map();
  const add = (f, n, l) => { if (!out.has(f)) out.set(f, []); out.get(f).push([n, l]); };
  const d = git(raiz, 'diff', '-U0', '--no-color', desde, '--', '.', ':(exclude)tests');
  assert.equal(d.status, 0, d.stderr);
  let f = null, n = 0;
  for (const l of d.stdout.split('\n')) {
    const h = /^@@ -\S+ \+(\d+)/.exec(l);
    if (l.startsWith('+++ ')) f = l.startsWith('+++ b/') ? l.slice(6) : null;
    else if (h) n = +h[1];
    else if (f && l.startsWith('+')) add(f, n++, l.slice(1));
  }
  const u = git(raiz, 'ls-files', '--others', '--exclude-standard', '--', '.', ':(exclude)tests');
  for (const novo of u.stdout.split('\n').map((s) => s.trim()).filter(Boolean)) readFileSync(join(raiz, novo), 'utf8').split(/\r?\n/).forEach((l, i) => add(novo, i + 1, l));
  return out;
}

// as falhas ['<ficheiro>: <o quê>'] do que o diff de `raiz` acrescenta contra `desde`
export function rede(raiz, desde) {
  const falhas = [], linhas = acrescentado(raiz, desde);
  for (const [f, ls] of linhas) {
    for (const [, l] of ls) for (const re of PROIBIDO) if (re.test(l.replace(DO_PROJETO, ''))) falhas.push(`${f}: ${re} → ${l.trim().slice(0, 100)}`);
    // só biblioteca padrão: um import acrescentado (a linha onde acaba o especificador é nova) só pode ser node:, relativo ou um módulo nativo; claude-code só em .ts/.tsx
    if (!CODIGO.includes(extname(f)) || !existsSync(join(raiz, f))) continue;
    const src = readFileSync(join(raiz, f), 'utf8'), novas = new Set(ls.map(([n]) => n));
    for (const re of IMPORTS) for (const m of src.matchAll(re)) {
      const ok = m[1].startsWith('node:') || m[1].startsWith('.') || builtinModules.includes(m[1]) || (m[1] === 'claude-code' && ['.ts', '.tsx'].includes(extname(f)));
      if (!ok && novas.has(src.slice(0, m.index + m[0].length).split('\n').length)) falhas.push(`${f}: importa ${m[1]}`);
    }
  }
  return falhas;
}

test('rede do diff: o que este ramo acrescenta ao pacote não tem caminhos da máquina, ids de sessão, dados pessoais nem imports de fora da biblioteca padrão', (t) => {
  const b = base();
  if (!b) return t.skip('sem origin/main');
  const falhas = rede(ROOT, b);
  assert.deepEqual(falhas, [], '\n' + falhas.join('\n'));
});

// --- o oráculo, num repositório temporário (a config do utilizador nunca é lida nem escrita) ---
const lixo = [];
let vazio = null;
const ambiente = () => {
  if (!vazio) { const d = mkdtempSync(join(tmpdir(), 'rede-diff-cfg-')); lixo.push(d); vazio = join(d, 'gitconfig'); writeFileSync(vazio, ''); }
  return { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: vazio, GIT_TERMINAL_PROMPT: '0' };
};
const gitT = (cwd, ...a) => { const r = spawnSync('git', ['-c', 'user.name=rede', '-c', 'user.email=rede@example.invalid', '-c', 'commit.gpgsign=false', ...a], { cwd, encoding: 'utf8', env: ambiente() }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const escreve = (d, rel, texto) => { mkdirSync(dirname(join(d, rel)), { recursive: true }); writeFileSync(join(d, rel), texto); };
// um repo com um commit (a «base»: um ficheiro limpo e um com um caminho pessoal antigo) e a sua sha
function repo() {
  const d = mkdtempSync(join(tmpdir(), 'rede-diff-'));
  lixo.push(d);
  gitT(d, 'init', '-q', '-b', 'main');
  escreve(d, 'scripts/a.mjs', "import { join } from 'node:path';\nexport const a = join('x', 'y');\n");
  escreve(d, 'docs/velho.md', `# velho\n\n${P('/home', '/antigo/dados')} já estava na base.\n`);
  gitT(d, 'add', '-A');
  gitT(d, 'commit', '-q', '-m', 'base');
  return { d, sha: gitT(d, 'rev-parse', 'HEAD') };
}
const COISAS = {
  'um caminho /home/…': P('ver ', '/home', '/alguem/x'),
  'um UUID': P('id ', '0123abcd', '-0123-4567-', '89ab-0123456789ab'),
  [P('Agent', 'Homes')]: P('pasta ', 'Agent', 'Homes'),
};
const FORA = P('lo', 'dash'); // um pacote de fora da biblioteca padrão

test('rede do diff, oráculo: um diff limpo passa; a base não tocada nunca falha, nem na main (diff vazio)', () => {
  const { d, sha } = repo();
  assert.deepEqual(rede(d, sha), [], 'diff vazio');
  escreve(d, 'scripts/a.mjs', "import { join } from 'node:path';\nimport { readFileSync } from 'fs';\nexport const a = join('x', 'y');\n");
  escreve(d, 'docs/novo.md', '# novo\n\nsó texto.\n');
  escreve(d, 'tests/critico/x/y.test.mjs', `${P('/home', '/alguem/x')} fora do pacote\n`); // tests/ não conta
  assert.deepEqual(rede(d, sha), [], 'diff limpo (um módulo nativo e um ficheiro novo)');
  gitT(d, 'add', '-A');
  gitT(d, 'commit', '-q', '-m', 'ticket');
  assert.deepEqual(rede(d, sha), [], 'diff limpo, já commitado');
  assert.deepEqual(rede(d, gitT(d, 'rev-parse', 'HEAD')), [], 'base = HEAD (a main)');
});

for (const [nome, linha] of Object.entries(COISAS)) {
  test(`rede do diff, oráculo: ${nome} acrescentado falha e nomeia o ficheiro (numa linha nova e num ficheiro novo)`, () => {
    const { d, sha } = repo();
    escreve(d, 'docs/velho.md', `# velho\n\n${P('/home', '/antigo/dados')} já estava na base.\n${linha}\n`);
    escreve(d, 'docs/novo.md', `${linha}\n`);
    const f = rede(d, sha);
    for (const rel of ['docs/velho.md', 'docs/novo.md']) assert.ok(f.some((x) => x.startsWith(rel + ':')), `não apanhou ${rel}: ${f.join(' | ') || 'nada'}`);
    assert.ok(!f.some((x) => x.includes('antigo')), 'apanhou o caminho que já estava na base: ' + f.join(' | '));
  });
}

test('rede do diff, oráculo: um import de fora da biblioteca padrão acrescentado falha e nomeia o ficheiro; um que já lá estava não', () => {
  const { d, sha } = repo();
  // (concatenados, para o varrimento da rede não ler estes textos como imports deste ficheiro)
  escreve(d, 'scripts/a.mjs', "import { join } from 'node:path';\nexport const a = join('x', 'y');\nexport const b = require('" + FORA + "');\n");
  escreve(d, 'scripts/b.mjs', "import x from '" + FORA + "';\nexport default x;\n");
  const f = rede(d, sha);
  assert.ok(f.some((x) => x.startsWith('scripts/a.mjs:') && x.includes(FORA)), f.join(' | '));
  assert.ok(f.some((x) => x.startsWith('scripts/b.mjs:') && x.includes(FORA)), f.join(' | '));
  gitT(d, 'add', '-A');
  gitT(d, 'commit', '-q', '-m', 'ticket');
  const sha2 = gitT(d, 'rev-parse', 'HEAD');
  escreve(d, 'scripts/b.mjs', "import x from '" + FORA + "';\nexport default x;\nexport const c = 1;\n");
  assert.deepEqual(rede(d, sha2), [], 'o import antigo de um ficheiro tocado não é do ticket');
});

test('rede do diff, oráculo: os repositórios do próprio projeto não contam como dado pessoal', () => {
  const { d, sha } = repo();
  escreve(d, 'docs/novo.md', P('https://github.com/', 'Re', 'natoWernik/forge', '\n'));
  assert.deepEqual(rede(d, sha), []);
});

after(() => { for (const d of lixo.splice(0)) try { rmSync(d, { recursive: true, force: true }); } catch { /* shortcut: o tmp do SO limpa o resto */ } });
