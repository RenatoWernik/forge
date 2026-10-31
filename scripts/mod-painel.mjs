// The panel mod's logic (F-11, F-25): what the hooks in hooks/painel.tsx run, kept free of 'claude-code' so plain Node can test it.
// The mod runs where there is no Node: everything outside goes through `$`, and only the shared reader is imported.
// Functions that take `$` are `function` declarations: `claude plugin validate --strict` refuses `$` passed to an arrow, and
// refuses `$` passed to an object's method, so the hooks call the top-level functions with the relogio as an argument.
import { ler } from './painel-leitor.mjs';

export const COMANDO = 'forge-painel';
export const PANE = 'forge-painel';
export const NAO_FORGE = 'este projeto não é um projeto forge';

const S = 1000;
const MIN = 60000;
const TICK = 5 * S; // the clock's period
const VIGIA = 15 * S; // no volta for longer than this: the clock died, an event rearms it
const PRESA = 20 * S; // a volta running for longer than this is stuck and no longer guards
const LIMITE = 4 * S; // each call to `$` in a volta, so a slow one never stops the others
const SAIU = 15 * S; // an agent missing from $.agent.list() this long after its launch has ended
const TERMINADOS = 30 * MIN; // ended agents stay on the «terminaram:» line this long
const ILEGIVEL = 10 * S; // an unreadable painel.json is only reported after this long
const TEMPO = 'sem resposta em 4 s';
const ATIVOS = ['pending', 'running', 'waiting', 'idle'];
const ESPERA = ['waiting', 'idle'];

// The open project's root when it is a forge project (has .claude/forge.json), else undefined. Answer 6 of #12: root(), then cwd().
async function raizForge($) {
  const raiz = (await $.session.root()) ?? (await $.session.cwd());
  return raiz && (await $.fs.exists(`${raiz}/.claude/forge.json`).catch(() => false)) ? raiz : undefined;
}

// The ports listening on this machine, or null when they could not be listed (an unknown port is never shown as dead).
// Windows roots start with a drive letter; elsewhere lsof (macOS, most Linux), then ss.
async function portasVivas($, raiz) {
  const correr = (argv) => $.process.run(argv, { timeoutMs: 5000 }).catch(() => ({ exitCode: 1, stdout: '' }));
  if (/^[a-z]:/i.test(raiz) || raiz.startsWith('\\\\')) {
    const r = await correr(['netstat', '-ano', '-p', 'tcp']);
    return r.exitCode === 0 ? portas(r.stdout, 'win32') : null;
  }
  const l = await correr(['lsof', '-iTCP', '-sTCP:LISTEN', '-P', '-n']);
  if (l.exitCode === 0) return portas(l.stdout, 'darwin');
  const s = await correr(['ss', '-ltnH']);
  return s.exitCode === 0 ? portas(s.stdout, 'linux') : null;
}

// The model the panel shows: the shared reader's over <root>/.checkpoints, plus portaViva for agents with a port.
// Never rejects; outside a forge project it reads nothing and runs nothing.
export async function dados($, agora) {
  const raiz = await raizForge($);
  if (!raiz) return { erro: NAO_FORGE, contagens: null, agentes: [] };
  const dir = `${raiz}/.checkpoints`;
  const texto = await $.fs.read(`${dir}/painel.json`).catch(() => undefined);
  const lista = await $.fs.list(dir).catch(() => []);
  return comPortas($, raiz, ler(texto, Object.fromEntries(lista.filter((f) => f.kind === 'file').map((f) => [f.name, f.mtimeMs])), agora));
}

// The model plus portaViva for agents with a port (only lists the ports when one has a port).
async function comPortas($, raiz, modelo) {
  if (!modelo.agentes.some((a) => a.porta !== undefined)) return modelo;
  const vivas = await portasVivas($, raiz);
  return { ...modelo, agentes: modelo.agentes.map((a) => (a.porta === undefined || !vivas ? a : { ...a, portaViva: vivas.includes(a.porta) })) };
}

// A call to `$` with LIMITE on the clock of `$`. A refused sleep decides nothing: it stays pending and the call wins.
function comTempo($, p) {
  return Promise.race([p, $.clock.sleep(LIMITE).then(() => { throw new Error(TEMPO); }, () => new Promise(() => {}))]);
}

