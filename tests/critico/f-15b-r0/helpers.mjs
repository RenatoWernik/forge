// Ronda −1 do F-15b (#39): utilitários partilhados pelos ataques. Só biblioteca padrão.
//
// SEAM (PERGUNTA P1 na #39): os ataques chamam `main(argv, sys, write)` exportado por scripts/update.mjs, com a assinatura do
// doctor (devolve o código de saída; escreve pelo `write`), e leem os estados com `--check --json`, que imprime
// `{ components: [{ id, status, installedVersion, latestVersion, verifiedWith, ... }] }` (inclui o alvo `forge`). O update lê o
// components.json e o compat.json pelo `sys.readFile`, como o doctor lê o registo; assim cada ataque pode servir um compat.json
// sintético no caminho real. Se o orquestrador fixar outra forma, só este ficheiro muda.
//
// O `sys` falso (seam do contrato: exec, run com cwd, readFile, writeFile, copyDir, fetchText, env, home) assenta numa «máquina»
// real numa pasta temporária: home, configDir, projeto. readFile lê o disco (só leitura); writeFile e copyDir só escrevem dentro da
// máquina (fora disso, nada é escrito e fica uma violação); exec e run são espiões: as sondas de versão do registo respondem com o
// que a máquina tem (ou ENOENT), e qualquer outra chamada é uma EXECUÇÃO, registada e fingida (nunca corre nada de verdade).
// Cada chamada, escrita, cópia e linha de saída entra numa linha do tempo única (`events`), para provar a ordem.
//
// NUNCA toca na máquina: HOME, USERPROFILE, CLAUDE_CONFIG_DIR e AI_MEMORY_BIN do process.env apontam para uma ISCA temporária logo
// no import (um update que leia o process.env em vez do sys.env é apanhado); o fetch global e o https lançam e contam (rede = reprova
// sempre); TZ fica num fuso ≠ UTC para apanhar carimbos de backup em hora local. As pastas temporárias apagam-se no fim.
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync, rmSync, cpSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import https from 'node:https';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const UPDATE = join(ROOT, 'scripts', 'update.mjs');
export const DOCTOR = join(ROOT, 'scripts', 'doctor.mjs');
export const COMPAT = join(ROOT, 'compat.json');
export const REGISTRY = join(ROOT, 'components.json');
export const FIXTURE = join(ROOT, 'scripts', 'fixtures', 'versions-2026-10-29.json');
export const SKILL = join(ROOT, 'skills', 'update', 'SKILL.md');
export const ESPIAO = pathToFileURL(fileURLToPath(new URL('./espiao.mjs', import.meta.url))).href;

process.env.TZ = 'Asia/Kolkata'; // UTC+05:30: um carimbo em hora local fica 5h30 ao lado

const temps = [];
export const tmp = (prefix = 'critico-f15b-') => { const d = mkdtempSync(join(tmpdir(), prefix)); temps.push(d); return d; };
after(() => { for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });

export const ISCA = mkdtempSync(join(tmpdir(), 'critico-f15b-isca-'));
for (const k of ['HOME', 'USERPROFILE', 'CLAUDE_CONFIG_DIR']) process.env[k] = ISCA;
process.env.AI_MEMORY_BIN = join(ISCA, 'ai-memory.exe');
after(() => rmSync(ISCA, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));

// Rede: reprova sempre. O fetch global e o http(s) lançam e contam.
export const rede = [];
globalThis.fetch = async (u) => { rede.push(String(u?.url ?? u)); throw new Error('critico: fetch global chamado (rede): ' + String(u?.url ?? u)); };
for (const mod of [http, https]) for (const n of ['request', 'get']) mod[n] = (u) => { rede.push(String(u?.href ?? u?.host ?? u)); throw new Error('critico: rede (' + n + ')'); };

// Sem NODE_TEST_CONTEXT: herdado, um `node --test` filho fala o protocolo interno do runner e sai com 0 mesmo a falhar
export const sandboxEnv = (extra = {}) => {
  const env = { ...process.env, HOME: ISCA, USERPROFILE: ISCA, CLAUDE_CONFIG_DIR: ISCA, DISABLE_AUTOUPDATER: '1', ...extra };
  delete env.NODE_TEST_CONTEXT;
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete env[k];
  return env;
};

