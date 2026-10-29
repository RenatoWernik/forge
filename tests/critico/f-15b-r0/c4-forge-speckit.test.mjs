// F-15b critério 4: o plugin forge, o projeto Spec-Kit e a preservação byte a byte.
// Oráculo: a sequência exata no exec/run espião (forge: as 2 linhas do contrato e nada mais; speckit-project: 1 execução com
// cwd=<dir>, nunca com --force, nunca com o caminho dentro do comando); o manifesto sha256 de cada projeto gerado pelo corpus do
// F-02 mais uma config de fixture, antes e depois de --check e de cada --apply (exec falso): diferença permitida, nenhuma, salvo a
// pasta de backup quando há --overwrite.
// Depende do F-15a: o compat.json; CLAUDE_CONFIG_DIR (a config da fixture fica numa pasta própria).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  ROOT, maquina, instala, upd, sequencia, semEscritas, latest, manifesto, diffManifesto, personalizada, poe, readJson,
  TUDO_REFERENCIA, TUDO_VERIFICADO, IDS, FORGE_ULTIMA,
} from './helpers.mjs';

const FORGE = ['claude plugin marketplace update forge', 'claude plugin update forge@forge'];
const SPECIFY = 'specify integration upgrade claude';
const N = (p) => resolve(String(p)).toLowerCase();

test('C4 --apply forge --yes: executa «claude plugin marketplace update forge» e depois «claude plugin update forge@forge», e nada mais', async () => {
  const m = instala(maquina(), { ...TUDO_REFERENCIA, forge: '0.1.0' });
  const antes = manifesto(m.root);
  const r = await upd(m, ['--apply', 'forge', '--yes']);
  sequencia(r.execs, FORGE, 'forge');
  semEscritas(r);
  assert.deepEqual(diffManifesto(antes, manifesto(m.root)), []);
});

test('C4 --apply forge sem --yes: código 2, nada executado', async () => {
  const m = instala(maquina(), { forge: '0.1.0' });
  const r = await upd(m, ['--apply', 'forge']);
  assert.equal(r.code, 2);
  sequencia(r.execs, [], 'forge sem --yes');
});

// Um projeto com .specify/ num caminho hostil (espaços, ; aspas e $()), com o spec-kit em ok
const projeto = (m, nome = "meu proj;echo x $(id) 'q'") => {
  const dir = join(m.root, nome);
  poe(m, join('.specify', 'memory', 'constitution.md'), '# Constituição do projeto\n\n1. Testes primeiro.\n2. Nada de segredos no repo.\n', dir);
  return dir;
};
const comSpecKit = (o = {}) => instala(maquina(o), { ...TUDO_VERIFICADO, ...o.estado });

test('C4 --apply speckit-project --project <dir hostil> --yes: uma execução de «specify integration upgrade claude», com cwd=<dir>, sem --force e sem o caminho no comando', async () => {
  const m = comSpecKit();
  const dir = projeto(m);
  const antes = manifesto(m.root);
  const r = await upd(m, ['--apply', 'speckit-project', '--project', dir, '--yes']);
  sequencia(r.execs, [SPECIFY], 'speckit-project');
  const c = r.execs[0];
  assert.equal(N(c.opts?.cwd ?? ''), N(dir), 'o cwd não é o --project');
  assert.ok(!c.str.includes('--force') && !c.args.some((a) => a.includes('--force')), 'passou --force ao Spec-Kit');
  for (const a of [c.cmd, ...c.args]) for (const frag of ['meu proj', ';echo x', '$(id)', "'q'"]) assert.ok(!a.includes(frag), `o caminho do projeto foi interpolado no comando: ${a}`);
  semEscritas(r);
  assert.deepEqual(diffManifesto(antes, manifesto(m.root)), []);
});

test('C4 speckit-project: sem <dir>/.specify/ recusa e não executa', async () => {
  const m = comSpecKit();
  const dir = join(m.root, 'sem specify');
  mkdirSync(dir);
  const r = await upd(m, ['--apply', 'speckit-project', '--project', dir, '--yes']);
  assert.notEqual(r.code, 0);
  sequencia(r.execs, [], 'sem .specify');
});

for (const [nome, estado] of [['spec-kit outdated', { 'spec-kit': '1.0.13' }], ['spec-kit missing', { 'spec-kit': undefined, graphify: undefined }]]) {
  test(`C4 speckit-project com ${nome}: recusa (exige spec-kit em ok) e não executa`, async () => {
    const m = comSpecKit({ estado });
    const dir = projeto(m);
    const r = await upd(m, ['--apply', 'speckit-project', '--project', dir, '--yes', '--accept-unverified', '--backup-confirmed']);
    assert.notEqual(r.code, 0);
    sequencia(r.execs, [], nome);
  });
}

