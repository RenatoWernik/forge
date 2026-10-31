// Ronda −1 do F-25 (#81): utilitários partilhados pelos ataques ao painel vivo. Só biblioteca padrão.
// Nunca toca na config real: HOME, USERPROFILE e CLAUDE_CONFIG_DIR apontam para uma pasta temporária logo no import, e as
// pastas temporárias apagam-se no `after` do ficheiro de teste. Nada corre no Claude Code: o mod corre contra o `$` falso abaixo.
// TZ=UTC: as horas «HH:MM» da quota são as do relógio local, e assim o local é o UTC (sem depender da máquina).
//
// PONTE (o mesmo mecanismo do F-10 e do F-11; PERGUNTA 1 da Ronda −1 na #81). O contrato fixa criarRelogio() e texto(), mas deixa
// livres os nomes das funções que os hooks chamam e o sítio do estado. O dev escreve na Ronda 0 `tests/ponte/f-25.mjs`, que só
// importa do pacote e adapta a forma, sem lógica (o c0-ponte.test.mjs verifica). Exporta:
//   criar() -> painel   um painel novo, com estado próprio, como o módulo de hooks o cria ao carregar (uma instância de
//                       criarRelogio() e o resto do estado do mod). Cada chamada dá um painel independente.
//   painel.armar($), painel.vigiar($), painel.volta($)   as três funções de criarRelogio() desta instância.
//   painel.evento(nome, $, e, r) -> Promise   o que o hook de hooks/painel.tsx faz no evento `nome`, sem o next:
//                       'session.start' | 'command.run' (resolve { text }) | 'agent.spawn' (r = a resposta do next: { agentId, model })
//                       | 'tool.call' | 'turn.complete' | 'prompt.submit' | 'session.measure' | 'ui.close'.
//   painel.ecra($, colunas) -> Promise<string>   o texto que o ui.render desenha agora ($.clock.now()), com bodyColumns = colunas.
import { after } from 'node:test';
import { mkdtempSync, rmSync, existsSync, readdirSync, statSync, lstatSync, readFileSync, writeFileSync, mkdirSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.TZ = 'UTC';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const PONTE = join(ROOT, 'tests/ponte/f-25.mjs');
export const BASE = '101a181';
export const GRAVAR = join(ROOT, 'scripts/painel-gravar.mjs');

const temps = [];
export const tmp = (prefix = 'critico-f25-') => { const d = mkdtempSync(join(tmpdir(), prefix)); temps.push(d); return d; };
const fake = tmp('critico-f25-home-');
for (const k of ['HOME', 'USERPROFILE', 'CLAUDE_CONFIG_DIR']) process.env[k] = fake;
after(() => { for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });

export const sandboxEnv = (extra = {}) => {
  const env = { ...process.env, HOME: fake, USERPROFILE: fake, CLAUDE_CONFIG_DIR: fake, DISABLE_AUTOUPDATER: '1', ...extra };
  delete env.NODE_TEST_CONTEXT;
  return env;
};

let ponte;
export const api = async () => {
  if (!existsSync(PONTE)) throw new Error('ponte em falta: tests/ponte/f-25.mjs (o dev escreve-a na Ronda 0; ver o topo de helpers.mjs)');
  ponte ??= await import(pathToFileURL(PONTE).href);
  return ponte;
};
export const criar = async () => (await api()).criar();
export const modPainel = () => import(pathToFileURL(join(ROOT, 'scripts/mod-painel.mjs')).href);

export const S = 1000, MIN = 60000, H = 3600000;
export const AGORA = Date.UTC(2026, 9, 31, 12, 0, 0);
export const iso = (ms) => new Date(ms).toISOString();
export const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });

// Vários giros do ciclo de eventos: o $ falso resolve em microtarefas, e as voltas não esperadas acabam aqui
export const flush = async (n = 40) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
// Espera uma promessa no máximo `ms` reais (uma volta presa não pendura o teste): resolve { feito, valor }
export const ate = (p, ms = 3000) => Promise.race([Promise.resolve(p).then((valor) => ({ feito: true, valor })), new Promise((r) => setTimeout(() => r({ feito: false }), ms).unref())]);

export const ag = (nome, papel, ticket, checkpoint, porta) => ({ nome, papel, ticket, modelo: 'modelo-do-json', checkpoint, ...(porta !== undefined && { porta }) });
export const base = () => ({
  versao: 1, projeto: 'Exemplo', objetivo: 'Fechar o lote 1', modo: 'rigoroso',
  tickets: [
    { id: 'T-01', issue: 11, titulo: 'Primeiro', estado: 'main', rondas: 2 },
    { id: 'T-02', issue: 12, titulo: 'Segundo', estado: 'dev', rondas: 1 },
  ],
  agentes: [ag('dev-t02', 'dev', 'T-02', 'dev-t02.md', 4801), ag('critico-t02', 'critico', 'T-02', 'critico-t02.md'), ag('orfao', 'tester', 'T-03', 'orfao.md')],
});