export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));
export const registry = () => readJson(REGISTRY);
export const compatReal = () => {
  assert.ok(existsSync(COMPAT), 'falta compat.json na raiz do pacote (F-15a cria-o; o F-15b acrescenta o pristine e o requiresBackup)');
  return readJson(COMPAT);
};
export const sha = (t) => createHash('sha256').update(t).digest('hex');
export const lf = (t) => t.replaceAll('\r\n', '\n');
export const crlf = (t) => lf(t).replaceAll('\n', '\r\n');
const NORM = (p) => resolve(String(p)).toLowerCase();
export const dentro = (p, dir) => NORM(p) === NORM(dir) || NORM(p).startsWith(NORM(dir).replace(/[\\/]+$/, '') + sep);
export const posix = (p) => p.split(sep).join('/');

export const IDS = ['uv', 'gauntlet-loop', 'ai-memory', 'ai-memory-mcp', 'ponytail', 'spec-kit', 'sdd', 'mattpocock-skills', 'graphify', 'graphify-skill'];
export const ALVOS = [...IDS, 'forge']; // o --check inclui o alvo forge; o speckit-project só existe no --apply
export const VERIFIED = {
  uv: '0.13.6', 'gauntlet-loop': 'fc6b2fc', 'ai-memory': '3.2.10', 'ai-memory-mcp': '3.2.10', ponytail: '5.3.3',
  'spec-kit': '1.2.5', sdd: '2.1.0', 'mattpocock-skills': '1.3.2', graphify: '0.9.97', 'graphify-skill': '0.9.97',
};
export const REFERENCIA = { uv: '0.12.21', 'ai-memory': '2.5.0', ponytail: '4.10.0', 'spec-kit': '1.0.13', sdd: '2.1.0', 'mattpocock-skills': '1.2.3', graphify: '0.9.73' };
export const STATUS = ['ok', 'outdated', 'unverified', 'customized', 'missing', 'unknown'];
export const PONYTAIL_SKILLS = ['ponytail', 'ponytail-audit', 'ponytail-debt', 'ponytail-gain', 'ponytail-help', 'ponytail-review'];

// sha256 do upstream nas versões verificadas, calculados pelo crítico a 2026-10-29 com o ghp (contents API, uma vez; os testes
// não vão à rede). [LF, LF sem espaços nas pontas]: o contrato diz «normalizado para LF»; aceita-se também a variante aparada.
export const UPSTREAM = {
  // emenda de 2026-10-29 (#38): o gauntlet-loop vem do fork RenatoWernik/gauntlet-loop em fc6b2fc (190 linhas)
  'gauntlet-loop': { ref: 'fc6b2fc', files: { 'gauntlet-loop': ['cf03e23b661e543cf2df113e2c2bc140c2a1d710cd716265b21643b0e657ce25', '7ee54fa150c6eb1af07e7069e7fafcaceb00b71ca346cd4f2a5a988918e496b9'] } },
  sdd: { ref: 'eba9606', files: { sdd: ['f5bfd88cb0e494345427e5c4a3eb6883b46bc6d85f32f991657db895afa3080f', '907acd1f19f9d697fc2f9a813ed0fed1656d336a302cafbd77bd86ec2f18f0c1'] } },
  ponytail: {
    ref: '5.3.3',
    files: {
      ponytail: ['9badd22a32e19cb884e46dfa8d3aae82bb81dfa5484105b8b4f0262df823a509', '54ba3851a4ea7100c371a3550ddef1a311b7c2c3bdb8c513db2a5e9fa64ecd70'],
      'ponytail-review': ['33fe4ebe22a460924e5d4a261e223df22e409cc94ab76182bee9fb91a3ef022e', '125036d590f6de8f416b06209124778b8b5c0f0d5c6312d8bf6985e01b89d862'],
      'ponytail-audit': ['2b3223a02c386d1263e1b08343cb8eb3a53e444cdafb1d79e26c8ec2a8fcad28', '10eaedd92a34194d0dc0a7d81e0368bcc9e713315db7c9e1db185f72d9f25473'],
      'ponytail-debt': ['b5ec2762f6ba8c4af9ea7173aa6c9f91b88655a25e43f9de0264f6ce8722b25f', '688de7b5be11e7a8a7ec894dcb2232e92442dd129ba1a83f918ab428ff5e3978'],
      'ponytail-gain': ['231034a896d6762e4b5c8468287083422c56b499119976ec9f76821f7d083090', '5f5cfdfba67502441f131c5420a654058b7139c15d3d25bf16276553b8f5f295'],
      'ponytail-help': ['86ab0ce0af70cbeeeef499d5c884873b393f87f86401dcc45553662ce2c1eff9', 'f68337ee993f626eec941d474ebf9f22c63191b650ebb39022b73b076ce3e7f6'],
    },
  },
};

