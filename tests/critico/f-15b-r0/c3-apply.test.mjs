// F-15b critério 3: --apply — um sim por componente, e as barreiras (a)–(h).
// Oráculo: a tabela de casos, cada um com a sequência EXATA de execuções no exec/run espião (o comando que o doctor imprime para
// esse id nessa máquina, e nada mais; ou a sequência vazia), o código de saída e a linha do tempo (o que aparece antes de quê).
// Depende do F-15a: o compat.json (verifiedWith e a nota 3.0.0 do ai-memory); CLAUDE_CONFIG_DIR e a skill solta do ponytail onde marcado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import {
  maquina, instala, upd, doDoctor, sequencia, semEscritas, latest, compatSint, notaComo, manifesto, diffManifesto, personalizada, skillLocal,
  dentro, TUDO_REFERENCIA, TUDO_VERIFICADO, IDS_HOSTIS, TOKENS_HOSTIS, SETA, STATUS, SYN, PONYTAIL_SKILLS, muta, prng, sha,
} from './helpers.mjs';

const ref = (o = {}) => instala(maquina(o), TUDO_REFERENCIA);
// P5: 2 = uso inválido ou alvo proibido; 3 = barreira não confirmada (--yes, --accept-unverified, --backup-confirmed, --overwrite); 1 = outro erro
const recusa = (r, msg, code) => { assert.equal(r.code, code, `${msg}: código ${r.code}, esperado ${code} (P5)`); assert.deepEqual(r.execs.map((c) => c.str), [], msg + ': executou'); semEscritas(r); };

// ---------- (a) ----------
test('(a) --apply <id> sem --yes: imprime o que faria (o comando), não executa nada e sai com 3 (barreira não confirmada, P5)', async () => {
  const m = ref();
  const cmd = await doDoctor(m, 'uv');
  const r = await upd(m, ['--apply', 'uv']);
  assert.equal(r.code, 3);
  sequencia(r.execs, [], 'sem --yes');
  semEscritas(r);
  for (const c of cmd) assert.ok(r.out.includes(c), 'não imprime o que faria: ' + c);
});

for (const [nome, argv] of [
  ['dois ids seguidos', ['--apply', 'uv', 'ponytail', '--yes']],
  ['dois --apply', ['--apply', 'uv', '--apply', 'ponytail', '--yes']],
  ['ids separados por vírgula', ['--apply', 'uv,ponytail', '--yes']],
  ['--apply sem id', ['--apply', '--yes']],
  ['--apply no fim, sem id', ['--yes', '--apply']],
]) {
  test(`(a) ${nome}: código 2, nada executado, nada escrito`, async () => {
    const m = ref();
    const antes = manifesto(m.root);
    const r = await upd(m, argv);
    assert.equal(r.code, 2);
    sequencia(r.execs, [], nome);
    semEscritas(r);
    assert.deepEqual(diffManifesto(antes, manifesto(m.root)), []);
  });
}

for (const id of IDS_HOSTIS) {
  test(`(a) id fora da lista ${JSON.stringify(id)}: código 2, nada executado, nada escrito, nada copiado`, async () => {
    const m = ref();
    instala(m, { 'gauntlet-loop': personalizada() });
    const antes = manifesto(m.root);
    const r = await upd(m, ['--apply', id, '--yes', '--overwrite', '--accept-unverified', '--backup-confirmed']);
    assert.equal(r.code, 2);
    sequencia(r.execs, [], 'id hostil');
    semEscritas(r);
    assert.deepEqual(diffManifesto(antes, manifesto(m.root)), []);
  });
}

// ---------- (b) e (h) ----------
test('(b) mostra «atual → nova» ANTES de executar; executa exatamente o comando do doctor', async () => {
  const m = ref();
  const cmd = await doDoctor(m, 'uv');
  const r = await upd(m, ['--apply', 'uv', '--yes']);
  sequencia(r.execs, cmd, 'uv');
  const iExec = r.events.findIndex((e) => e.t === 'call' && !e.call.probe);
  const iSeta = r.events.findIndex((e) => e.t === 'out' && /0\.12\.21/.test(e.text) && /0\.13\.6/.test(e.text) && SETA.test(e.text));
  assert.ok(iSeta >= 0, 'nunca mostrou «0.12.21 → 0.13.6» numa só linha de saída');
  assert.ok(iSeta < iExec, '«atual → nova» só apareceu depois de executar');
  semEscritas(r);
});