// The panel's live state (F-25): one per hooks module. The hooks call the top-level functions with it; its own armar, vigiar
// and volta delegate to them, for whoever holds it outside the hooks.
export function criarRelogio() {
  const r = { agentes: new Map(), sinais: new Map(), acoes: [] };
  r.armar = function ($) { return armar($, r); };
  r.vigiar = function ($) { return vigiar($, r); };
  r.volta = function ($) { return volta($, r); };
  return r;
}

// Cancels the previous timer and starts one that gives a volta every TICK.
export function armar($, r) {
  r.timer?.cancel();
  r.timer = $.clock.every(TICK, () => void volta($, r));
}

// On every event: when the last volta is older than VIGIA, the clock died (respawn, reload): rearms it and gives a volta.
// After the person closed the pane (ui.close), only /forge-painel or a session.start with the pane open arm it again.
export async function vigiar($, r) {
  const agora = await $.clock.now();
  if (r.fechado || (r.ultima !== undefined && agora - r.ultima <= VIGIA)) return;
  r.ultima = agora;
  armar($, r);
  void volta($, r);
}

// One refresh: painel.json and checkpoints, agents and quota in parallel, each call to `$` within LIMITE. Never rejects.
// The guard comes first: while another volta runs (for up to PRESA) this one reads nothing.
export async function volta($, r) {
  try {
    const agora = await $.clock.now();
    if (r.aLer !== undefined && agora - r.aLer <= PRESA) return;
    r.aLer = r.ultima = agora;
    try {
      await Promise.allSettled([lerPainel($, r, agora), lerAgentes($, r, agora), lerQuota($, r, agora)]);
      r.feita = await $.clock.now();
    } finally {
      if (r.aLer === agora) r.aLer = undefined;
    }
    redesenhar($);
  } catch {
    // the next volta tries again
  }
}

// The pane draws from module state, not from $.state: asks the engine to draw it again.
function redesenhar($) {
  try { $.ui.invalidate('ui.render'); } catch { /* a runtime without invalidate draws on its own */ }
}

// painel.json through the shared reader. A broken or invalid text keeps the last good model and records falhaDesde.
async function lerPainel($, r, agora) {
  let raiz;
  try { raiz = await comTempo($, raizForge($)); } catch { return; }
  if (!raiz) {
    Object.assign(r, { modelo: { erro: NAO_FORGE, contagens: null, agentes: [] }, falhaDesde: undefined, painelMtime: undefined, maisNovo: undefined });
    return;
  }
  const dir = `${raiz}/.checkpoints`;
  const [lido, lista] = await Promise.allSettled([comTempo($, $.fs.read(`${dir}/painel.json`)), comTempo($, $.fs.list(dir))]);
  const ficheiros = lista.status === 'fulfilled' ? lista.value.filter((f) => f.kind === 'file') : [];
  const mtimes = Object.fromEntries(ficheiros.map((f) => [f.name, f.mtimeMs]));
  r.painelMtime = mtimes['painel.json'];
  r.maisNovo = ficheiros.filter((f) => /\.md$/i.test(f.name) && !/\.tmp/i.test(f.name)).reduce((a, f) => (a && a.mtimeMs >= f.mtimeMs ? a : f), undefined);
  const m = ler(lido.status === 'fulfilled' ? lido.value : undefined, mtimes, agora);
  if (m.erro) {
    r.falhaDesde ??= agora;
    r.erro = lido.status === 'rejected' && lido.reason?.message === TEMPO ? TEMPO : m.erro;
    if (!r.modelo?.contagens) r.modelo = m;
    return;
  }
  Object.assign(r, { modelo: m, falhaDesde: undefined, erro: undefined });
  if (m.agentes.some((a) => a.porta !== undefined)) r.modelo = await comTempo($, comPortas($, raiz, m)).catch(() => m);
}

// The agents of Claude Code itself. A list that fails or does not answer keeps the previous volta's agents.
async function lerAgentes($, r, agora) {
  const lista = await comTempo($, $.agent.list());
  const vistos = new Set();
  for (const a of lista) {
    vistos.add(a.id);
    const antes = r.agentes.get(a.id);
    r.agentes.set(a.id, { ...antes, id: a.id, nome: a.name || antes?.nome || a.description || a.id, estado: a.status, inicio: antes?.inicio ?? agora, fim: ATIVOS.includes(a.status) ? undefined : (antes?.fim ?? agora) });
  }
  for (const [id, a] of r.agentes) {
    // left the list without saying how: ended (a just-launched agent may not be listed yet)
    if (!vistos.has(id) && a.fim === undefined && agora - a.inicio > SAIU) Object.assign(a, { estado: 'completed', fim: agora });
    if (a.fim !== undefined && agora - a.fim >= TERMINADOS) { r.agentes.delete(id); r.sinais.delete(id); }
  }
}