// Versões publicadas ANTERIORES (o pristine tem «cada versão publicada»): o ponytail v4.10.0, a referência de 2026-09-30, e a
// sdd 2.0.0 (último commit com essa versão no frontmatter, 0ec5955) e o gauntlet-loop do original robonuggets@9b1975a, que o forge
// instalou até à emenda do fork. Mesmo cálculo e mesma data. PERGUNTAS P9 (sdd) e P10 (gauntlet original).
export const ANTIGAS = {
  'gauntlet-loop': { ref: '9b1975a', files: { 'gauntlet-loop': ['6a345a43bf58966c83d50b6caf8be34a3fee725fb3c75778ed33fa206352b835', 'e3653566c6c1fa3125c0a3c48586367dc76ab62c18b5cf5e9d449d067fde8638'] } },
  ponytail: {
    ref: '4.10.0',
    files: {
      ponytail: ['1316a2f3f95741d2300b116fe0c2d81ce4a9568656ed0a62643f54aaf09957f2', '4d004a7499245e5a1131b6a5489cf504952d60090776df86ef6fa135f1443a65'],
      'ponytail-review': ['40df33b58fc6ef889b93585733feb9566b76e9586efa7f376785c1e995197ac0', 'c94db41b601856b79a9b391f0e33de3cbbcf2426515e51bf5b69ab5f3069a504'],
      'ponytail-audit': ['5560b8e383dbe2ddfddc873a1e2bf2e586e23e0cd7d995537482b2315331f6d1', 'b06b385a9bf8437de41c898974938ca670d0708c3e943d414a593c9763371bfc'],
      'ponytail-debt': ['c84fba75f0ca12bfe83f9a78ea02fd125c5dd3f1fbb18124105a489937f284e6', '5d037963e9305b740187d2d411c9d3ae09315536cd2629f6e921f32afbbcf274'],
      'ponytail-gain': ['24e01d1c9715cb136ba1c4f1e52a95940c0193558b876828e537736480d6408b', '27de97458122f640d290dfc72a111a803530d85fdfc8c7542d1b23f55579ef1e'],
      'ponytail-help': ['2264d1615117b02b0fd5a69ec84cd2757006471a78e4d6c22eed6d581c1d37a4', '5b0ba3957c1c43dd1e6bf0fdcbac0cdf35b80f48edc63fbe412ff45d3471202f'],
    },
  },
  sdd: { ref: '0ec5955', files: { sdd: ['c0b80ab603d529d6789c5420f033014256580e24f262f1ca676c6f122fcce215', '9718c918657007c19ed0588365051acbc9b162f38648a79ec693c5b92d595f4c'] } },
};

// ---------- conteúdos sintéticos (nunca texto do upstream) ----------
// Sem espaço nem fim de linha nas pontas: assim sha(LF) e sha(LF aparado) coincidem e nenhuma convenção de normalização decide.
export const sintetico = (id, v = 0, n = 133) => {
  const head = id === 'sdd' ? ['---', 'name: sdd', `version: 2.1.${v}`, `description: fixture ${v} do critico`, '---'] : ['---', `name: ${id}`, `description: fixture ${v} do critico`, '---'];
  const corpo = Array.from({ length: n - head.length - 1 }, (_, i) => `${id} v${v} linha ${i + 1}: texto sintetico do critico.`);
  return [...head, `# ${id} v${v}`, ...corpo].join('\n');
};
export const SYN = { 'gauntlet-loop': sintetico('gauntlet-loop'), sdd: sintetico('sdd'), ponytail: sintetico('ponytail') };
// A cópia personalizada anonimizada: 189 linhas contra as 133 da HEAD (56 linhas acrescentadas a meio, como modelos por papel)
export const personalizada = (base = SYN['gauntlet-loop']) => {
  const l = base.split('\n');
  const extra = Array.from({ length: 56 }, (_, i) => `- papel ${i + 1}: modelo e esforco escolhidos pelo utilizador (personalizacao local).`);
  return [...l.slice(0, 60), ...extra, ...l.slice(60)].join('\n');
};

