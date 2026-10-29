// The panel mod's logic (F-11): what the hooks in hooks/painel.tsx run, kept free of 'claude-code' so plain Node can test it.
// The mod runs where there is no Node: everything outside goes through `$`, and only the shared reader is imported.
// Functions that take `$` are `function` declarations: `claude plugin validate --strict` refuses `$` passed to an arrow.
import { ler } from './painel-leitor.mjs';

export const COMANDO = 'forge-painel';
export const PANE = 'forge-painel';
export const NAO_FORGE = 'este projeto não é um projeto forge';

const MIN = 60000;

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
  const modelo = ler(texto, Object.fromEntries(lista.filter((f) => f.kind === 'file').map((f) => [f.name, f.mtimeMs])), agora);
  if (!modelo.agentes.some((a) => a.porta !== undefined)) return modelo;
  const vivas = await portasVivas($, raiz);
  return { ...modelo, agentes: modelo.agentes.map((a) => (a.porta === undefined || !vivas ? a : { ...a, portaViva: vivas.includes(a.porta) })) };
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
export function texto(modelo, colunas) {
  const linhas = [];
  if (modelo.pulso) linhas.push(`🧭 ${modelo.pulso}`);
  if (modelo.projeto) linhas.push(`${modelo.projeto}${modelo.modo ? ` · ${modelo.modo}` : ''}`);
  if (modelo.objetivo) linhas.push(`🎯 ${modelo.objetivo}`);
  if (modelo.contagens) {
    const n = Object.fromEntries(modelo.contagens);
    const total = modelo.contagens.reduce((s, [, k]) => s + k, 0);
    const cheio = Math.round(modelo.percentagem / 5);
    const aEspera = [...new Set(modelo.agentes.filter((a) => a.vida === 'ativo' || a.vida === 'sem sinal').map((a) => a.ticket))];
    linhas.push(aEspera.length ? `⏳ à espera de ${aEspera.join(' · ')}` : '⏳ nenhum agente a trabalhar', '');
    linhas.push(`${'▰'.repeat(cheio)}${'▱'.repeat(20 - cheio)} ${modelo.percentagem}% ${n.main + n.aprovado}/${total}`, '');
    for (const [estado, k] of modelo.contagens) if (k > 0) linhas.push(`${String(k).padStart(3)} ${NOME[estado].padEnd(9)} ${'■'.repeat(k)}`);
    linhas.push('', 'AGENTES');
  }
  for (const a of modelo.agentes) {
    linhas.push(`● ${a.nome} · ${a.vida}${a.minutos === null ? '' : a.minutos < 1 ? ' · agora' : ` · há ${a.minutos} min`}`);
    const porta = a.porta === undefined ? '' : ` · ⇄ :${a.porta}${a.portaViva === undefined ? '' : a.portaViva ? ' ●' : ' ○'}`;
    linhas.push(`  ${a.ticket} · ${PAPEL[a.papel] ?? a.papel} · ${a.modelo}${porta}`);
  }
  if (modelo.erro) linhas.push(`⚠ ${modelo.erro}`);
  return linhas.map((l) => cabe(l, colunas)).join('\n');
}
