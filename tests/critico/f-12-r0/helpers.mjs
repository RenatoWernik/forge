// Ronda −1 do F-12 (#13): utilitários partilhados pelos ataques à página web do painel. Só biblioteca padrão.
// Nunca toca na config real: HOME, USERPROFILE e CLAUDE_CONFIG_DIR apontam para uma pasta temporária logo no import;
// as pastas temporárias são apagadas no `after` do ficheiro que as criou, e o perfil do browser é sempre temporário.
//
// BROWSER. A página corre num Chrome ou Edge já instalado na máquina, sem headless de terceiros: o teste fala com ele pelo
// protocolo DevTools num pipe (--remote-debugging-pipe), sem portas e sem dependências. O executável vem de FORGE_BROWSER
// ou dos caminhos habituais (resposta 5). O processo é fechado pelo PID que o teste lançou, nunca por nome.
//
// BASE DE DADOS FALSA. O `claude.use("db")` da página é simulado segundo o contrato 0.2.47 (db.d.ts): doc/collection, get, set,
// update, delete, add, where/orderBy/limit, onSnapshot com entrega assíncrona, snapshots congelados e TypeError num caminho
// inválido. O documento `painel/estado` guarda a cópia exata do painel.json: o seu `data()` é o objeto do painel.json (resposta 1).
// O documento `painel/vida` é `{ t, agentes: { <nome>: { minutos, vida } } }`, calculado pelo leitor a partir dos mtimes (resposta 2).
// Sem browser, os ataques de página fazem skip com o motivo «sem browser» (resposta 5); nesta máquina há browser e correm.
// Todas as escritas da página ficam em window.__fake.writes. O relógio da página (Date e Date.now) fica parado em AGORA.
//
// PONTE (resposta 4). O contrato não fixa a marcação da página. Para os ataques não fixarem classes nem ids, o dev escreve na
// Ronda 0 a ponte `tests/ponte/f-12.mjs`, que só lê o DOM. Exporta:
//   vista               function () -> { erro, percentagem, contagens, agentes }, corre DENTRO da página (é serializada com
//                       toString) e lê só o `document`: erro = texto do erro que a página mostra, ou null; percentagem = o progresso
//                       mostrado (número 0-100) ou null; contagens = [[estado, n], ...] como a página as mostra, ou null quando a
//                       página não mostra contagens; agentes = [{ nome, vida }] pela ordem mostrada, com vida em 'a começar' |
//                       'ativo' | 'sem sinal' | 'parado?' ou null se a página não a mostra
//   seletorResumo       string  seletor CSS do resumo: o progresso, as contagens por estado e o objetivo (o «primeiro ecrã», resposta 9)
//   seletorInboxTexto   string  seletor CSS do campo de texto da caixa de entrada
//   seletorInboxEnviar  string  seletor CSS do botão que envia o pedido
//   docsVida            function (texto do painel.json, mtimes, agora) -> { 'painel/vida': { t, agentes } }: reexportação da função
//                       do pacote que calcula o documento `painel/vida` escrito logo a seguir a `painel/estado` (resposta 2)
import { test, after } from 'node:test';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const PONTE = join(ROOT, 'tests/ponte/f-12.mjs');
export const BASE = 'e083b6a';
export const LEITOR = join(ROOT, 'scripts/painel-leitor.mjs');
export const PAGINA = '.claude/dashboard/panel.html';

const temps = [];
export const tmp = (prefix = 'critico-f12-') => { const d = mkdtempSync(join(tmpdir(), prefix)); temps.push(d); return d; };
const fake = tmp('critico-f12-home-');
const ENV_ORIGINAL = { ...process.env };
for (const k of ['HOME', 'USERPROFILE', 'CLAUDE_CONFIG_DIR']) process.env[k] = fake;
after(() => { for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });

export const sandboxEnv = (extra = {}) => {
  const env = { ...process.env, HOME: fake, USERPROFILE: fake, CLAUDE_CONFIG_DIR: fake, ...extra };
  delete env.NODE_TEST_CONTEXT;
  return env;
};
export const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });

let ponte;
export const api = async () => {
  if (!existsSync(PONTE)) throw new Error('ponte em falta: tests/ponte/f-12.mjs (o dev escreve-a na Ronda 0; ver o topo de helpers.mjs)');
  ponte ??= await import(pathToFileURL(PONTE).href);
  return ponte;
};

// O leitor do pacote (F-10, já verificado na #11): o modelo esperado de cada fixture
export const leitor = () => import(pathToFileURL(LEITOR).href);
export const ESTADOS = ['main', 'aprovado', 'critico', 'dev', 'reprovado', 'espera', 'falta'];
export const MIN = 60000;
export const AGORA = Date.UTC(2026, 9, 29, 12, 0, 0);

// --- fixtures (corpus finito) ---
export const base = () => ({
  versao: 1, projeto: 'Projeto Exemplo', objetivo: 'Fechar o lote 1', modo: 'rigoroso',
  tickets: [
    { id: 'T-01', issue: 11, titulo: 'Primeiro', estado: 'main', rondas: 2 },
    { id: 'T-02', issue: 12, titulo: 'Segundo', estado: 'aprovado', rondas: 1 },
    { id: 'T-03', issue: 13, titulo: 'Terceiro', estado: 'critico', rondas: 1 },
    { id: 'T-04', issue: 14, titulo: 'Quarto', estado: 'falta', rondas: 0 },
  ],
  agentes: [
    { nome: 'dev-t03', papel: 'dev', ticket: 'T-03', modelo: 'sonnet', checkpoint: 'desenvolvedor-t03.md', porta: 4801 },
    { nome: 'critico-t03', papel: 'critico', ticket: 'T-03', modelo: 'opus', checkpoint: 'critico-t03.md' },
  ],
});
const PAPEIS = ['dev', 'critico', 'tester', 'outro'];
export const comAgentes = (n, nome = (i) => `agente-${String(i + 1).padStart(2, '0')}`) => ({
  ...base(),
  agentes: Array.from({ length: n }, (_, i) => ({ nome: nome(i), papel: PAPEIS[i % 4], ticket: 'T-0' + (1 + (i % 4)), modelo: ['sonnet', 'opus', 'haiku'][i % 3], checkpoint: `ag-${i + 1}.md` })),
});
export const todosEstados = () => ({
  ...base(),
  tickets: [...ESTADOS, 'dev', 'falta', 'falta'].map((estado, i) => ({ id: `E-${i + 1}`, issue: 100 + i, titulo: 'Estado ' + estado, estado, rondas: i % 3 })),
});
export const LONGO = 'agente-com-um-nome-muito-comprido-sem-espacos-'.repeat(6) + 'fim';
export const FIXTURES = {
  vazio: { versao: 1, modo: 'acelerado', tickets: [], agentes: [] },
  base: base(),
  'todos os estados': todosEstados(),
  '0 agentes': comAgentes(0),
  '1 agente': comAgentes(1),
  '9 agentes': comAgentes(9),
  '30 agentes': comAgentes(30),
  'nomes longos, com acentos e com HTML': comAgentes(4, (i) => [LONGO, 'João Ação ç «x» 🚀 ñ ü', '<b>negrito</b> & "aspas" \'plicas\'', 'Ünïcödé — 中文 — العربية'][i]),
  'campos extra': { ...base(), extra: { a: 1 }, tickets: base().tickets.map((t) => ({ ...t, nota: 'n' })) },
};

