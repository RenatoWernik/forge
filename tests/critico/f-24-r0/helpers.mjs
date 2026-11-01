// Ronda −1 do F-24 (#80): utilitários partilhados pelos ataques. Só biblioteca padrão.
// Nunca toca na config real nem numa sessão claude: HOME, USERPROFILE e CLAUDE_CONFIG_DIR apontam para uma pasta temporária logo no import;
// os transcripts são fixtures JSONL; nenhum CronCreate é chamado (é texto do manual); as pastas temporárias apagam-se no `after`.
// Os scripts do contrato correm como o projeto gerado os corre: `node .claude/retoma.mjs` e `node .claude/acordar.mjs` a partir da raiz,
// e os hooks com `node <raiz>/.claude/hooks/<script>`, o JSON do evento no stdin e CLAUDE_PROJECT_DIR = raiz.
//
// LEITURA DO CONTRATO (#80, corpo + comentário do orquestrador sobre o aviso em subagente):
// - os textos abaixo, de P_CONTEXTO a C5_ESCALA, foram extraídos por programa do corpo da issue (byte a byte, sem os «> » da citação);
// - payload de subagente = o JSON do hook com `agent_id` e `agent_type` (documentação oficial dos hooks, code.claude.com/docs/en/hooks:
//   «the input carries the agent_id and agent_type ... that identify the subagent»); transcript de subagente = um JSONL em `subagents/`
//   só com entradas `isSidechain: true`;
// - «nada» = stdout vazio (o stderr não é lido), e cada chamada a um hook sai com 0 em ≤ 2 s;
// - C4: com TZ=Europe/Lisbon, 31/10 e 01/11/2026 já estão em WET (UTC+0), o que a guarda confirma; o «agora» das linhas sem «Agora» é 17:00 local.
// - RESPOSTAS do orquestrador às PERGUNTAS da Ronda −1 (comentários 6551678060 e 6551691368, prevalecem sobre o corpo): os hooks novos vão para o
//   `.claude/settings.local.json` (o `settings.json` fica byte a byte); um agente sem checkpoint só recebe a linha wake, nunca a escalate;
//   as linhas wake e escalate saem pela ordem do painel.json; sem checkpoint, só o troço `<N> min since .checkpoints/<ficheiro>` muda para
//   `no checkpoint file yet`.
import { after } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync, utimesSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const temps = [];
export const tmp = (prefix = 'critico-f24-') => { const d = mkdtempSync(join(tmpdir(), prefix)); temps.push(d); return d; };
const fake = tmp('critico-f24-home-');
for (const k of ['HOME', 'USERPROFILE', 'CLAUDE_CONFIG_DIR']) process.env[k] = fake;
export const FAKE_HOME = fake;
after(() => { for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });

// Ambiente de cada filho: config pessoal falsa, sem autoupdater, e sem herdar o projeto, o relógio ou a janela da sessão que corre os testes
const HERDADAS = ['NODE_TEST_CONTEXT', 'CLAUDE_PROJECT_DIR', 'FORGE_CONTEXT_WINDOW', 'FORGE_NOW_MS', 'FORGE_VIGIA_NOW_MS', 'NODE_OPTIONS'];
export const sandboxEnv = (extra = {}) => {
  const env = { ...process.env, HOME: fake, USERPROFILE: fake, CLAUDE_CONFIG_DIR: fake, DISABLE_AUTOUPDATER: '1' };
  for (const k of Object.keys(env)) if (HERDADAS.includes(k.toUpperCase())) delete env[k];
  for (const [k, v] of Object.entries(extra)) { if (v === undefined) delete env[k]; else env[k] = v; }
  return env;
};