test('(h) no fim corre o --check desse id (sondas de novo, depois da execução) e mostra o resultado', async () => {
  const m = ref();
  const r = await upd(m, ['--apply', 'uv', '--yes']);
  const ultimo = r.events.map((e) => e.t === 'call' && !e.call.probe).lastIndexOf(true);
  assert.ok(ultimo >= 0, 'não executou');
  const depois = r.events.slice(ultimo + 1);
  assert.ok(depois.some((e) => e.t === 'call' && e.call.probe), 'não voltou a sondar a versão depois de executar');
  assert.ok(depois.some((e) => e.t === 'out' && new RegExp(`\\b(${STATUS.join('|')})\\b`).test(e.text)), 'não mostrou o estado depois de executar');
});

// ---------- (c) requires ----------
test('(c) spec-kit sem uv: recusa, diz que o uv vem primeiro, não executa', async () => {
  const m = instala(maquina(), { 'spec-kit': '1.0.13' });
  const r = await upd(m, ['--apply', 'spec-kit', '--yes', '--accept-unverified', '--backup-confirmed']);
  recusa(r, 'spec-kit sem uv', 1);
  assert.match(r.out, /\buv\b/, 'não diz qual tratar primeiro (uv)');
});

test('(c) spec-kit com o uv por atualizar (requires não ok): recusa; com o uv ok, executa exatamente o comando do doctor', async () => {
  const m = ref();
  recusa(await upd(m, ['--apply', 'spec-kit', '--yes']), 'uv outdated', 1);
  const m2 = instala(maquina(), { ...TUDO_REFERENCIA, uv: '0.13.6' });
  const cmd = await doDoctor(m2, 'spec-kit');
  sequencia((await upd(m2, ['--apply', 'spec-kit', '--yes'])).execs, cmd, 'spec-kit com uv ok');
});

test('(c) graphify-skill com o graphify por atualizar: recusa e nomeia o graphify', async () => {
  const m = ref();
  const r = await upd(m, ['--apply', 'graphify-skill', '--yes']);
  recusa(r, 'graphify-skill', 1);
  assert.match(r.out, /\bgraphify\b(?!-skill)/);
});

test('(c) um requires que não é componente do registo (git) não bloqueia a gauntlet-loop (PERGUNTA P8)', async () => {
  const m2 = instala(maquina({ fontes: latest({ gauntlet: 'conteudo novo da HEAD' }) }), { 'gauntlet-loop': SYN['gauntlet-loop'] });
  const cmd = await doDoctor(m2, 'gauntlet-loop');
  sequencia((await upd(m2, ['--apply', 'gauntlet-loop', '--yes'])).execs, cmd, 'gauntlet-loop pristine e outdated');
});

// ---------- (d) sameAs ----------
test('(d) ai-memory-mcp com o dono por atualizar: remete para o ai-memory e não executa nada', async () => {
  const m = ref();
  const r = await upd(m, ['--apply', 'ai-memory-mcp', '--yes', '--backup-confirmed', '--accept-unverified']);
  sequencia(r.execs, [], 'sameAs');
  semEscritas(r);
  assert.equal(r.code, 1, 'sameAs com o dono por atualizar: outro erro → código 1 (P5)');
  assert.match(r.out, /--apply ai-memory(?!-mcp)\b|\bai-memory\b(?!-mcp)/, 'não remete para o dono');
});

// ---------- (e) unverified ----------
test('(e) unverified sem --accept-unverified: recusa; com a flag executa exatamente o comando do doctor', async () => {
  const fontes = latest({ ponytail: '5.4.0' });
  const m = instala(maquina({ fontes }), { ...TUDO_VERIFICADO, ponytail: '5.3.3' });
  const r = await upd(m, ['--apply', 'ponytail', '--yes']);
  recusa(r, 'unverified', 3);
  const cmd = await doDoctor(m, 'ponytail');
  sequencia((await upd(m, ['--apply', 'ponytail', '--yes', '--accept-unverified'])).execs, cmd, 'ponytail aceite');
});