// Gerador determinístico (mulberry32) de painéis válidos: a semente aparece no nome do teste
export const rng = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const PEDACOS = ['a', 'ção', 'Ö', '<', '>', '&', '"', "'", ' ', '🚀', 'x', '-', '«', '»', '$', '{', '}', '\\'];
export const gerado = (r) => {
  const txt = (n) => Array.from({ length: 1 + Math.floor(r() * n) }, () => pick(r, PEDACOS)).join('');
  const nt = Math.floor(r() * 13), na = Math.floor(r() * 13);
  return {
    versao: 1, projeto: txt(12), objetivo: txt(20), modo: pick(r, ['acelerado', 'rigoroso']),
    tickets: Array.from({ length: nt }, (_, i) => ({ id: `G-${i}-${txt(4)}`, issue: 1 + i, titulo: txt(16), estado: pick(r, ESTADOS), rondas: Math.floor(r() * 4) })),
    // nomes sem espaços repetidos nem nas pontas: o que se compara é o texto, não o colapso de espaços do HTML
    agentes: Array.from({ length: na }, (_, i) => ({ nome: `${i}:${txt(10)}`.replace(/\s+/g, ' ').trim(), papel: pick(r, PAPEIS), ticket: txt(4), modelo: txt(6), checkpoint: `g${i}.md` })),
  };
};

// --- projetos gerados ---
export const corpusAnswers = () => {
  const dir = join(ROOT, 'scripts/corpus/answers');
  return readdirSync(dir).filter((n) => n.endsWith('.json')).sort().map((n) => ({ name: n.replace(/\.json$/, ''), value: JSON.parse(readFileSync(join(dir, n), 'utf8').replace(/^﻿/, '')) }));
};
export const respostas = (name) => corpusAnswers().find((a) => a.name === name).value;
const projetos = new Map();
export const gerar = async (answers, scaffoldPath = join(ROOT, 'scripts/scaffold.mjs')) => {
  const key = scaffoldPath + JSON.stringify(answers);
  if (!projetos.has(key)) projetos.set(key, (async () => {
    const { scaffold } = await import(pathToFileURL(scaffoldPath).href);
    const dest = join(tmp(), 'proj');
    await scaffold(answers, { dest });
    return dest;
  })());
  return projetos.get(key);
};
export const paginaDe = async (answers = respostas('en-noplain-published')) => readFileSync(join(await gerar(answers), PAGINA), 'utf8');