// ---- Git: as guardas «byte a byte» e de âmbito comparam com a merge-base da origin/main, nunca com um sha fixo ----
export const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });
export const mergeBase = () => git('merge-base', 'HEAD', 'origin/main').stdout.trim();
export const naBase = (rel) => { const r = git('show', `${mergeBase()}:${rel}`); return r.status === 0 ? r.stdout : null; };
export const ramo = () => git('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim();
export const SO_NO_RAMO = { skip: !/^f-24/.test(ramo()) && 'teste de âmbito: só no ramo do F-24 (depois do merge a main já tem a mudança)' };

// ---- Textos literais do contrato (extraídos do corpo da #80) ----
export const P_CONTEXTO = "**Context.** When the context use reaches 85 % (the hook says `CONTEXT WARNING`), save `.checkpoints/orchestrator.md` and write the baton with `memory_handoff_begin` at once, then keep working: the automatic compaction follows, and the `compact` session start brings you back. Never ask the user to open a new session.";
export const P_QUOTA = "**Quota.** When an answer says the usage limit was reached (`resets <time>`), write in `.checkpoints/orchestrator.md` the state of every agent (name, ticket, checkpoint, what it was doing), schedule your own wake-up with `node .claude/acordar.mjs --at <time> --cron` and the `CronCreate` tool (ToolSearch `select:CronCreate`, `recurring: false`, the prompt below); without `CronCreate`, run `node .claude/acordar.mjs --at <time> --sleep` with Bash `run_in_background` (a timer, not a test). When you wake, resume without asking the user.";
export const P_AGENTES = "**Agents.** No agent stays idle for more than 10 minutes: `node .claude/retoma.mjs` lists the ones to wake; wake each one by its name with `SendMessage`, or relaunch it from its checkpoint, in the same turn and without asking the user. An agent past `minutesWithoutProgress` of `.claude/forge.json` also goes into `args.vida`, so the workflow escalates it.";
export const P_CHECKPOINTS = "**Checkpoints.** Every long-running agent (developer, critic, tester, research) saves `.checkpoints/<role>-<task>.md` after each step, in the format of `.checkpoints/README.md`; a research agent writes its report incrementally, with a `STATE` block at the top.";
export const P_ORQUESTRADOR = "**Orchestrator.** Save `.checkpoints/orchestrator.md` and write the baton at the end of each objective and when the context reaches 85 %. The safety net of the quota is in the next paragraph.";
export const P_REDE = "**Safety net.** Only while an autonomous run has active subagents, keep exactly one recurring `CronCreate` job with the cron `7,27,47 * * * *` and the safety-net prompt below. Create it at the start of the run, and before creating it list the jobs with `CronList`: create it only if no job's prompt starts with `[forge-safety-net]`. Delete it with `CronDelete` when the run ends. It costs one model call per fire, 3 per hour; a fire with nothing to do answers in one line and stops.";
export const PROMPT_RETOMA = "Resume the forge run: run node .claude/retoma.mjs, read .checkpoints/orchestrator.md and the baton, then wake each agent it lists by its name (SendMessage) or relaunch it from its checkpoint. Do not ask the user.";
export const PROMPT_REDE = "[forge-safety-net] Run node .claude/retoma.mjs. If it prints \"nothing to resume\" and no usage limit is waiting for its reset, answer \"forge-safety-net: nothing to do\" in one line and stop. Otherwise resume the forge run: read .checkpoints/orchestrator.md and the baton, then wake each agent it lists by its name (SendMessage) or relaunch it from its checkpoint. Do not ask the user.";
export const FRASE_INV12 = "Never ask the user to open a new session: at 85 % of context save the checkpoint and the baton and go on (FRAMEWORK.md section 12).";
export const FRASE_README = "A research agent writes its report incrementally, with a STATE block at the top that says what is done and what comes next.";
export const AVISO_JSON = "{\"hookSpecificOutput\":{\"hookEventName\":<evento>,\"additionalContext\":\"CONTEXT WARNING: <n>% of the context is used. Save .checkpoints/orchestrator.md and write the baton (memory_handoff_begin) now, then keep working: the automatic compaction will follow. Never ask the user to open a new session.\"}}";
export const LINHA_C3 = "forge: resumed after compaction. Read .checkpoints/orchestrator.md and the baton, then continue the work without asking the user to open a new session.";
export const L_C6 = "checkpoints: every active agent of painel.json saved its checkpoint less than 10 min ago";
export const C5_ORQ_OK = "orchestrator: .checkpoints/orchestrator.md saved <N> min ago";
export const C5_ORQ_FALTA = "orchestrator: .checkpoints/orchestrator.md missing";
export const C5_WAKE = "wake: <nome> (ticket <t>): <N> min since .checkpoints/<ficheiro>; SendMessage to <nome>, or relaunch it from that file";
export const C5_ESCALA = "escalate: <nome> passed minutesWithoutProgress (<valor> min): pass it in args.vida";

export const AVISO_BRIEFS = 'Context warnings from hooks belong to the main session, never to you'; // comentário do orquestrador na #80, ponto 2
export const PECAS = ['.claude/retoma.mjs', '.claude/acordar.mjs', '.claude/hooks/forge-contexto.mjs', '.claude/hooks/forge-retoma.mjs'];
export const CONTEXTO = '.claude/hooks/forge-contexto.mjs', RETOMA_HOOK = '.claude/hooks/forge-retoma.mjs', RETOMA = '.claude/retoma.mjs', ACORDAR = '.claude/acordar.mjs';
export const BRIEFS = ['batch', 'critic', 'dev', 'round-minus-1'].map((b) => `templates/.claude/briefs/${b}.md`);

export const le = (rel, raiz = ROOT) => readFileSync(join(raiz, rel), 'utf8').replace(/^\uFEFF/, '');
export const conta = (texto, s) => texto.split(s).length - 1;
export const semCr = (t) => String(t).replace(/\r\n/g, '\n');

// ---- Projeto gerado (inglês, as respostas do F-01) ----
export const ANSWERS = (over = {}) => ({
  projectName: 'Acme Billing', language: 'English', mode: 'rigorous', repo: 'acme/billing',
  models: {
    developer: { model: 'sonnet', effort: 'high', reason: 'logic and server code' },
    developerUi: { model: 'opus', effort: 'high', reason: 'rich UI needs a stronger model' },
    critic: { model: 'opus', effort: 'high', reason: 'the critic stays on the strongest model' },
    tester: { model: 'haiku', effort: 'xhigh', reason: 'the batch suite is mechanical work' },
    aux: { model: 'sonnet', effort: 'medium', reason: 'panel records only' },
  },
  memory: { workspace: 'acme', project: 'billing' },
  ...over,
});
export const scaffoldFn = async () => (await import(pathToFileURL(join(ROOT, 'scripts/scaffold.mjs')).href)).scaffold;
export const gerar = async (over = {}) => { const d = join(tmp(), 'proj'); await (await scaffoldFn())(ANSWERS(over), { dest: d }); return d; };

// ---- Correr um script do projeto ----
const lerR = (r, t0) => ({ status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', ms: Date.now() - t0, erro: r.error });
// node <script> com cwd na raiz do projeto; `script` relativo (como o manual o escreve) ou absoluto (como o settings.json chama os hooks)
export const corre = (proj, script, { input = '', env = {}, args = [], timeout = 30000 } = {}) => {
  const t0 = Date.now();
  return lerR(spawnSync(process.execPath, [script, ...args], { cwd: proj, input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8', env: sandboxEnv(env), timeout }), t0);
};
export const hook = (proj, rel, entrada, env = {}) => corre(proj, join(proj, rel), { input: entrada, env: { CLAUDE_PROJECT_DIR: proj, ...env } });
export const linhas = (s) => semCr(s).replace(/\n+$/, '').split('\n').filter((l, i, a) => !(a.length === 1 && l === ''));
export const mostra = (r) => `saída ${r.status} em ${r.ms} ms; stdout=${JSON.stringify(r.stdout.slice(0, 600))}; stderr=${JSON.stringify(r.stderr.slice(0, 400))}`;

// ---- C2: transcripts JSONL e o vigia do contexto ----
export const JANELA = 200000, JANELA_1M = 1000000;
let seq = 0;
// Uma entrada assistant como as do Claude Code, com os tokens repartidos pelos três campos que contam; output_tokens não conta
export const assistente = (tokens, { modelo = 'claude-sonnet-5-5', lateral = false, saida = 0, semUsage = false } = {}) => {
  const a = Math.floor(tokens * 0.01), b = Math.floor(tokens * 0.2), c = tokens - a - b;
  const n = ++seq;
  return {
    parentUuid: null, isSidechain: lateral, userType: 'external', cwd: '/x', sessionId: 's', version: '2.1.0', type: 'assistant', uuid: 'u-a-' + n, timestamp: new Date(1_790_000_000_000 + n * 1000).toISOString(),
    message: { id: 'msg_' + n, type: 'message', role: 'assistant', model: modelo, content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn',
      ...(semUsage ? {} : { usage: { input_tokens: a, cache_creation_input_tokens: b, cache_read_input_tokens: c, output_tokens: saida, service_tier: 'standard' } }) },
  };
};
export const utilizador = (texto = 'continua', lateral = false) => ({ parentUuid: null, isSidechain: lateral, type: 'user', uuid: 'u-u-' + ++seq, timestamp: new Date(1_790_000_000_000 + seq * 1000).toISOString(), message: { role: 'user', content: texto } });
export const transcript = (dir, entradas, nome = 'sessao.jsonl') => { const f = join(dir, nome); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, entradas.map((e) => (typeof e === 'string' ? e : JSON.stringify(e))).join('\n') + '\n'); return f; };
export const pct = (p, janela = JANELA) => Math.round((p / 100) * janela); // tokens de p % da janela

// Um vigia por cenário: a pasta temporária do estado (TMPDIR/TEMP/TMP) e um projeto gerado
export const cenarioContexto = async () => {
  const proj = await gerar();
  const estado = join(tmp('critico-f24-estado-'), 'tmp');
  mkdirSync(estado, { recursive: true });
  const tr = join(tmp('critico-f24-tr-'), 'projects', 'acme');
  mkdirSync(tr, { recursive: true });
  const envT = { TMPDIR: estado, TEMP: estado, TMP: estado };
  // chama o hook com o transcript dado; o: { sessao, evento, env, agente: { agent_id, agent_type } }
  const chama = (transcriptPath, o = {}) => {
    const evento = o.evento ?? 'UserPromptSubmit';
    const base = { session_id: o.sessao ?? 'sessao-1', transcript_path: transcriptPath, cwd: proj, permission_mode: 'default', hook_event_name: evento };
    const extra = evento === 'PostToolUse'
      ? { tool_name: 'Bash', tool_input: { command: 'git status', description: 'estado' }, tool_response: { stdout: '', stderr: '', interrupted: false }, tool_use_id: 'toolu_f24' }
      : { prompt: 'continua o trabalho' };
    return hook(proj, CONTEXTO, { ...base, ...extra, ...(o.agente ?? {}) }, { ...envT, ...(o.env ?? {}) });
  };
  return { proj, estado, tr, chama };
};
// O aviso esperado: o JSON do contrato com o evento e o inteiro de baixo da percentagem; nivel 'WARNING' | 'CRITICAL'
export const avisoEsperado = (evento, n, nivel = 'WARNING') =>
  JSON.parse(AVISO_JSON.replace('<evento>', JSON.stringify(evento)).replace('<n>', String(n)).replace('CONTEXT WARNING', 'CONTEXT ' + nivel));
// O que o hook imprimiu: null = nada; senão o JSON (um texto que não é JSON fica como { naoJson })
export const saidaHook = (r) => { const t = r.stdout.trim(); if (!t) return null; try { return JSON.parse(t); } catch { return { naoJson: t }; } };
export const ficheiroEstado = (estado, sessao) => join(estado, 'forge-contexto-' + createHash('sha256').update(sessao).digest('hex').slice(0, 16) + '.json');

// ---- C4: o despertar ----
export const TZ = 'Europe/Lisbon';
export const MIN = 60000;
export const local = (a, m, d, h, mi) => Date.UTC(a, m - 1, d, h, mi); // 31/10 e 01/11/2026 em Lisboa = UTC (a guarda confirma)
export const AGORA_C4 = local(2026, 10, 31, 17, 0);
export const acordar = (proj, args, agoraMs) => corre(proj, ACORDAR, { args, env: { TZ, FORGE_NOW_MS: String(agoraMs) } });
// o despertar em ms -> { local: 'AAAA-MM-DD HH:MM', cron: 'M H DoM Mon *' } (no fuso de Lisboa, que nestas datas é o UTC)
export const formas = (ms) => { const d = new Date(ms), p = (n) => String(n).padStart(2, '0');
  return { local: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`, cron: `${d.getUTCMinutes()} ${d.getUTCHours()} ${d.getUTCDate()} ${d.getUTCMonth() + 1} *` }; };

// ---- C5, C6: painel.json, checkpoints e relógio ----
export const AGORA = Date.UTC(2026, 9, 31, 17, 0, 0);
export const CP = (proj) => join(proj, '.checkpoints');
// Escreve o painel e os checkpoints: agentes = [{ nome, ticket, estado, min (null = sem ficheiro), checkpoint? }]; orq = minutos do orchestrator.md (null = falta)
export const painel = (proj, agentes, { orq = 3, texto } = {}) => {
  const dir = CP(proj);
  mkdirSync(dir, { recursive: true });
  const tickets = [], vistos = new Set();
  agentes.forEach((a, i) => { if (!vistos.has(a.ticket)) { vistos.add(a.ticket); tickets.push({ id: a.ticket, issue: 10 + i, titulo: 'peça ' + a.ticket, estado: a.estado, rondas: 1 }); } });
  const ag = agentes.map((a, i) => ({ nome: a.nome, papel: a.papel ?? 'dev', ticket: a.ticket, modelo: 'sonnet high', checkpoint: a.checkpoint ?? `agente-${i + 1}.md` }));
  writeFileSync(join(dir, 'painel.json'), texto ?? JSON.stringify({ versao: 1, projeto: 'Acme Billing', modo: 'rigoroso', tickets, agentes: ag }, null, 2) + '\n');
  const marca = (f, min) => { writeFileSync(f, 'role: dev\n'); const t = (AGORA - min * MIN - 30000) / 1000; utimesSync(f, t, t); };
  ag.forEach((a, i) => { const f = join(dir, a.checkpoint); if (agentes[i].min === null) rmSync(f, { force: true }); else marca(f, agentes[i].min); });
  const o = join(dir, 'orchestrator.md');
  if (orq === null) rmSync(o, { force: true }); else marca(o, orq);
  return { tickets, agentes: ag };
};
export const relogio = (ms = AGORA) => ({ FORGE_VIGIA_NOW_MS: String(ms) });
export const retoma = (proj, ms = AGORA) => corre(proj, RETOMA, { env: relogio(ms) });
export const forgeJson = (proj, f) => { const p = join(proj, '.claude/forge.json'); const j = JSON.parse(readFileSync(p, 'utf8')); f(j); writeFileSync(p, JSON.stringify(j, null, 2) + '\n'); };
// A fixture do oráculo do C5: agentes a 9, 10 e 31 min, um sem checkpoint e um num ticket main; minutesWithoutProgress 30 (o de origem).
// O agente que escala vem em último lugar (as linhas saem pela ordem do painel.json, resposta 3). `sujo`: o nome dele leva controlos.
export const NOME_SUJO = 'crit\u0007ico-e\nx', NOME_LIMPO = 'crit ico-e x';
export const FIXTURE_C5 = (sujo = true) => [
  { nome: 'dev-a', ticket: 'T1', estado: 'dev', min: 9, checkpoint: 'dev-a.md' },
  { nome: 'dev-b', ticket: 'T2', estado: 'critico', min: 10, checkpoint: 'dev-b.md' },
  { nome: 'tester-c', ticket: 'T3', estado: 'dev', min: null, checkpoint: 'tester-c.md', papel: 'tester' },
  { nome: 'dev-d', ticket: 'T4', estado: 'main', min: 45, checkpoint: 'dev-d.md' },
  { nome: sujo ? NOME_SUJO : 'critico-e', ticket: 'T5', estado: 'reprovado', min: 31, checkpoint: 'critico-e.md', papel: 'critico' },
];
export const GOLDEN = fileURLToPath(new URL('./golden/', import.meta.url));
export const golden = (nome) => linhas(readFileSync(join(GOLDEN, nome), 'utf8'));
export const leitor = () => import(pathToFileURL(join(ROOT, 'scripts/painel-leitor.mjs')).href);

// ---- C6: check.cjs --env, com o espião e a caixa do F-20a (nenhuma ferramenta real corre, nenhuma rede além de 127.0.0.1:9) ----
export { caixa, ambiente, corre as correCheck, linha } from '../f-20a-r0/helpers.mjs';
export { existsSync, readdirSync, writeFileSync, readFileSync, mkdirSync, rmSync, spawn };