// Projeto temporário. painel: objeto, texto literal ou null. painelHa: idade do painel.json em ms (mtime = AGORA - painelHa).
// checkpoints: { ficheiro: idade em ms } (mtime = AGORA - idade). forge: com .claude/forge.json.
export const projeto = ({ painel = base(), painelHa = 0, checkpoints = { 'dev-t02.md': 2 * MIN, 'critico-t02.md': 3 * MIN, 'orfao.md': 45 * MIN }, forge = true } = {}) => {
  const raiz = join(tmp(), 'Projeto Ação');
  const dir = join(raiz, '.checkpoints');
  mkdirSync(dir, { recursive: true });
  if (forge) { mkdirSync(join(raiz, '.claude')); writeFileSync(join(raiz, '.claude/forge.json'), '{"language":"Português","langTag":"pt-PT"}\n'); }
  const file = join(dir, 'painel.json');
  const idade = (f, ms) => utimesSync(f, (AGORA - ms) / 1000, (AGORA - ms) / 1000);
  if (painel !== null) { writeFileSync(file, typeof painel === 'string' ? painel : JSON.stringify(painel, null, 2)); idade(file, painelHa); }
  for (const [f, ms] of Object.entries(checkpoints)) { writeFileSync(join(dir, f), '# checkpoint\n'); idade(join(dir, f), ms); }
  return { raiz, dir, file, idade };
};

export const agente = (id, name, status, type = 'general-purpose') => ({ id, name, description: `tarefa de ${name}`, type, status });

// O `$` falso. O fs é verdadeiro sobre a pasta temporária e regista cada chamada; process.run nunca executa nada (exit 1).
// Relógio controlado: $.clock.now() dá ctl.agora; $.clock.sleep(ms) só resolve quando ctl.avancar() passa o prazo (nunca, com
// ctl.sleepPreso); $.clock.every e $.clock.after registam o timer, que só dispara com ctl.disparar().
// ctl.agentes: lista de AgentInfo, 'rejeita' ou 'pendura'. ctl.rateLimits: o que $.session.usage() dá (ou ctl.usage = 'pendura').
// ctl.lerPendura: o $.fs.read do painel.json nunca resolve. paineis: ids dos panes abertos ($.ui.panes()).
export const runtime = ({ raiz, cwd = raiz, paineis = [] } = {}) => {
  const ctl = { agora: AGORA, agentes: [], rateLimits: [], usage: 'ok', lerPendura: false, sleepPreso: false, paineis };
  const log = { fs: [], agentList: [], usage: [], processos: [], abertos: [], comandos: [], timers: [], sleeps: [] };
  const nunca = () => new Promise(() => {});
  const abs = (p) => (isAbsolute(String(p)) ? String(p) : join(cwd, String(p ?? '.')));
  const kind = (s) => (s.isFile() ? 'file' : s.isDirectory() ? 'dir' : 'other');
  const $ = {
    fs: {
      read: async (p) => { log.fs.push(['read', abs(p), ctl.agora]); if (ctl.lerPendura && /painel\.json$/.test(String(p))) return nunca(); return readFileSync(abs(p), 'utf8'); },
      list: async (p) => {
        const d = abs(p ?? '.');
        log.fs.push(['list', d, ctl.agora]);
        return readdirSync(d).map((name) => { const s = lstatSync(join(d, name)); return { name, kind: kind(s), size: s.isFile() ? s.size : 0, mtimeMs: s.isFile() ? s.mtimeMs : 0, isLink: s.isSymbolicLink() }; });
      },
      exists: async (p) => { log.fs.push(['exists', abs(p), ctl.agora]); return existsSync(abs(p)); },
      stat: async (p) => { log.fs.push(['stat', abs(p), ctl.agora]); const s = statSync(abs(p)); return { kind: kind(s), size: s.size, mtimeMs: s.mtimeMs, isLink: false }; },
      write: async (p) => { log.fs.push(['write', abs(p), ctl.agora]); },
    },
    session: {
      root: async () => raiz,
      cwd: async () => cwd,
      id: async () => 'sessao-falsa',
      messages: async () => [],
      usage: async () => {
        log.usage.push(ctl.agora);
        if (ctl.usage === 'pendura') return nunca();
        return { startedAt: AGORA - H, context: { usedTokens: 123456, windowTokens: 200000, percentUsed: 61 }, rateLimits: structuredClone(ctl.rateLimits), cost: { usd: 1.5 } };
      },
    },
    agent: {
      list: async () => {
        log.agentList.push(ctl.agora);
        if (ctl.agentes === 'pendura') return nunca();
        if (ctl.agentes === 'rejeita') throw new Error('agent.list falhou');
        return structuredClone(ctl.agentes);
      },
    },
    clock: {
      now: async () => ctl.agora,
      sleep: (ms) => new Promise((ok) => { log.sleeps.push({ ms, prazo: ctl.agora + ms, ok, preso: ctl.sleepPreso }); }),
      every: (ms, fn) => { const t = { tipo: 'every', ms, fn, cancelado: false, em: ctl.agora }; log.timers.push(t); return { cancel: () => { t.cancelado = true; } }; },
      after: (ms, fn) => { const t = { tipo: 'after', ms, fn, cancelado: false, em: ctl.agora }; log.timers.push(t); return { cancel: () => { t.cancelado = true; } }; },
    },
    process: { run: async (argv) => { log.processos.push([...argv]); return { exitCode: 1, stdout: '', stderr: '' }; } },
    ui: {
      open: async (o) => { log.abertos.push(o); return { isPlaced: true }; },
      panes: async () => ctl.paineis.map((id) => ({ id, title: 'forge', isShown: true, isFocused: false, isPlaced: true })),
      status: () => {}, toast: () => {}, log: () => {},
    },
    command: { register: async (c) => { log.comandos.push(c); } },
    plugin: { root: ROOT, name: 'forge' },
  };
  // Avança o relógio falso: resolve os sleeps cujo prazo passou (menos os presos) e deixa correr o que esperava por eles
  ctl.avancar = async (ms) => {
    ctl.agora += ms;
    for (const s of log.sleeps) if (!s.feito && !s.preso && s.prazo <= ctl.agora) { s.feito = true; s.ok(); }
    await flush();
  };
  // Dispara uma vez cada timer every ainda armado (o relógio do motor a correr)
  ctl.disparar = async () => { for (const t of log.timers.filter((x) => x.tipo === 'every' && !x.cancelado)) t.fn(); await flush(); };
  const everys = () => log.timers.filter((t) => t.tipo === 'every');
  // Leituras de dados (o que «não lê nada» conta): fs, agent.list, session.usage e processos
  const leituras = () => log.fs.length + log.agentList.length + log.usage.length + log.processos.length;
  return { $, ctl, log, everys, leituras };
};