// ---------- pristine: troca os sha256 do compat real pelos de conteúdos sintéticos ----------
// Formato-agnóstico (PERGUNTA P3): qualquer texto de 64 hex dentro de components.<id>.pristine (valor ou chave) é um sha.
const HEX64 = /\b[0-9a-f]{64}\b/gi;
const trocaHex = (v, f) => (typeof v === 'string' ? v.replace(HEX64, (h) => f(h.toLowerCase()))
  : Array.isArray(v) ? v.map((x) => trocaHex(x, f))
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k.replace(HEX64, (h) => f(h.toLowerCase())), trocaHex(x, f)])) : v);
export const shasDe = (node) => [...new Set(JSON.stringify(node ?? null).match(HEX64)?.map((h) => h.toLowerCase()) ?? [])];
// conteudos: id → texto (todos os sha passam a ser o desse texto) ou lista (o i-ésimo sha distinto passa a ser o do i-ésimo texto)
export function comPristine(compat, conteudos) {
  const c = structuredClone(compat);
  for (const [id, lista] of Object.entries(conteudos)) {
    const e = c.components?.[id];
    assert.ok(e && e.pristine !== undefined, `falta components.${id}.pristine no compat.json (F-15b)`);
    assert.ok(shasDe(e.pristine).length > 0, `components.${id}.pristine não tem nenhum sha256`);
    const arr = [].concat(lista);
    const mapa = new Map();
    e.pristine = trocaHex(e.pristine, (h) => { if (!mapa.has(h)) mapa.set(h, sha(lf(arr[Math.min(mapa.size, arr.length - 1)]))); return mapa.get(h); });
  }
  return c;
}
export const compatSint = (extra = {}) => comPristine(compatReal(), { 'gauntlet-loop': SYN['gauntlet-loop'], sdd: SYN.sdd, ponytail: SYN.ponytail, ...extra });

// Uma nota nova com a forma da nota 3.0.0 do ai-memory (PERGUNTA P3): os textos trocados, requiresBackup como pedido
export function notaComo(compat, texto, requiresBackup = false) {
  const notes = compat.components?.['ai-memory']?.notes ?? {};
  const k = Object.keys(notes).find((x) => x.replace(/^v/i, '') === '3.0.0');
  assert.ok(k, 'falta a nota 3.0.0 do ai-memory no compat.json (F-15a)');
  const tpl = notes[k];
  assert.ok(tpl && typeof tpl === 'object' && !Array.isArray(tpl), 'a nota 3.0.0 do ai-memory tem de ser um objeto com requiresBackup (PERGUNTA P3)');
  const troca = (v) => (typeof v === 'string' ? texto : Array.isArray(v) ? v.map(troca) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([a, b]) => [a, troca(b)])) : v);
  const n = troca(tpl);
  n.requiresBackup = requiresBackup;
  return n;
}
export const marcaBackup = (nota) => nota && typeof nota === 'object' && nota.requiresBackup === true;