const janelas = (l) => (Array.isArray(l) ? l : []).map((j) => ({ kind: j.kind, percentUsed: j.percentUsed, resetsAt: j.resetsAt }));

// The fallback when session.measure has not measured: $.session.usage(), recorded only when the windows changed.
async function lerQuota($, r, agora) {
  if (r.quota?.fonte === 'medido') return;
  const j = janelas((await comTempo($, $.session.usage()))?.rateLimits);
  if (j.length && JSON.stringify(j) !== JSON.stringify(r.quota?.janelas)) r.quota = { janelas: j, em: agora, fonte: 'lido' };
}

// What each hook of hooks/painel.tsx does with its event (without next). command.run resolves { text }; the others never reject:
// the panel only observes.
export async function evento($, r, nome, e, res) {
  if (nome === 'command.run') {
    r.fechado = false;
    armar($, r);
    return abrir($, () => volta($, r));
  }
  try {
    if (nome === 'ui.close') {
      r.timer?.cancel();
      Object.assign(r, { timer: undefined, fechado: true });
      return;
    }
    if (nome === 'session.start') {
      await iniciar($);
      const panes = await comTempo($, $.ui.panes()).catch(() => []);
      if (panes.some((p) => p.id === PANE)) {
        r.fechado = false;
        armar($, r);
        void volta($, r);
      }
      return;
    }
    const agora = await $.clock.now();
    if (nome === 'agent.spawn' && res?.agentId) {
      const antes = r.agentes.get(res.agentId);
      r.agentes.set(res.agentId, { ...antes, id: res.agentId, nome: e.name || antes?.nome || e.description || res.agentId, tipo: e.subagentType, modelo: res.model, estado: antes?.estado ?? 'running', inicio: antes?.inicio ?? agora, fim: undefined });
    }
    if ((nome === 'tool.call' || nome === 'turn.complete') && e.agentId) r.sinais.set(e.agentId, agora);
    // the orchestrator's own actions, not its subagents', for the pulse
    if (nome === 'tool.call' && !e.agentId) r.acoes = [...r.acoes.filter((t) => agora - t < 30 * MIN), agora].slice(-400);
    if (nome === 'prompt.submit' && !e.isMeta) r.ultimaMensagem = agora;
    if (nome === 'session.measure' && janelas(e.rateLimits).length) r.quota = { janelas: janelas(e.rateLimits), em: agora, fonte: 'medido' };
    await vigiar($, r);
  } catch {
    // never breaks the event
  }
}

// The text the pane draws now.
export async function ecra($, r, colunas) {
  return texto(vista(r, await $.clock.now()), colunas);
}

const duracao = (ms) => (ms < MIN ? `${Math.floor(ms / S)} s` : ms < 60 * MIN ? `${Math.floor(ms / MIN)} min` : `${Math.floor(ms / (60 * MIN))} h`);
const corta = (s, max) => ([...s].length <= max ? s : [...s].slice(0, max - 1).join('') + '…');
const JANELA = { five_hour: '5 h', seven_day: 'semana' };
const hhmm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const linhaJanela = (j, agora) => {
  const nome = Object.hasOwn(JANELA, j.kind) ? JANELA[j.kind] : String(j.kind);
  const fim = Date.parse(j.resetsAt);
  if (fim <= agora) return `${nome} sem dados (reiniciou ${hhmm(fim)})`; // a window already reset never shows a percentage
  return `${nome} ${Math.round(j.percentUsed)}%${Number.isFinite(fim) ? ` · reinicia ${hhmm(fim)}` : ''}`;
};