// O texto do painel em linhas; o bloco de um agente é a sua linha «● nome · ...» e as seguintes até outra linha de agente,
// uma linha vazia, «terminaram:», um aviso ou um título em maiúsculas
export const linhas = (t) => String(t).split('\n');
export const bloco = (t, nome) => {
  const ls = linhas(t);
  const i = ls.findIndex((l) => l.startsWith(`● ${nome} · `));
  if (i < 0) return null;
  const out = [ls[i]];
  for (const l of ls.slice(i + 1)) { if (!l.trim() || l.startsWith('●') || l.startsWith('terminaram') || l.startsWith('⚠') || /^[A-ZÀ-Ú ]+$/.test(l.trim())) break; out.push(l); }
  return out.join('\n');
};
// A secção QUOTA: as linhas depois do título «QUOTA» até à primeira linha vazia, aviso, agente, «terminaram» ou outro título
// (ou ao fim); null sem secção
export const quota = (t) => {
  const ls = linhas(t).map((l) => l.trim());
  const i = ls.indexOf('QUOTA');
  if (i < 0) return null;
  const fim = ls.findIndex((l, k) => k > i && (!l || /^(⚠|●|⟳|terminaram)/.test(l) || /^[A-ZÀ-Ú ]+$/.test(l)));
  return ls.slice(i + 1, fim < 0 ? undefined : fim);
};
// Largura em células como a do mod: um por code point, dois por emoji
export const largura = (s) => [...s].reduce((n, c) => n + (/\p{Extended_Pictographic}/u.test(c) ? 2 : 1), 0);

export const buildProject = async (dest) => {
  const { scaffold } = await import(pathToFileURL(join(ROOT, 'scripts/scaffold.mjs')).href);
  const dir = join(ROOT, 'scripts/corpus/answers');
  const nome = readdirSync(dir).filter((n) => n.endsWith('.json')).sort()[0];
  await scaffold(JSON.parse(readFileSync(join(dir, nome), 'utf8').replace(/^\uFEFF/, '')), { dest });
  return dest;
};