test('C4 speckit-project: quando o upstream recusa por edições locais, reporta a recusa, não insiste e nunca acrescenta --force', async () => {
  const msg = 'critico-upstream: refusing to upgrade, managed file .claude/skills/speckit-plan/SKILL.md was modified locally';
  const m = comSpecKit({ falhas: { [SPECIFY]: msg } });
  const dir = projeto(m);
  const r = await upd(m, ['--apply', 'speckit-project', '--project', dir, '--yes']);
  sequencia(r.execs, [SPECIFY], 'speckit-project recusado pelo upstream');
  assert.notEqual(r.code, 0, 'a recusa do upstream saiu com o código 0');
  assert.match(r.out, /speckit-plan|refusing to upgrade|modified locally/, 'não reporta a recusa do upstream');
  semEscritas(r);
});

test('C4 speckit-project nunca é atualizado por um --apply de outro id, nem fora de um --project', async () => {
  const m = comSpecKit();
  projeto(m);
  for (const argv of [['--apply', 'spec-kit', '--yes'], ['--apply', 'speckit-project', '--yes'], ['--check']]) {
    const r = await upd(m, argv);
    assert.ok(!r.execs.some((c) => c.str.includes(SPECIFY) || c.args.includes(SPECIFY)), `${argv.join(' ')} correu o ${SPECIFY}`);
  }
});

// ---------- manifesto sobre o corpus do F-02 e a config de fixture ----------
const ANSWERS = join(ROOT, 'scripts', 'corpus', 'answers');
const nomes = readdirSync(ANSWERS).filter((n) => n.endsWith('.json')).sort();

test('C4 o corpus do F-02 existe (sanidade do próprio ataque)', () => assert.ok(nomes.length >= 8, 'respostas: ' + nomes.length));

for (const nome of nomes) {
  test(`C4 manifesto (${nome}): --check e cada --apply (exec falso) não mudam nenhum byte do projeto gerado nem da config; só o backup do --overwrite aparece`, async () => {
    const { scaffold } = await import(pathToFileURL(join(ROOT, 'scripts', 'scaffold.mjs')).href);
    const m = maquina({ cfg: 'cfg dir' });
    instala(m, { ...TUDO_REFERENCIA, uv: '0.13.6', 'spec-kit': '1.2.5', 'gauntlet-loop': personalizada(), forge: '0.1.0' });
    const proj = join(m.root, 'projeto gerado');
    await scaffold(readJson(join(ANSWERS, nome)), { dest: proj });
    // o que as componentes e o uso acrescentam ao projeto
    poe(m, join('.specify', 'memory', 'constitution.md'), '# Constituição\n\n1. TDD.\n2. Sem segredos.\n', proj);
    poe(m, join('.claude', 'settings.json'), JSON.stringify({ hooks: { PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'graphify hook post-write' }] }] } }, null, 2), proj);
    const painel = join(proj, '.checkpoints', 'painel.json');
    let pj = {};
    try { pj = JSON.parse(readFileSync(painel, 'utf8')); } catch { /* sem painel: cria-se */ }
    poe(m, join('.checkpoints', 'painel.json'), JSON.stringify({ ...pj, tickets: [{ id: 'T-1', titulo: 'login', fase: 'R1' }], agentes: [{ nome: 'dev-t1', papel: 'developer', estado: 'a trabalhar' }] }, null, 2), proj);
    poe(m, join('briefs', 'dev-t1.md'), '# Brief do dev T-1\n', proj);
    const antes = manifesto(m.root);
    const corridas = [['--check'], ['--check', '--project', proj]];
    for (const id of [...IDS, 'forge']) corridas.push(['--apply', id, '--yes', '--accept-unverified', '--backup-confirmed', '--project', proj]);
    corridas.push(['--apply', 'speckit-project', '--project', proj, '--yes']);
    corridas.push(['--apply', 'gauntlet-loop', '--yes', '--overwrite']);
    for (const argv of corridas) await upd(m, argv);
    const dif = diffManifesto(antes, manifesto(m.root));
    const fora = dif.filter((l) => !/^\+ cfg dir\/forge-backups\/gauntlet-loop-\d{8}T\d{6}Z\//.test(l));
    assert.deepEqual(fora, [], 'ficheiros mudados fora da pasta de backup');
    assert.ok(dif.length > 0, 'o --overwrite não fez backup');
  });
}