// The model texto() draws: painel.json's model, the engine's agents joined by name, the freshness, the warnings and the quota.
function vista(r, agora) {
  const m = r.modelo ?? { contagens: null, agentes: [] };
  const motor = [...r.agentes.values()];
  const nomes = new Set(motor.map((a) => a.nome));
  const ficha = new Map(m.agentes.map((a) => [a.nome, a]));
  const agentes = [
    ...motor.filter((a) => a.fim === undefined).map((a) => {
      const f = ficha.get(a.nome); // painel.json only adds ticket, papel, checkpoint and porta
      return { nome: a.nome, vida: ESPERA.includes(a.estado) ? 'à espera' : 'ativo', sinal: ha(Math.max(0, agora - (r.sinais.get(a.id) ?? a.inicio))), ticket: f?.ticket ?? '—', papel: f?.papel ?? 'outro', modelo: a.modelo, checkpoint: f?.checkpoint, porta: f?.porta, portaViva: f?.portaViva };
    }),
    ...m.agentes.filter((a) => !nomes.has(a.nome)).map((a) => ({ ...a, soPainel: true })),
  ];
  const terminaram = motor.filter((a) => a.fim !== undefined && agora - a.fim < TERMINADOS).map((a) => `${a.estado === 'completed' ? '✓' : '✕'} ${a.nome} ${Math.floor((agora - a.fim) / MIN)} min`);
  const avisos = [];
  const idade = r.feita === undefined ? undefined : Math.max(0, agora - r.feita); // since the last volta that ended
  if (idade >= 30 * S) avisos.push('relógio parado: escreve /forge-painel para o rearmar');
  if (r.falhaDesde !== undefined && agora - r.falhaDesde >= ILEGIVEL) avisos.push(`painel.json ilegível há ${Math.floor((agora - r.falhaDesde) / S)} s (${corta(r.erro, 60)})`);
  if (r.painelMtime !== undefined && r.maisNovo && r.maisNovo.mtimeMs - r.painelMtime > MIN)
    avisos.push(`painel.json sem alterações há ${duracao(Math.max(0, agora - r.painelMtime))}, mas ${r.maisNovo.name} é de há ${duracao(Math.max(0, agora - r.maisNovo.mtimeMs))}`);
  return {
    ...m,
    agentes,
    frescura: idade === undefined ? '⟳ à espera da primeira leitura' : `⟳ atualizado há ${Math.floor(idade / S)} s · ${idade < VIGIA ? 'AO VIVO' : idade < MIN ? 'ATRASADO' : 'PARADO'}`,
    avisos,
    pulso: linhaPulso(r.acoes, r.ultimaMensagem, agora),
    terminaram,
    quota: r.quota?.janelas.length ? [...r.quota.janelas.map((j) => linhaJanela(j, agora)), `${r.quota.fonte} há ${ha(Math.max(0, agora - r.quota.em))}`] : [],
  };
}

// session.start: only registers the command (answer 8: the panel never opens by itself).
export async function iniciar($) {
  await $.command.register({ name: COMANDO, description: 'Abre o painel do projeto forge' });
}

// command.run: outside a forge project says so and reads nothing; inside, refreshes the data and opens the pane.
export async function abrir($, refrescar) {
  if (!(await raizForge($))) return { text: `Painel: ${NAO_FORGE} (falta .claude/forge.json).` };
  await refrescar?.();
  await $.ui.open({ id: PANE, title: 'forge', rows: 30, columns: 60 });
  return { text: 'Painel do forge aberto.' };
}

// Listening ports in the literal output of netstat -ano -p tcp (win32), lsof -iTCP -sTCP:LISTEN -P -n (darwin) or ss -ltnH (linux).
// netstat: a listening row has the foreign port 0, whatever the language of the state column.
const LINHA = {
  win32: /^\s*TCP\s+\S*:(\d+)\s+\S*:0\s/,
  darwin: /\sTCP\s+\S*:(\d+)\s+\(LISTEN\)/,
  linux: /^LISTEN\s+\d+\s+\d+\s+\S*:(\d+)\s/,
};
export function portas(saida, plataforma) {
  const re = LINHA[plataforma];
  const n = String(saida).split(/\r?\n/).map((l) => Number(re?.exec(l)?.[1])).filter((p) => Number.isInteger(p) && p >= 1 && p <= 65535);
  return [...new Set(n)];
}

// The orchestrator pulse: state from the last action, autonomy from the last action against the last user message.
export function pulso(ultimaAcao, ultimaMensagem, agora) {
  const autonomia = ultimaAcao !== undefined && ultimaMensagem !== undefined && ultimaAcao - ultimaMensagem > MIN ? 'autónomo' : 'comigo';
  if (ultimaAcao === undefined) return { estado: 'sem atividade', autonomia };
  const ms = agora - ultimaAcao;
  return { estado: ms < 2 * MIN ? 'ativo' : ms < 10 * MIN ? 'a pensar' : 'parado', autonomia };
}

const ha = (ms) => (ms < MIN ? `${Math.floor(ms / 1000)} s` : `${Math.floor(ms / MIN)} min`);