// ---------- (f) requiresBackup ----------
test('(f) ai-memory 2.5.0 → 3.2.10 atravessa a 3.0.0: sem --backup-confirmed recusa com os passos do upstream; com a flag executa', async () => {
  const m = ref();
  const r = await upd(m, ['--apply', 'ai-memory', '--yes', '--accept-unverified']);
  recusa(r, 'ai-memory 2→3', 3);
  assert.match(r.out, /upgrading-to-3\.0\.md/, 'a recusa não mostra os passos do upstream');
  const cmd = await doDoctor(m, 'ai-memory');
  sequencia((await upd(m, ['--apply', 'ai-memory', '--yes', '--backup-confirmed'])).execs, cmd, 'ai-memory com backup confirmado');
});

test('(f) fronteiras: 2.5.0 → 3.0.0 atravessa (inclusive); 3.0.0 → 3.2.10 não atravessa e não pede a flag', async () => {
  const m1 = instala(maquina({ fontes: latest({ aim: '3.0.0' }) }), { ...TUDO_REFERENCIA, uv: '0.13.6' });
  recusa(await upd(m1, ['--apply', 'ai-memory', '--yes']), '2.5.0 → 3.0.0', 3);
  const m2 = instala(maquina(), { ...TUDO_REFERENCIA, 'ai-memory': '3.0.0' });
  const cmd = await doDoctor(m2, 'ai-memory');
  sequencia((await upd(m2, ['--apply', 'ai-memory', '--yes'])).execs, cmd, '3.0.0 → 3.2.10');
});

test('(f) a classe, não o caso: uma nota requiresBackup noutra componente (graphify 0.9.80) também barra a subida que a atravessa', async () => {
  const compat = compatSint();
  compat.components.graphify.notes = { ...(compat.components.graphify.notes ?? {}), '0.9.80': notaComo(compat, 'PASSOS-DO-UPSTREAM-critico: backup antes', true) };
  const m = instala(maquina({ compat }), { ...TUDO_REFERENCIA, uv: '0.13.6' });
  const r = await upd(m, ['--apply', 'graphify', '--yes']);
  recusa(r, 'graphify 0.9.73 → 0.9.97 com nota requiresBackup', 3);
  assert.match(r.out, /PASSOS-DO-UPSTREAM-critico/);
  const cmd = await doDoctor(m, 'graphify');
  sequencia((await upd(m, ['--apply', 'graphify', '--yes', '--backup-confirmed'])).execs, cmd, 'graphify com backup confirmado');
});

test('(e)+(f) unverified E requiresBackup: só uma das flags recusa; as duas executam', async () => {
  const fontes = latest({ aim: '3.3.0' });
  const m = instala(maquina({ fontes }), TUDO_REFERENCIA);
  recusa(await upd(m, ['--apply', 'ai-memory', '--yes', '--accept-unverified']), 'só --accept-unverified', 3);
  recusa(await upd(m, ['--apply', 'ai-memory', '--yes', '--backup-confirmed']), 'só --backup-confirmed', 3);
  const cmd = await doDoctor(m, 'ai-memory');
  sequencia((await upd(m, ['--apply', 'ai-memory', '--yes', '--accept-unverified', '--backup-confirmed'])).execs, cmd, 'as duas flags');
});

// ---------- (g) customized ----------
const carimbo = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(9, 11), +s.slice(11, 13), +s.slice(13, 15));
// a sdd personalizada parte de uma 2.0.0, para o doctor ter um comando de update (a 2.1.0 é a mais recente)
const custom = (id) => (id === 'sdd' ? personalizada(SYN.sdd).replace('version: 2.1.0', 'version: 2.0.0') : personalizada());
const backupsEm = (m) => (existsSync(join(m.configDir, 'forge-backups')) ? manifesto(join(m.configDir, 'forge-backups')) : {});