// ---------- fontes de versão (sem rede) ----------
export const HEADSHA = 'fc6b2fc604ff37fdf4da67ed76980e6af1722629'; // HEAD do fork
export const UPSTREAM_SHA = '9b1975a1b8f01981f3f1e6b667ad3aaf907178ea'; // HEAD do original robonuggets em que o fork assenta
export const NOVO_UPSTREAM = 'abcdef0123456789abcdef0123456789abcdef01';
export const REL = (repo, tag) => [`https://api.github.com/repos/${repo}/releases/latest`, JSON.stringify({ tag_name: tag })];
export const PYPI = (pkg, v) => [`https://pypi.org/pypi/${pkg}/json`, JSON.stringify({ info: { version: v } })];
export const RAW = (repo, ref, path) => `https://raw.githubusercontent.com/${repo}/${ref}/${path}`;
export const URL_PONYTAIL = REL('DietrichGebert/ponytail', 'x')[0];
export const FORGE_ULTIMA = '0.2.0';
// v: versão → tag/versão de cada fonte. Por omissão, tudo no verifiedWith.
export function latest({ uv = '0.13.6', aim = '3.2.10', ponytail = '5.3.3', mattpocock = '1.3.2', specify = '1.2.5', graphify = '0.9.97', sdd = SYN.sdd, gauntlet = SYN['gauntlet-loop'], pony = SYN.ponytail, forge = FORGE_ULTIMA, upstream = UPSTREAM_SHA, sem = [] } = {}) {
  const urls = {
    ...Object.fromEntries([
      REL('astral-sh/uv', 'v' + uv), REL('akitaonrails/ai-memory', 'v' + aim), REL('DietrichGebert/ponytail', 'v' + ponytail), REL('mattpocock/skills', 'v' + mattpocock),
      PYPI('specify-cli', specify), PYPI('graphifyy', graphify),
    ]),
    'https://api.github.com/repos/RenatoWernik/gauntlet-loop/commits/HEAD': JSON.stringify({ sha: HEADSHA }),
    [RAW('RenatoWernik/gauntlet-loop', HEADSHA, '.claude/skills/gauntlet-loop/SKILL.md')]: gauntlet,
    [RAW('SpillwaveSolutions/sdd-skill', 'HEAD', 'skill.md')]: sdd,
    [RAW('DietrichGebert/ponytail', 'v' + ponytail, 'skills/ponytail/SKILL.md')]: pony,
  };
  for (const u of sem) delete urls[u];
  return { urls, forge, upstream };
}
// O alvo forge (PERGUNTA P6): o repositório não tem releases nem tags; os ataques respondem a qualquer fonte plausível dele.
const forgeResponde = (url, v) => {
  if (!/github(usercontent)?\.com\/(repos\/)?renatowernik\/forge\b/i.test(url)) return undefined;
  if (/\/releases\/latest\b/.test(url)) return JSON.stringify({ tag_name: 'v' + v });
  if (/\/tags\b/.test(url)) return JSON.stringify([{ name: 'v' + v, commit: { sha: 'f'.repeat(40) } }]);
  if (/\/commits\//.test(url)) return JSON.stringify({ sha: 'f'.repeat(40) });
  if (/marketplace\.json\b/.test(url)) return JSON.stringify({ name: 'forge', plugins: [{ name: 'forge', source: './', version: v }] });
  if (/plugin\.json\b/.test(url)) return JSON.stringify({ name: 'forge', version: v });
  return undefined;
};

// O original robonuggets/gauntlet-loop (só para o aviso de commits novos; PERGUNTA P11): responde à HEAD, à lista de commits e à
// comparação com a base do fork. up = sha da HEAD do original; igual a UPSTREAM_SHA = sem novidades.
const upstreamResponde = (url, up) => {
  if (!/github(usercontent)?\.com\/(repos\/)?robonuggets\/gauntlet-loop\b/i.test(url)) return undefined;
  if (up === null) return undefined; // original inacessível (404)
  const novos = up === UPSTREAM_SHA ? [] : [{ sha: up, commit: { message: 'critico: commit novo no original', committer: { date: '2026-10-29T12:00:00Z' } } }];
  if (/\/compare\//.test(url)) return JSON.stringify({ status: novos.length ? 'ahead' : 'identical', ahead_by: novos.length, behind_by: 0, total_commits: novos.length, commits: novos });
  if (/\/commits\/[^/?]+$/.test(url)) return JSON.stringify({ sha: up });
  if (/\/commits\b/.test(url)) return JSON.stringify([...novos, { sha: UPSTREAM_SHA, commit: { message: 'base do fork', committer: { date: '2026-08-05T00:00:00Z' } } }]);
  if (/\/branches\/main\b/.test(url)) return JSON.stringify({ name: 'main', commit: { sha: up } });
  return undefined;
};

// ---------- sondas de versão (as únicas chamadas permitidas fora de um --apply) ----------
const SHELLS = /^(powershell|pwsh|cmd|sh|bash|zsh)(\.exe)?$/i;
const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
export const sonda = (cmd, args, opts) => Array.isArray(args) && !opts?.shell && !SHELLS.test(basename(String(cmd)))
  && ((args.length === 4 && args[0] === '-m' && args[1] === 'pip' && args[2] === 'show') || [['tool', 'list'], ['list', '--short'], ['--version']].some((a) => eq(a, args)));

// ---------- a máquina ----------
// cfg: nome de uma pasta própria para CLAUDE_CONFIG_DIR (por omissão, a config fica em <home>/.claude e a variável não existe)
export function maquina({ platform = 'win32', cfg = null, env = {}, fontes = latest(), compat = compatSint(), falhas = {}, falhaCopia = false } = {}) {
  const root = tmp('critico-f15b-maq-');
  const home = join(root, 'home');
  const configDir = cfg ? join(root, cfg) : join(home, '.claude');
  mkdirSync(configDir, { recursive: true });
  const m = {
    root, home, configDir, claudeJson: cfg ? join(configDir, '.claude.json') : join(home, '.claude.json'),
    events: [], calls: [], reads: [], fetches: [], violacoes: [], probes: {}, virt: new Map(), fontes, falhas, falhaCopia,
  };
  if (compat !== null) m.virt.set(NORM(COMPAT), JSON.stringify(compat, null, 2));
  const backups = join(configDir, 'forge-backups');
  const espia = (kind) => async (cmd, ...rest) => {
    const args = Array.isArray(rest[0]) ? rest[0].map(String) : [];
    const opts = rest.find((x) => x && typeof x === 'object' && !Array.isArray(x)) ?? null;
    const call = { kind, cmd: String(cmd), args, opts, str: [String(cmd), ...args].join(' '), probe: sonda(cmd, args, opts), backupNoDisco: manifesto(backups) };
    m.calls.push(call);
    m.events.push({ t: 'call', call });
    if (call.probe) {
      if (call.str in m.probes) return m.probes[call.str];
      throw Object.assign(new Error(`spawn ${cmd} ENOENT`), { code: 'ENOENT' });
    }
    const f = Object.entries(m.falhas).find(([k]) => call.str === k || args.includes(k) || call.str.includes(k));
    if (f) throw Object.assign(new Error(f[1]), { code: 1, stdout: '', stderr: f[1] });
    return '';
  };
  m.sys = {
    platform, home, env: { ...env, ...(cfg && { CLAUDE_CONFIG_DIR: configDir }) },
    exec: espia('exec'),
    run: espia('run'),
    async readFile(p) {
      m.reads.push(String(p));
      if (m.virt.has(NORM(p))) return m.virt.get(NORM(p));
      try { return await readFile(String(p), 'utf8'); } catch (e) { if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return null; throw e; }
    },
    async writeFile(p, data) {
      m.events.push({ t: 'write', p: String(p) });
      if (!dentro(p, root)) { m.violacoes.push('writeFile ' + p); return; }
      mkdirSync(dirname(String(p)), { recursive: true });
      writeFileSync(String(p), data);
    },
    async copyDir(src, dest) {
      m.events.push({ t: 'copy', src: String(src), dest: String(dest) });
      if (m.falhaCopia) throw Object.assign(new Error('critico: disco cheio'), { code: 'ENOSPC' });
      if (!dentro(dest, root)) { m.violacoes.push('copyDir ' + src + ' -> ' + dest); return; }
      cpSync(String(src), String(dest), { recursive: true });
    },
    async fetchText(url) {
      m.fetches.push(String(url));
      if (url in m.fontes.urls) return m.fontes.urls[url];
      const f = forgeResponde(String(url), m.fontes.forge) ?? upstreamResponde(String(url), m.fontes.upstream);
      if (f !== undefined) return f;
      throw new Error('HTTP 404 ' + url);
    },
  };
  return m;
}

export const poe = (m, rel, content, base = m.configDir) => { const p = join(base, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); return p; };
export const skillLocal = (m, name, content) => poe(m, join('skills', name, 'SKILL.md'), content);

// Instala o estado pedido na máquina: ficheiros reais na config e respostas das sondas. Chaves omitidas = não instalado.
export function instala(m, s) {
  if (s.uv) m.probes['uv --version'] = `uv ${s.uv} (critico 2026-10-27)`;
  if (s['ai-memory']) {
    if (s.aiMemoryBin) { m.sys.env.AI_MEMORY_BIN = s.aiMemoryBin; m.probes[`${s.aiMemoryBin} --version`] = `ai-memory ${s['ai-memory']}`; }
    else m.probes['ai-memory --version'] = `ai-memory ${s['ai-memory']}`;
  }
  if (s.mcp) { mkdirSync(dirname(m.claudeJson), { recursive: true }); writeFileSync(m.claudeJson, JSON.stringify({ mcpServers: { 'ai-memory': { type: 'http', url: 'http://127.0.0.1:49374/mcp' } } })); }
  const tools = [];
  if (s['spec-kit']) tools.push(`specify-cli v${s['spec-kit']}`, '- specify');
  if (s.graphify) tools.push(`graphifyy v${s.graphify}`, '- graphify');
  if (tools.length) m.probes['uv tool list'] = tools.join('\n');
  const plugins = {};
  if (s.ponytail) plugins['ponytail@ponytail'] = s.ponytail;
  if (s.mattpocock) plugins[s.mattpocock[0]] = s.mattpocock[1];
  if (s.forge) plugins['forge@forge'] = s.forge;
  if (Object.keys(plugins).length) poe(m, join('plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: Object.fromEntries(Object.entries(plugins).map(([id, v]) => [id, [{ scope: 'user', version: v }]])) }, null, 2));
  if (s['gauntlet-loop'] !== undefined) skillLocal(m, 'gauntlet-loop', s['gauntlet-loop']);
  if (s.sdd !== undefined) skillLocal(m, 'sdd', s.sdd);
  if (s['graphify-skill']) { skillLocal(m, 'graphify', '---\nname: graphify\n---\n# graphify'); poe(m, join('skills', 'graphify', '.graphify_version'), s['graphify-skill'] + '\n'); }
  if (s.ponytailSolto) for (const n of PONYTAIL_SKILLS) skillLocal(m, n, typeof s.ponytailSolto === 'string' ? s.ponytailSolto : s.ponytailSolto[n]);
  return m;
}
export const TUDO_VERIFICADO = {
  uv: '0.13.6', 'ai-memory': '3.2.10', mcp: true, ponytail: '5.3.3', 'spec-kit': '1.2.5', sdd: SYN.sdd, mattpocock: ['mattpocock-skills@claude-plugins-official', '1.3.2'],
  graphify: '0.9.97', 'graphify-skill': '0.9.97', 'gauntlet-loop': SYN['gauntlet-loop'], forge: FORGE_ULTIMA,
};
export const TUDO_REFERENCIA = {
  uv: '0.12.21', 'ai-memory': '2.5.0', mcp: true, ponytail: '4.10.0', 'spec-kit': '1.0.13', sdd: SYN.sdd, mattpocock: ['mattpocock-skills@claude-plugins-official', '1.2.3'],
  graphify: '0.9.73', 'graphify-skill': '0.9.73', 'gauntlet-loop': SYN['gauntlet-loop'], forge: '0.1.0',
};

// ---------- correr o update ----------
export const loadUpdate = async () => {
  assert.ok(existsSync(UPDATE), 'falta scripts/update.mjs');
  const mod = await import(pathToFileURL(UPDATE).href);
  assert.equal(typeof mod.main, 'function', 'scripts/update.mjs não exporta main(argv, sys, write) (PERGUNTA P1)');
  return mod;
};
export async function upd(m, argv) {
  const { main } = await loadUpdate();
  const out = [];
  const write = (s) => { const text = String(s); out.push(text); m.events.push({ t: 'out', text }); };
  const r0 = rede.length, c0 = m.calls.length, e0 = m.events.length, l0 = m.reads.length;
  const code = await main(argv, m.sys, write);
  assert.deepEqual(rede.slice(r0), [], 'reprova sempre: o fetch global (rede) foi chamado');
  assert.deepEqual(m.violacoes, [], 'reprova sempre: escrita fora da máquina de teste');
  assert.deepEqual(m.reads.slice(l0).filter((p) => dentro(p, ISCA)), [], 'leu a config do process.env (isca) em vez do sys.env/sys.home');
  const calls = m.calls.slice(c0);
  const evs = m.events.slice(e0);
  assert.deepEqual(evs.filter((e) => e.t !== 'out' && e.t !== 'call' && (dentro(e.p ?? e.dest, ISCA))), [], 'escreveu na isca');
  return { code, out: out.join('\n'), calls, execs: calls.filter((c) => !c.probe), events: evs };
}
export async function estado(m, extra = []) {
  const r = await upd(m, ['--check', '--json', ...extra]);
  const i = r.out.indexOf('{'), j = r.out.lastIndexOf('}');
  assert.ok(i >= 0 && j > i, '--check --json não imprimiu JSON (PERGUNTA P1): ' + r.out.slice(0, 300));
  const rep = JSON.parse(r.out.slice(i, j + 1));
  assert.ok(Array.isArray(rep.components), '--check --json sem o array components (PERGUNTA P1)');
  return { ...r, by: Object.fromEntries(rep.components.map((c) => [c.id, c])) };
}
// O comando que o doctor imprime para o id nesta máquina (o que o --apply tem de executar, e só isso)
export async function doDoctor(m, id) {
  const { runDoctor } = await import(pathToFileURL(DOCTOR).href);
  const c0 = m.calls.length, e0 = m.events.length, f0 = m.fetches.length, l0 = m.reads.length;
  const rep = await runDoctor(registry(), m.sys);
  m.calls.splice(c0); m.events.splice(e0); m.fetches.splice(f0); m.reads.splice(l0);
  const c = rep.components.find((x) => x.id === id);
  assert.ok(c?.command?.length, `o doctor não dá comando para ${id} nesta máquina (estado ${c?.status})`);
  return c.command;
}

export const leva = (call, cmd) => call.str === cmd || call.args.includes(cmd);
export function sequencia(execs, esperado, msg = '') {
  assert.equal(execs.length, esperado.length, `${msg}: esperava ${esperado.length} execução(ões), houve ${execs.length}:\n${execs.map((c) => '  ' + c.str).join('\n')}`);
  esperado.forEach((cmd, i) => assert.ok(leva(execs[i], cmd), `${msg}: a execução ${i + 1} não é «${cmd}»:\n  ${execs[i].str}`));
}
export const semEscritas = (r) => assert.deepEqual(r.events.filter((e) => e.t === 'write' || e.t === 'copy'), [], 'escreveu ou copiou sem --overwrite');

// ---------- manifesto sha256 ----------
export const walk = (abs) => (!existsSync(abs) ? [] : statSync(abs).isFile() ? [abs] : readdirSync(abs).flatMap((n) => walk(join(abs, n))));
export function manifesto(dir) {
  return Object.fromEntries(walk(dir).map((f) => [posix(relative(dir, f)), sha(readFileSync(f))]));
}
export function diffManifesto(a, b) {
  const ks = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return ks.filter((k) => a[k] !== b[k]).map((k) => `${a[k] === undefined ? '+' : b[k] === undefined ? '-' : '~'} ${k}`);
}

// ---------- valores hostis ----------
export const IDS_HOSTIS = ['x;rm -rf /', '$(id)', '../ponytail', 'all', '*', '', '`id`', 'ponytail;id', 'ponytail ponytail'];
export const TOKENS_HOSTIS = ['rm -rf', '$(id)', '`id`', "'; id", '&& id', '| id'];
export const NAO_TESTADA = /não testada com o forge|not tested with forge/i;
export const NAO_TOCA = /não (vai ser |será |é |fica )?(tocad|alterad|substituíd)|não (lhe )?(mexe|toca)|(will not|won't|is not going to) be (touched|changed|overwritten)|left (untouched|alone)|untouched/i;
export const SETA = /→|->/;

// ---------- higiene: dados pessoais, caminhos da máquina e tokens (palavras montadas aos bocados) ----------
const W = (...p) => new RegExp(p.join(''), 'i');
export const PERSONAL = [
  /\b[A-Z]:\\\\?(Users|AIData|Tools|Guilda|forge)/i, /\b[A-Z]:\/(Users|AIData|Tools|Guilda|forge)/i, /\/Users\/[a-z]/i, /\/home\/[a-z]/i,
  W('agent', 'homes'), W('gui', 'lda'), W('ren', 'at'), W('wer', 'nik'), W('key', 'rus'), W('one', 'drive'),
  /\bgh[pousr]_[A-Za-z0-9]{20,}/, /github_pat_[A-Za-z0-9_]{20,}/, /\bbearer\s+[A-Za-z0-9._-]{10,}/i, /"authorization"\s*:/i, /\btoken_pepper\b/i,
  /[\w.+-]+@(?!example\.)[\w-]+\.(com|pt|br|org|net|io)\b/i,
];
// Os URLs dos repositórios públicos do forge e do fork do gauntlet-loop (github.com/<dono>/forge|gauntlet-loop) são permitidos;
// o nome do dono noutro sítio continua a reprovar
export const personalHits = (text) => PERSONAL.filter((re) => re.test(text.replace(/github(usercontent)?\.com\/(repos\/)?[A-Za-z0-9-]+\/(forge|gauntlet-loop)\b/gi, 'github.com/OWNER/REPO'))).map(String);

// PRNG com semente fixa (mulberry32)
export const prng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ALFA = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#*-_=+';
// Uma mutação de 1 byte (inserir, apagar ou trocar), nunca num fim de linha nem com espaço: o resultado difere sempre do original
export function muta(texto, rnd) {
  const pos = [...texto].map((ch, i) => (ch === '\n' || ch === '\r' ? -1 : i)).filter((i) => i >= 0);
  const i = pos[Math.floor(rnd() * pos.length)];
  const ch = ALFA[Math.floor(rnd() * ALFA.length)];
  const op = Math.floor(rnd() * 3);
  if (op === 0) return texto.slice(0, i) + ch + texto.slice(i);
  if (op === 1) return texto.slice(0, i) + texto.slice(i + 1);
  const outro = ch === texto[i] ? ALFA[(ALFA.indexOf(ch) + 1) % ALFA.length] : ch;
  return texto.slice(0, i) + outro + texto.slice(i + 1);
}

export { join, resolve, existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, cpSync, dirname, relative };