// --- browser ---
export const acharBrowser = () => {
  const env = process.env;
  const c = [env.FORGE_BROWSER,
    ...(process.platform === 'win32' ? [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean).flatMap((p) => [join(p, 'Google/Chrome/Application/chrome.exe'), join(p, 'Microsoft/Edge/Application/msedge.exe')])
      : process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
        : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'])];
  return c.find((p) => p && existsSync(p));
};

const SKELETON = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0}</style>';

// O runtime falso do Artifact, injetado antes da página. cfg: { docs: { caminho: dados }, semDb, agora }
const fakeScript = (cfg) => `(() => {
  const CFG = ${JSON.stringify(cfg).replace(/</g, '\\u003c')};
  const AG = CFG.agora, RD = Date;
  class D extends RD { constructor(...a) { if (a.length) super(...a); else super(AG); } static now() { return AG; } }
  window.Date = D;
  const store = new Map(Object.entries(CFG.docs));
  const subs = [];
  const F = window.__fake = { writes: [], usos: 0, pendentes: 0, xss: [], subs: 0 };
  window.__xss = (n) => F.xss.push(n);
  const SEG = /^[A-Za-z0-9_\\-.~:@+]+$/;
  const partes = (path, par) => { const p = String(path).split('/'); if (!p.every((s) => SEG.test(s) && s !== '.' && s !== '..') || (p.length % 2 === 0) !== par) throw new TypeError('bad path: ' + path); return p; };
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const congelar = (v) => { if (v && typeof v === 'object') { Object.values(v).forEach(congelar); Object.freeze(v); } return v; };
  const meta = Object.freeze({ fromCache: false, hasPendingWrites: false });
  const dsnap = (path) => { const d = store.get(path); const body = congelar(clone(d)); return Object.freeze({ id: path.split('/').pop(), exists: d !== undefined, data: () => body, metadata: meta }); };
  const cmp = (a, op, b) => ({ '==': a === b, '!=': a !== b, '<': a < b, '<=': a <= b, '>': a > b, '>=': a >= b, in: Array.isArray(b) && b.includes(a), 'not-in': Array.isArray(b) && !b.includes(a), 'array-contains': Array.isArray(a) && a.includes(b) })[op];
  const correr = (q) => {
    const n = q.path.split('/').length + 1;
    let ds = [...store.keys()].filter((k) => k.startsWith(q.path + '/') && k.split('/').length === n).sort().map((k) => [k, store.get(k)]);
    for (const [f, op, v] of q.where) ds = ds.filter(([, d]) => cmp(d[f], op, v));
    if (q.order) { const [f, dir] = q.order; ds.sort(([, a], [, b]) => { const x = a[f], y = b[f]; if (x === undefined) return y === undefined ? 0 : 1; if (y === undefined) return -1; return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'desc' ? -1 : 1); }); }
    if (q.lim) ds = ds.slice(0, q.lim);
    const docs = ds.map(([k]) => dsnap(k));
    return Object.freeze({ docs, size: docs.length, empty: !docs.length, docChanges: () => docs.map((doc, i) => ({ type: 'added', doc, oldIndex: -1, newIndex: i })), metadata: meta });
  };
  const depois = (fn) => { F.pendentes++; setTimeout(() => { F.pendentes--; fn(); }, 5); };
  const subscrever = (snap, next, error) => { const s = { snap, next, error, vivo: true }; subs.push(s); F.subs++; depois(() => s.vivo && next(snap())); return () => { s.vivo = false; }; };
  const avisar = () => { for (const s of subs) if (s.vivo) depois(() => s.vivo && s.next(s.snap())); };
  const escrever = (op, path, data) => F.writes.push({ op, path, data: clone(data) });
  const recusar = (code) => Promise.reject({ code, message: code });
  let seq = 0;
  const docRef = (path) => { partes(path, true); return Object.freeze({ id: path.split('/').pop(), path,
    get: async () => dsnap(path),
    set: async (d) => { escrever('set', path, d); if (!d || typeof d !== 'object' || Array.isArray(d)) return recusar('invalid_argument'); store.set(path, clone(d)); avisar(); },
    update: async (d) => { escrever('update', path, d); if (!store.has(path)) return recusar('invalid_argument'); store.set(path, { ...store.get(path), ...clone(d) }); avisar(); },
    delete: async () => { escrever('delete', path); store.delete(path); avisar(); },
    acquire: async (o) => { escrever('acquire', path, o); return { acquired: true }; },
    onSnapshot: (next, error) => subscrever(() => dsnap(path), next, error),
    collection: (c) => collRef(path + '/' + c) }); };
  const query = (q) => Object.freeze({
    where: (f, op, v) => query({ ...q, where: [...q.where, [f, op, v]] }),
    orderBy: (f, dir = 'asc') => query({ ...q, order: [f, dir] }),
    limit: (n) => query({ ...q, lim: n }),
    get: async () => correr(q),
    onSnapshot: (next, error) => subscrever(() => correr(q), next, error) });
  const collRef = (path) => { partes(path, false); return Object.freeze({ ...query({ path, where: [], order: null, lim: 0 }), path,
    doc: (id) => docRef(path + '/' + (id ?? 'd' + ++seq)),
    add: async (d) => { const p = path + '/a' + ++seq; escrever('add', p, d); if (!d || typeof d !== 'object' || Array.isArray(d)) return recusar('invalid_argument'); store.set(p, clone(d)); avisar(); return docRef(p); } }); };
  const db = Object.freeze({ doc: docRef, collection: collRef });
  F.definir = (path, d) => { if (d === undefined) store.delete(path); else store.set(path, clone(d)); avisar(); };
  F.falhar = (code) => { for (const s of subs) if (s.vivo) { s.vivo = false; const e = s.error; depois(() => e && e({ code, message: code })); } };
  window.claude = Object.freeze({ use: (name) => { F.usos++; F.pendentes++; return new Promise((r) => setTimeout(() => { F.pendentes--; r(name === 'db' && !CFG.semDb ? db : null); }, 20)); } });
})();`;

export const embrulhar = (pagina, cfg) => `${SKELETON}<script>${fakeScript(cfg)}</script></head><body>${pagina}</body></html>`;

const esperarMs = (ms) => new Promise((r) => setTimeout(r, ms));

// Abre um browser e um separador. Devolve { abrir, avaliar, vista, esperarVista, ... , fechar }.
export async function sessao() {
  const exe = acharBrowser();
  if (!exe) throw new Error('sem browser: nem Chrome nem Edge instalados (resposta 5); defina FORGE_BROWSER com o caminho do executável');
  const perfil = mkdtempSync(join(tmpdir(), 'critico-f12-perfil-'));
  const pasta = tmp('critico-f12-pagina-');
  const p = spawn(exe, ['--headless=new', '--remote-debugging-pipe', `--user-data-dir=${perfil}`, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--disable-sync', '--disable-component-update', '--disable-default-apps', '--mute-audio',
    '--allow-file-access-from-files', '--disable-crash-reporter', '--disable-breakpad', '--disable-gpu', '--no-service-autorun', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'], env: { ...process.env, USERPROFILE: ENV_ORIGINAL.USERPROFILE } });
  // ^ o Chrome no Windows recusa o pipe de DevTools com um USERPROFILE falso («requires a non-default data directory»); o perfil
  //   que ele usa é sempre o --user-data-dir temporário acima, e HOME e CLAUDE_CONFIG_DIR continuam falsos
  if (process.env.F12_DEBUG) p.stderr.on('data', (d) => process.stderr.write('[browser] ' + d));
  else p.stderr.resume();
  let id = 0, buf = '';
  const pend = new Map(), ouvintes = new Set();
  p.stdio[4].on('data', (d) => {
    buf += d.toString('utf8');
    for (let i; (i = buf.indexOf('\0')) >= 0;) {
      const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
      if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(`${m.error.message} (${m.error.code})`)) : res(m.result); }
      else for (const f of ouvintes) f(m);
    }
  });
  p.stdio[3].on('error', () => {});
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const n = ++id;
    const t = setTimeout(() => { pend.delete(n); rej(new Error('CDP sem resposta: ' + method)); }, 30000);
    pend.set(n, { res: (v) => { clearTimeout(t); res(v); }, rej: (e) => { clearTimeout(t); rej(e); } });
    p.stdio[3].write(JSON.stringify({ id: n, method, params, sessionId }) + '\0');
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, params) => send(m, params, sessionId);
  const estado = { pedidos: [], excecoes: [], carregou: null };
  ouvintes.add((m) => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Network.requestWillBeSent') estado.pedidos.push({ url: m.params.request.url, type: m.params.type });
    if (m.method === 'Runtime.exceptionThrown') estado.excecoes.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    if (m.method === 'Page.loadEventFired' && estado.carregou) estado.carregou();
  });
  await s('Page.enable'); await s('Runtime.enable'); await s('Network.enable');
  await s('Network.setBlockedURLs', { urls: ['http://*', 'https://*', 'ws://*', 'wss://*'] }); // nada sai para a rede; o pedido fica registado

  const avaliar = async (expression) => {
    const r = await s('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('avaliar: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
    return r.result.value;
  };
  // Espera que a página peça a BD e que todas as entregas pendentes do falso tenham corrido; depois dois frames
  const assentar = async () => {
    const fim = Date.now() + 5000;
    while (Date.now() < fim) {
      if (await avaliar('!!window.__fake && window.__fake.usos > 0 && window.__fake.pendentes === 0')) break;
      await esperarMs(30);
    }
    await esperarMs(120);
    await avaliar('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
  };
  let n = 0;
  const api_ = {
    estado,
    s,
    avaliar,
    assentar,
    // pagina: o HTML gerado; opts: { docs, semDb, largura, altura, reduzirMovimento }
    async abrir(pagina, { docs = {}, semDb = false, largura = 1440, altura = 900, reduzirMovimento = false } = {}) {
      await s('Emulation.setDeviceMetricsOverride', { width: largura, height: altura, deviceScaleFactor: 1, mobile: largura < 600 });
      await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduzirMovimento ? 'reduce' : 'no-preference' }] });
      const f = join(pasta, `p${++n}.html`);
      writeFileSync(f, embrulhar(pagina, { docs, semDb, agora: AGORA }));
      estado.pedidos.length = 0; estado.excecoes.length = 0;
      const carregado = new Promise((r) => { estado.carregou = r; });
      await s('Page.navigate', { url: pathToFileURL(f).href });
      await Promise.race([carregado, esperarMs(15000)]);
      estado.carregou = null;
      await assentar();
    },
    // Corre a vista da ponte dentro da página
    async vista() {
      const { vista } = await api();
      return avaliar(`(${vista.toString()})()`);
    },
    // Repete a vista até `ok(v)` ou até ao prazo; devolve a última vista
    async esperarVista(ok, ms = 3000) {
      const fim = Date.now() + ms;
      let v;
      do { v = await api_.vista(); if (ok(v)) return v; await esperarMs(60); } while (Date.now() < fim);
      return v;
    },
    // Fecha a árvore do browser pelo PID que este teste lançou (nunca por nome) e apaga o perfil temporário;
    // os processos filhos do Chrome largam o perfil uns instantes depois, por isso a remoção tenta durante até 20 s
    async fechar() {
      const saida = p.exitCode !== null ? Promise.resolve() : new Promise((r) => p.once('exit', r));
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
      else { try { await Promise.race([send('Browser.close'), esperarMs(5000)]); } catch { /* já fechado */ } if (p.exitCode === null) p.kill('SIGKILL'); }
      await Promise.race([saida, esperarMs(10000)]);
      for (let i = 0; ; i++) {
        try { rmSync(perfil, { recursive: true, force: true }); return; } catch (e) { if (i >= 40) throw e; await esperarMs(500); }
      }
    },
  };
  return api_;
}