for (const id of ['gauntlet-loop', 'sdd']) {
  test(`(g) ${id} customized sem --overwrite: recusa, não executa, não copia nem escreve`, async () => {
    const m = instala(maquina(), { ...TUDO_REFERENCIA, uv: '0.13.6', [id]: custom(id) });
    const antes = manifesto(m.root);
    recusa(await upd(m, ['--apply', id, '--yes', '--accept-unverified', '--backup-confirmed']), id + ' sem --overwrite', 3);
    assert.deepEqual(diffManifesto(antes, manifesto(m.root)), []);
  });

  test(`(g) ${id} customized com --overwrite: backup em <c>/forge-backups/${id}-<AAAAMMDDTHHMMSSZ>/ (UTC) com o conteúdo original, ANTES de executar o comando do doctor`, async () => {
    const original = custom(id);
    const m = instala(maquina(), { ...TUDO_REFERENCIA, uv: '0.13.6', [id]: original });
    const cmd = await doDoctor(m, id);
    const antes = manifesto(m.root);
    const t0 = Date.now();
    const r = await upd(m, ['--apply', id, '--yes', '--overwrite']);
    sequencia(r.execs, cmd, id + ' com --overwrite');
    const b = backupsEm(m);
    const ks = Object.keys(b);
    assert.ok(ks.length > 0, 'nenhum backup em <c>/forge-backups');
    const pastas = [...new Set(ks.map((k) => k.split('/')[0]))];
    assert.equal(pastas.length, 1, 'mais de uma pasta de backup: ' + pastas.join(', '));
    const mt = new RegExp(`^${id}-(\\d{8}T\\d{6}Z)$`).exec(pastas[0]);
    assert.ok(mt, 'nome da pasta de backup fora do formato <id>-AAAAMMDDTHHMMSSZ: ' + pastas[0]);
    assert.ok(Math.abs(carimbo(mt[1]) - t0) < 5 * 60e3, `o carimbo ${mt[1]} não é a hora UTC atual (hora local?)`);
    assert.equal(b[`${pastas[0]}/SKILL.md`], sha(readFileSync(join(m.configDir, 'skills', id, 'SKILL.md'))), 'o backup não tem o SKILL.md original');
    assert.equal(b[`${pastas[0]}/SKILL.md`], sha(original));
    for (const c of r.execs) assert.ok(c.backupNoDisco[`${pastas[0]}/SKILL.md`] === sha(original), 'executou antes de o backup estar completo no disco: ' + c.str);
    const dif = diffManifesto(antes, manifesto(m.root));
    assert.deepEqual(dif.filter((l) => !l.startsWith('+ home/.claude/forge-backups/' + pastas[0] + '/')), [], 'mudou algo além da pasta de backup');
  });
}

test('(g) [F-15a: CLAUDE_CONFIG_DIR] com <c> próprio (espaços, aspas, ; e $()): o backup vai para <c>/forge-backups, nunca para <home>/.claude, nunca dentro de <c>/skills', async () => {
  const m = instala(maquina({ cfg: "cfg dir;x $(id) 'q'" }), { ...TUDO_REFERENCIA, uv: '0.13.6', 'gauntlet-loop': personalizada() });
  const cmd = await doDoctor(m, 'gauntlet-loop');
  const antesHome = manifesto(m.home);
  const r = await upd(m, ['--apply', 'gauntlet-loop', '--yes', '--overwrite']);
  sequencia(r.execs, cmd, 'gauntlet-loop em <c>');
  assert.deepEqual(diffManifesto(antesHome, manifesto(m.home)), [], 'escreveu em <home> com CLAUDE_CONFIG_DIR definido');
  const destinos = r.events.filter((e) => e.t === 'copy' || e.t === 'write').map((e) => e.dest ?? e.p);
  assert.ok(destinos.length > 0 || Object.keys(backupsEm(m)).length > 0, 'não fez backup');
  for (const d of destinos) {
    assert.ok(dentro(d, join(m.configDir, 'forge-backups')), 'escrita fora de <c>/forge-backups: ' + d);
    assert.ok(!dentro(d, join(m.configDir, 'skills')), 'backup dentro de <c>/skills: ' + d);
  }
  assert.ok(Object.keys(backupsEm(m)).some((k) => /^gauntlet-loop-\d{8}T\d{6}Z\/SKILL\.md$/.test(k)), 'o backup não ficou em <c>/forge-backups/gauntlet-loop-<carimbo>/');
});