// 15 bars of 2 min (the last 30 min), each as tall as its share of actions. Answer 5: no action or no message = no activity.
export function linhaPulso(acoes, ultimaMensagem, agora) {
  if (!acoes.length || ultimaMensagem === undefined) return `${'·'.repeat(15)} sem atividade`;
  const n = new Array(15).fill(0);
  for (const t of acoes) { const i = 14 - Math.floor((agora - t) / (2 * MIN)); if (i >= 0 && i < 15) n[i]++; }
  const max = Math.max(1, ...n);
  const barras = n.map((v) => (v === 0 ? '·' : '▁▂▃▄▅▆▇█'[Math.min(7, Math.floor((v / max) * 7))])).join('');
  const ultima = Math.max(...acoes);
  const p = pulso(ultima, ultimaMensagem, agora);
  return `${barras} ${p.estado} há ${ha(Math.max(0, agora - ultima))} · ${p.autonomia}`;
}

// Width in terminal cells: one per code point, two for an emoji.
const largura = (s) => [...s].reduce((n, c) => n + (/\p{Extended_Pictographic}/u.test(c) ? 2 : 1), 0);
const cabe = (s, max) => {
  if (largura(s) <= max) return s;
  let out = '', w = 0;
  for (const c of s) { const cw = largura(c); if (w + cw > max - 1) break; out += c; w += cw; }
  return out + '…';
};

const NOME = { main: 'main', aprovado: 'aprovado', critico: 'crítico', dev: 'dev', reprovado: 'reprovado', espera: 'espera', falta: 'falta' };
const PAPEL = { dev: 'dev', critico: 'crítico', tester: 'tester', outro: 'agente' };

// The panel as plain text, no line wider than `colunas`; what does not fit is cut with «…». Never shows tokens (answer 7).
// F-25 adds, when the model has them: the freshness line first, the warnings, engine agents (with `sinal`), agents only in
// painel.json (`soPainel`), the «terminaram:» line and the QUOTA section.
export function texto(modelo, colunas) {
  const linhas = [];
  if (modelo.frescura) linhas.push(modelo.frescura);
  for (const a of modelo.avisos ?? []) linhas.push(`⚠ ${a}`);
  if (modelo.pulso) linhas.push(`🧭 ${modelo.pulso}`);
  if (modelo.projeto) linhas.push(`${modelo.projeto}${modelo.modo ? ` · ${modelo.modo}` : ''}`);
  if (modelo.objetivo) linhas.push(`🎯 ${modelo.objetivo}`);
  if (modelo.contagens) {
    const n = Object.fromEntries(modelo.contagens);
    const total = modelo.contagens.reduce((s, [, k]) => s + k, 0);
    const cheio = Math.round(modelo.percentagem / 5);
    const aEspera = [...new Set(modelo.agentes.filter((a) => ['ativo', 'sem sinal', 'à espera'].includes(a.vida)).map((a) => (a.ticket === '—' ? a.nome : a.ticket)))];
    linhas.push(aEspera.length ? `⏳ à espera de ${aEspera.join(' · ')}` : '⏳ nenhum agente a trabalhar', '');
    linhas.push(`${'▰'.repeat(cheio)}${'▱'.repeat(20 - cheio)} ${modelo.percentagem}% ${n.main + n.aprovado}/${total}`, '');
    for (const [estado, k] of modelo.contagens) if (k > 0) linhas.push(`${String(k).padStart(3)} ${NOME[estado].padEnd(9)} ${'■'.repeat(k)}`);
    linhas.push('', 'AGENTES');
  }
  for (const a of modelo.agentes) {
    if (a.sinal !== undefined) linhas.push(`● ${a.nome} · ${a.vida} · sinal há ${a.sinal}`);
    else linhas.push(`● ${a.nome} · ${a.vida}${a.minutos === null ? '' : a.minutos < 1 ? ' · agora' : ` · há ${a.minutos} min`}${a.soPainel ? ' · só painel.json' : ''}`);
    const porta = a.porta === undefined ? '' : ` · ⇄ :${a.porta}${a.portaViva === undefined ? '' : a.portaViva ? ' ●' : ' ○'}`;
    linhas.push(`  ${a.ticket} · ${PAPEL[a.papel] ?? a.papel}${a.modelo === undefined ? '' : ` · ${a.modelo}`}${porta}`);
  }
  if (modelo.terminaram?.length) linhas.push(`terminaram: ${modelo.terminaram.join(' · ')}`);
  if (modelo.quota?.length) linhas.push('', 'QUOTA', ...modelo.quota);
  if (modelo.erro) linhas.push(`⚠ ${modelo.erro}`);
  return linhas.map((l) => cabe(l, colunas)).join('\n');
}