// Resposta 5: sem browser, os testes de página fazem skip com o motivo escrito
export const SEM_BROWSER = acharBrowser() ? false : 'sem browser: nem Chrome nem Edge instalados (defina FORGE_BROWSER com o caminho do executável)';
export const testePagina = (nome, fn) => test(nome, { skip: SEM_BROWSER }, fn);
// Abre a sessão no before do ficheiro, só quando há browser
export const comBrowser = async () => (SEM_BROWSER ? null : sessao());

// O modelo esperado de um painel (o leitor do pacote, com mtimes vazios e o relógio parado)
export const esperado = async (painel, mtimes = {}) => (await leitor()).ler(JSON.stringify(painel), mtimes, AGORA);
export const docsDe = (painel) => (painel === undefined ? {} : { 'painel/estado': painel });
// O documento painel/vida da resposta 2, calculado pelo leitor do pacote: { t, agentes: { <nome>: { minutos, vida } } }
export const docVida = async (painel, mtimes) => {
  const m = await esperado(painel, mtimes);
  return { 'painel/vida': { t: new Date(AGORA).toISOString(), agentes: Object.fromEntries(m.agentes.map((a) => [a.nome, { minutos: a.minutos, vida: a.vida }])) } };
};
// O pacote antes do F-12: o merge-base com a origin/main (sem origin, BASE)
export const antes = () => { const m = git('merge-base', 'HEAD', 'origin/main'); return m.status === 0 ? m.stdout.trim() : BASE; };