test('(g) um backup que cairia dentro de skills/: com CLAUDE_CONFIG_DIR a acabar em separador, o backup continua fora de <c>/skills', async () => {
  const m = maquina({ cfg: 'cfg' });
  m.sys.env.CLAUDE_CONFIG_DIR = m.configDir + '\\';
  instala(m, { ...TUDO_REFERENCIA, uv: '0.13.6', 'gauntlet-loop': personalizada() });
  await upd(m, ['--apply', 'gauntlet-loop', '--yes', '--overwrite']);
  const b = Object.keys(backupsEm(m));
  assert.ok(b.length > 0, 'não fez backup');
  assert.deepEqual(Object.keys(manifesto(join(m.configDir, 'skills'))).filter((k) => /forge-backups|\d{8}T\d{6}Z/.test(k)), [], 'backup dentro de skills/');
});

test('(g) se o backup falha, nada é executado (o comando que sobrescreve nunca corre sem backup)', async () => {
  const m = instala(maquina({ falhaCopia: true }), { ...TUDO_REFERENCIA, uv: '0.13.6', 'gauntlet-loop': personalizada() });
  const r = await upd(m, ['--apply', 'gauntlet-loop', '--yes', '--overwrite']).catch((e) => { if (e instanceof assert.AssertionError) throw e; return { code: 'lançou: ' + e.message, execs: m.calls.filter((c) => !c.probe), events: [] }; });
  sequencia(r.execs, [], 'backup falhado');
  assert.equal(r.code, 1, 'backup falhado: outro erro → código 1 (P5)');
});

test('(g) [F-15a: skill solta] ponytail solto com uma skill personalizada: sem --overwrite recusa; com --overwrite a pasta personalizada vai para forge-backups/ponytail-<carimbo> antes de executar', async () => {
  const m = maquina({ fontes: latest({ ponytail: '5.3.3', pony: 'HEAD nova do ponytail' }) });
  const solto = Object.fromEntries(PONYTAIL_SKILLS.map((n) => [n, SYN.ponytail]));
  solto['ponytail-review'] = muta(SYN.ponytail, prng(7)) + '\n- regra local do utilizador';
  instala(m, { ponytailSolto: solto });
  recusa(await upd(m, ['--apply', 'ponytail', '--yes', '--accept-unverified']), 'ponytail solto sem --overwrite', 3);
  const cmd = await doDoctor(m, 'ponytail');
  const r = await upd(m, ['--apply', 'ponytail', '--yes', '--overwrite', '--accept-unverified']);
  sequencia(r.execs, cmd, 'ponytail solto com --overwrite');
  const b = backupsEm(m);
  const alvo = Object.keys(b).find((k) => /^ponytail-\d{8}T\d{6}Z\/(.*\/)?SKILL\.md$/.test(k) && b[k] === sha(solto['ponytail-review']));
  assert.ok(alvo, 'a skill personalizada ponytail-review não está no backup forge-backups/ponytail-<carimbo>/:\n' + Object.keys(b).join('\n'));
  for (const c of r.execs) assert.equal(c.backupNoDisco[alvo], b[alvo], 'executou antes do backup: ' + c.str);
});

// ---------- valores hostis em versões ----------
test('valores hostis: uma versão mais recente e uma instalada com ;, $(), crase ou aspas nunca chegam a uma execução', async () => {
  const fontes = latest({ ponytail: "5.4.0;rm -rf / $(id) `id` '; id && id | id" });
  const m = instala(maquina({ fontes }), { ...TUDO_VERIFICADO, ponytail: "5.3.2'; id && id | id $(id) `id`" });
  for (const argv of [['--check'], ['--apply', 'ponytail', '--yes', '--accept-unverified', '--backup-confirmed']]) {
    const r = await upd(m, argv);
    for (const c of r.calls) for (const t of TOKENS_HOSTIS) assert.ok(!c.str.includes(t), `«${t}» chegou a um comando: ${c.str}`);
  }
});

// ---------- um sim por componente, sempre ----------
test('D2: nenhuma chamada executa mais de um id; --apply de um id nunca executa o comando de outro', async () => {
  const m = ref();
  const outros = (await Promise.all(['ponytail', 'graphify', 'spec-kit', 'mattpocock-skills'].map((id) => doDoctor(m, id)))).flat();
  const r = await upd(m, ['--apply', 'uv', '--yes', '--accept-unverified', '--backup-confirmed']);
  for (const c of r.execs) for (const o of outros) assert.ok(!(c.str === o || c.args.includes(o)), 'executou o comando de outro id: ' + o);
});
