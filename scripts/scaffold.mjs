import { readdir, readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { validarHooks, ficheirosDosHooks, juntarSettings } from './hooks.mjs';

const TEMPLATES = fileURLToPath(new URL('../templates/', import.meta.url));
// copied as is: its comments quote the marker syntax
const VERBATIM = new Set(['.claude/check.cjs']);
const LEITOR = fileURLToPath(new URL('./painel-leitor.mjs', import.meta.url));
export const LEITOR_NO_PROJETO = '.claude/painel-leitor.mjs';
const VIDA = fileURLToPath(new URL('./painel-vida.mjs', import.meta.url));
export const VIDA_NO_PROJETO = '.claude/painel-vida.mjs'; // the command that prints painel/vida (FRAMEWORK.md section 6), next to the reader it imports
const GRAVAR = fileURLToPath(new URL('./painel-gravar.mjs', import.meta.url));
export const GRAVAR_NO_PROJETO = '.claude/painel-gravar.mjs'; // the only writer of painel.json (FRAMEWORK.md section 6), next to the reader it imports
const PAINEL = '.checkpoints/painel.json';
const SETTINGS = '.claude/settings.json'; // the settings of the PROJECT; the hooks the user said yes to are joined to it, never to a global file
const MODO_DO_PAINEL = { rigorous: 'rigoroso', accelerated: 'acelerado' }; // the mode of forge.json, in the words of painel.json
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const ROLES = ['developer', 'developerUi', 'critic', 'tester', 'aux'];
const WORKFLOW_ROLES = ['developer', 'critic', 'aux']; // the roles the workflows read from args.models today
const MODES = ['rigorous', 'accelerated'];
// The escalation rules measured in the Guild; written as they are into every forge.json (the user may tune the values there).
const ESCALATION = {
  sameCriterionFailures: { value: 2, description: 'Rounds that may fail the same criterion before the orchestrator redesigns the mechanism instead of asking for another patch' },
  attacksRedOnDelivery: { value: true, description: 'A Round -1 attack that is still red when the critic runs it on the delivery makes the build workflow escalate to the orchestrator' },
  minutesWithoutProgress: { value: 30, description: 'Minutes an agent may go without progress before the orchestrator wakes it' },
  visualBelowReference: { value: true, description: 'A visual result below the reference counts as a failed criterion' },
};
const STYLE_CHARS = /[\u2013\u2014\u2192\u2600-\u27BF\u{1F300}-\u{1FAFF}]/gu; // what the plainStyle line of check.cjs refuses
const PANEL_URL = /^https:\/\/claude\.ai\/(?:code\/)?artifact\/[A-Za-z0-9_-]+$/;
const PENDING_URL = 'https://claude.ai/artifact/PANEL-URL-PENDING';
const REPO = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/; // GitHub owner/name; the owner never has dots

// Panel texts in Portuguese (Brazil); English lives in the panel page itself. Any other language comes in as answers.panelStrings.
// ponytail: one built-in translation, the rest translated by the skill at setup; move to one file per language when a third one ships
const PANEL_PT = {
  subtitle: 'Painel ao vivo dos agentes do projeto', connecting: 'conectando...', live: 'ao vivo',
  noData: 'sem conexão com os dados', lost: 'conexão perdida, recarregue a página', updated: 'atualizado',
  summary: 'Resumo', running: 'Executando', queued: 'Na fila', piecesWon: 'Peças vencidas', problem: 'Com problema', rounds: 'Rodadas de crítica', currentCp: 'Checkpoint atual',
  sddPhase: 'Fase SDD', frameworkNote: '7 peças, do passo 0 ao último',
  ph_constituicao: 'Constituição', ph_especificar: 'Especificar', ph_clarificar: 'Clarificar', ph_planejar: 'Planejar', ph_tarefas: 'Tarefas', ph_implementar: 'Implementar', ph_entregue: 'Entregue',
  fwWaiting: 'aguardando o primeiro dado', st_ativo: 'ativo', st_pausado: 'pausado', st_erro: 'erro', st_ocioso: 'ocioso',
  cpDone: '{done}/{total} concluídos', cpEmpty: 'Os checkpoints aparecem aqui assim que o plano for aprovado. Cada um passa pelo Gauntlet Ponytail antes de fechar.', pending: 'pendente',
  st_planejado: 'planejado', st_concluido: 'concluído', st_falhou: 'falhou',
  tabAll: 'Tudo', tabBuild: 'Gauntlet · Construção', loopBuild: 'Construção',
  laneRunning: 'Executando agora', laneQueued: 'Na fila', laneDone: 'Finalizados', laneFailed: 'Com problema',
  emptyRunning: 'Nenhum agente trabalhando neste momento.', emptyQueued: 'Nada na fila.', emptyDone: 'Nenhum agente finalizou ainda.', emptyFailed: 'Nenhum problema registrado.',
  roleCritic: 'Crítico', roleBuilder: 'Desenvolvedor', verdictWin: 'venceu às cegas', verdictLose: 'perdeu às cegas', noTask: 'sem tarefa atribuída', noDetails: 'Sem detalhes ainda.',
  dPiece: 'Peça', dGap: 'Maior lacuna', dResult: 'Resultado', dError: 'Erro', dNext: 'Próximo passo', dNote: 'Observação',
  colBacklog: 'A fazer', colBuilding: 'Construindo', colJudging: 'Em julgamento', colWon: 'Venceu', colFailed: 'Travado',
  piecesTitle: 'Peças de trabalho', piecesNote: 'Cada peça passa por desenvolvedor e depois crítico até vencer às cegas',
  gapLabel: 'Lacuna', barLabel: 'Barra', roundsN: '{n} rodada(s)', vd_ganhou: 'ganhou', vd_perdeu: 'perdeu',
  activity: 'Atividade', events: '{n} eventos recentes', feedEmpty: 'A atividade de cada agente aparece aqui: o que começou, o que terminou, o que deu certo e o que deu errado.',
  notesTitle: 'Para você', notesNote: 'Decisões, riscos e perguntas', notesEmpty: 'Decisões tomadas, riscos e perguntas que precisam da sua resposta aparecem aqui.',
  nk_decisao: 'Decisão', nk_risco: 'Risco', nk_pergunta: 'Pergunta para você', nk_info: 'Informação', nk_erro: 'Erro',
  inboxTitle: 'Recado para o Claude', inboxLabel: 'O Claude lê estes recados a cada checkpoint.', inboxPlaceholder: 'Ex.: prioriza o login antes do relatório', inboxSend: 'Enviar recado',
  inboxSent: 'Recado enviado.', inboxRead: 'lido pelo Claude', inboxWaiting: 'aguardando leitura', inboxReadOnly: 'Você só tem acesso de leitura a este painel.',
  inboxFail: 'Não foi possível enviar. Tente de novo em instantes.', inboxUnavailable: 'Recados indisponíveis nesta visualização.',
  agoNow: 'agora', agoMin: 'há {n} min', agoHour: 'há {n} h',
  painelTitle: 'Tickets e agentes', painelDone: 'concluído', painelGoal: 'Objetivo', painelMissing: 'Ainda sem dados do painel: falta a cópia do painel.json.', painelInvalid: 'Os dados do painel são inválidos: {erro}',
  tk_main: 'Na main', tk_aprovado: 'Aprovados', tk_critico: 'No crítico', tk_dev: 'Em desenvolvimento', tk_reprovado: 'Reprovados', tk_espera: 'Em espera', tk_falta: 'Por fazer',
  lifeStarting: 'a começar', lifeActive: 'ativo', lifeNoSignal: 'sem sinal', lifeStalled: 'parado?',
};

const templateFiles = async () => (await readdir(TEMPLATES, { recursive: true, withFileTypes: true }))
  .filter((e) => e.isFile()).map((e) => relative(TEMPLATES, join(e.parentPath, e.name)).replaceAll('\\', '/')); // parentPath: Node 20.12+, the stated minimum

const exists = (p) => access(p).then(() => true, () => false);

// Language: whatever the user types (a name in any of the common languages or in the language itself, or a BCP 47 tag) is stored as the English name plus the tag.
// The names come from the CLDR data inside Node (Intl.DisplayNames), which covers the language and region subtags of the IANA registry in use: nothing to install or keep up to date.
// ponytail: names are looked up in six display languages plus the language's own name; upgrade: add a locale to LOOKUP_LOCALES when a user's spelling is missed
const LOOKUP_LOCALES = ['en', 'pt', 'es', 'fr', 'de', 'it'];
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const displayNames = (locale, type) => new Intl.DisplayNames(locale, { type, fallback: 'none', languageDisplay: 'standard' });
const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[\s_.,-]+/g, ' ').trim();
// a well-formed tag whose language and region the data knows, in canonical case; otherwise null
const knownTag = (t) => {
  try {
    const tag = Intl.getCanonicalLocales(t)[0];
    const name = displayNames('en', 'language').of(tag);
    return name && !/Unknown/.test(name) ? tag : null;
  } catch { return null; }
};
let index; // folded name -> Set of language codes / region codes, built on first use
const nameIndex = () => {
  if (index) return index;
  const add = (map, name, code) => { if (name && !/Unknown/.test(name)) map.set(fold(name), (map.get(fold(name)) ?? new Set()).add(code)); };
  const langs = new Map(), regions = new Map(), en = displayNames('en', 'language');
  const codes = [];
  for (const a of LETTERS) for (const b of LETTERS) { codes.push(a + b); for (const c of LETTERS) codes.push(a + b + c); }
  const known = [...new Set(codes.filter((c) => en.of(c)).map((c) => Intl.getCanonicalLocales(c)[0]))]; // eng and en are one language
  const regionCodes = [...LETTERS].flatMap((a) => [...LETTERS].map((b) => (a + b).toUpperCase()));
  for (const locale of LOOKUP_LOCALES) {
    const l = displayNames(locale, 'language'), r = displayNames(locale, 'region');
    for (const c of known) add(langs, l.of(c), c);
    for (const c of regionCodes) add(regions, r.of(c), c);
  }
  for (const c of known.filter((x) => x.length === 2)) add(langs, displayNames(c, 'language').of(c), c); // the language's own name: 日本語, Deutsch, ...
  return (index = { langs, regions });
};
const only = (set) => (set?.size === 1 ? [...set][0] : null); // an ambiguous name resolves to nothing rather than to a guess

// answers -> { name, tag } or { error }
function resolveLanguage(a) {
  const say = (path, hint) => ({ error: `${path}: ${hint}` });
  const unknown = (v) => say('language', `"${v}" is not a language I recognize (write the language name in any spelling, for example English, Inglês, português (Brasil) or pt-BR)`);
  if (typeof a.language !== 'string' || !/^[\p{L}\p{N}][\p{L}\p{N} ().,_'-]{0,39}$/u.test(a.language.trim())) return unknown(a.language);
  const typed = a.language.trim();
  let tag = /^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/.test(typed) ? knownTag(typed.replace(/_/g, '-')) : null;
  if (!tag) {
    const paren = typed.match(/^(.*?)\s*\(\s*(.+?)\s*\)$/), { langs, regions } = nameIndex();
    const lang = only(langs.get(fold(paren ? paren[1] : typed)));
    const region = paren && only(regions.get(fold(paren[2])));
    tag = lang && (paren ? region && knownTag(`${lang}-${region}`) : lang);
    if (!tag) return unknown(typed);
  }
  // ponytail: the one built-in translation is Brazilian, so a bare Portuguese means pt-BR; upgrade: drop this line when a pt-PT panel ships
  if (tag === 'pt') tag = 'pt-BR';
  if (a.langTag !== undefined) {
    const t = typeof a.langTag === 'string' && knownTag(a.langTag);
    if (!t) return say('langTag', 'a BCP 47 tag whose language and region exist, such as pt-BR or es');
    if (t.split('-')[0] !== tag.split('-')[0]) return say('langTag', `${t} is not the tag of ${displayNames('en', 'language').of(tag)}`);
    tag = t;
  }
  return { name: displayNames('en', 'language').of(tag), tag };
}

// Trust boundary: these values end up in Markdown, TOML, JSON, JS and HTML, so anything outside a plain charset is refused.
function validate(a) {
  const bad = [];
  const need = (path, ok, hint) => ok || bad.push(`${path}: ${hint}`);
  const str = (v) => typeof v === 'string';
  need('projectName', str(a.projectName) && /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,59}$/u.test(a.projectName), 'letters, digits, space, dot, dash or underscore (1 to 60 characters)');
  for (const k of ['workspace', 'project']) need(`memory.${k}`, str(a.memory?.[k]) && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(a.memory[k]), 'letters, digits, dot, dash or underscore, no spaces');
  need('mode', MODES.includes(a.mode), `one of ${MODES.join(', ')}`);
  need('repo', str(a.repo) && REPO.test(a.repo), 'the GitHub repository of the project as owner/name, for example acme/billing (the ticket contracts live in its issues)');
  for (const role of ROLES) {
    const r = a.models?.[role];
    if (!r || typeof r !== 'object') { bad.push(`models.${role}: missing (model, effort and reason)`); continue; }
    need(`models.${role}.reason`, str(r.reason) && r.reason.trim() !== '', 'why this model and effort (a text that is not empty)');
    need(`models.${role}.model`, str(r.model) && /^[A-Za-z0-9][A-Za-z0-9._[\]-]{0,63}$/.test(r.model), 'a model alias or ID, for example sonnet');
    need(`models.${role}.effort`, EFFORTS.includes(r.effort), `one of ${EFFORTS.join(', ')}`);
    need(`models.${role}.label`, r.label === undefined || (str(r.label) && /^[\p{L}\p{N} ._-]{1,40}$/u.test(r.label)), 'letters, digits, space, dot, dash or underscore');
    if (str(r.model) && r.match !== undefined) {
      let ok = false;
      try { ok = new RegExp(r.match, 'i').test(`${r.model} ${r.label ?? r.model}`); } catch { /* not a regex */ }
      need(`models.${role}.match`, ok, 'a regex that accepts the model and label of the same role (check.cjs uses it)');
    }
  }
  need('script', [undefined, 'sh', 'ps'].includes(a.script), 'sh or ps');
  need('dashboardUrl', a.dashboardUrl === undefined || (str(a.dashboardUrl) && PANEL_URL.test(a.dashboardUrl)), 'a https://claude.ai/artifact/<id> URL');
  const lang = resolveLanguage(a);
  if (lang.error) bad.push(lang.error);
  bad.push(...validarHooks(a.hooks));
  const ps = a.panelStrings;
  need('panelStrings', ps === undefined || (ps && typeof ps === 'object' && Object.entries(ps).every(([k, v]) => /^\w+$/.test(k) && str(v) && v.length <= 400)), 'an object of short strings keyed like the panel texts');
  if (bad.length) throw new Error(`invalid answers:\n- ${bad.join('\n- ')}`);
  return lang;
}

function markers(a, lang) {
  const m = a.models;
  return {
    PROJECT_NAME: a.projectName,
    REPO: a.repo,
    LANGUAGE: lang.name,
    MEM_WORKSPACE: a.memory.workspace,
    MEM_PROJECT: a.memory.project,
    DASHBOARD_URL: a.dashboardUrl ?? PENDING_URL,
    SPECIFY_SCRIPT: a.script ?? 'sh',
    MODELS_JSON: JSON.stringify(m).replace(STYLE_CHARS, (c) => [...Array(c.length).keys()].map((i) => `\\u${c.charCodeAt(i).toString(16).padStart(4, '0')}`).join('')), // a reason is free text: the dash or emoji the style check forbids is written as a JSON escape
    STYLE_RULE: a.plainStyle !== false ? 'No dash, arrow or emoji in the prose of CLAUDE.md, AGENTS.md, FRAMEWORK.md and BOOTSTRAP.md. ' : '',
    LANG_TAG: lang.tag,
    PANEL_OVERRIDES: JSON.stringify(a.panelStrings ?? (/^pt(-|$)/.test(lang.tag) ? PANEL_PT : {})).replace(/</g, '\\u003c'), // safe inside <script>
    // the same tokens `node .claude/check.cjs --render` fills in the workflow meta
    ...Object.fromEntries(ROLES.map((r) => [r, `${m[r].label ?? m[r].model} ${m[r].effort}`])),
    'aux.model': m.aux.model,
  };
}

export async function scaffold(answers, { dest, dryRun = false, force = false } = {}) {
  const lang = validate(answers);
  const leitor = await readFile(LEITOR, 'utf8'); // the single source of the reader, copied as is (its text has no markers to fill)
  const vars = { ...markers(answers, lang), PAINEL_LEITOR: leitor }; // the panel page embeds it in its module script (filled in one pass, never re-scanned)
  const tree = {};
  for (const rel of await templateFiles()) {
    const text = await readFile(TEMPLATES + rel, 'utf8');
    tree[rel] = VERBATIM.has(rel) ? text : text.replace(/\{\{([\w.]+)\}\}/g, (m, k) => vars[k] ?? m);
  }
  tree['.claude/forge.json'] = JSON.stringify({ language: lang.name, langTag: lang.tag, plainStyle: answers.plainStyle !== false, mode: answers.mode, models: answers.models, escalation: ESCALATION }, null, 2) + '\n';
  tree[PAINEL] = JSON.stringify({ versao: 1, projeto: answers.projectName, modo: MODO_DO_PAINEL[answers.mode], tickets: [], agentes: [] }, null, 2) + '\n';
  tree[LEITOR_NO_PROJETO] = leitor;
  tree[VIDA_NO_PROJETO] = await readFile(VIDA, 'utf8');
  tree[GRAVAR_NO_PROJETO] = await readFile(GRAVAR, 'utf8');
  for (const [rel, from] of ficheirosDosHooks(answers.hooks)) tree[rel] = await readFile(from, 'utf8'); // only the hooks answered true; copied as is, like the reader
  const conflicts = [];
  for (const rel of Object.keys(tree)) if (await exists(join(dest, rel))) conflicts.push(rel);
  // no answer for hooks leaves settings.json alone; an answer joins it (no force needed: the user's keys and hooks stay) or, when it is not valid JSON, stops before anything is written
  const settings = answers.hooks === undefined ? null : juntarSettings(await readFile(join(dest, SETTINGS), 'utf8').catch(() => undefined), answers.hooks);
  const files = [...Object.keys(tree), ...(settings === null ? [] : [SETTINGS])];
  if (!dryRun) {
    if (conflicts.length && !force) throw new Error(`refusing to overwrite existing files (use force to replace them): ${conflicts.join(', ')}`);
    for (const [rel, text] of Object.entries(tree)) {
      if (rel === PAINEL && conflicts.includes(rel)) continue; // force never wipes the tickets and agents of a live board
      await mkdir(dirname(join(dest, rel)), { recursive: true });
      await writeFile(join(dest, rel), text);
    }
    if (settings !== null) await writeFile(join(dest, SETTINGS), settings);
  }
  return { files, conflicts };
}

// The seed of notes/n0001: the setup decisions of the project in `dest`, read back from its forge.json so the reasons shown are the ones recorded.
export async function decisionNote(dest) {
  const fj = JSON.parse((await readFile(join(dest, '.claude/forge.json'), 'utf8')).replace(/^﻿/, ''));
  const roles = ROLES.map((r) => `${r}: ${fj.models[r].label ?? fj.models[r].model} ${fj.models[r].effort}, ${fj.models[r].reason}`);
  return { kind: 'decisao', body: [`language: ${fj.language}`, `mode: ${fj.mode}`, ...roles].join('\n') };
}

// The panel URL only exists after the page is published, which needs the generated panel.html: write with the pending URL first, swap it in afterwards.
export async function setPanelUrl(dest, url) {
  if (!PANEL_URL.test(url ?? '')) throw new Error('panel URL must look like https://claude.ai/artifact/<id>');
  const changed = [];
  for (const rel of (await templateFiles()).filter((f) => !VERBATIM.has(f))) {
    const file = join(dest, rel);
    if (!(await exists(file))) continue;
    const text = await readFile(file, 'utf8');
    if (!text.includes(PENDING_URL)) continue;
    await writeFile(file, text.replaceAll(PENDING_URL, url));
    changed.push(rel);
  }
  if (!changed.length) throw new Error('no pending panel URL found in the generated files');
  return { changed };
}

const USAGE = `usage: node scaffold.mjs --dest <folder> --name <project> --language <language>
         --developer <model:effort[:label]> --critic <model:effort[:label]> --aux <model:effort[:label]>
         --workspace <ai-memory workspace> --project <ai-memory project>
         --mode <rigorous|accelerated> --repo <owner/name>
         [--script sh|ps] [--panel-url <url>] [--lang-tag <tag>] [--no-plain-style] [--answers <file.json>]
         [--dry-run] [--force]
       node scaffold.mjs --dest <folder> --set-panel-url <url>
       node scaffold.mjs --dest <folder> --decision-note
       Flags override the same keys of --answers; models are never defaulted: the user chooses them.
       The roles developerUi and tester, and the reason of every role, come only through --answers.`;

export async function main(argv, write) {
  try {
    const v = parseArgs({ args: argv, options: {
      dest: { type: 'string' }, answers: { type: 'string' }, name: { type: 'string' }, language: { type: 'string' }, 'lang-tag': { type: 'string' },
      mode: { type: 'string' }, repo: { type: 'string' }, developer: { type: 'string' }, critic: { type: 'string' }, aux: { type: 'string' }, workspace: { type: 'string' }, project: { type: 'string' },
      script: { type: 'string' }, 'panel-url': { type: 'string' }, 'set-panel-url': { type: 'string' },
      'no-plain-style': { type: 'boolean' }, 'dry-run': { type: 'boolean' }, force: { type: 'boolean' }, 'decision-note': { type: 'boolean' },
    } }).values;
    const dest = resolve(v.dest ?? '.');
    if (v['decision-note']) {
      write(JSON.stringify(await decisionNote(dest)));
      return 0;
    }
    if (v['set-panel-url']) {
      const { changed } = await setPanelUrl(dest, v['set-panel-url']);
      write(`forge scaffold: panel URL set in ${changed.length} files: ${changed.join(', ')}`);
      return 0;
    }
    const base = v.answers ? JSON.parse((await readFile(v.answers, 'utf8')).replace(/^﻿/, '')) : {};
    const models = { ...base.models };
    for (const role of WORKFLOW_ROLES) {
      if (v[role]) {
        const [m, effort, label] = v[role].split(':');
        const { reason } = base.models?.[role] ?? {}; // a flag has no room for the reason: it stays the one of the answers file
        models[role] = { model: m, effort, ...(label && { label }), ...(reason !== undefined && { reason }) };
      }
    }
    const answers = {
      ...base,
      mode: v.mode ?? base.mode, repo: v.repo ?? base.repo,
      projectName: v.name ?? base.projectName, language: v.language ?? base.language, langTag: v['lang-tag'] ?? base.langTag,
      memory: { workspace: v.workspace ?? base.memory?.workspace, project: v.project ?? base.memory?.project },
      models, script: v.script ?? base.script, dashboardUrl: v['panel-url'] ?? base.dashboardUrl,
      plainStyle: v['no-plain-style'] ? false : base.plainStyle,
    };
    const { files, conflicts } = await scaffold(answers, { dest, dryRun: v['dry-run'], force: v.force });
    const kept = v['dry-run'] ? [] : conflicts.filter((f) => f === PAINEL); // a real run keeps the board
    const replaced = conflicts.filter((f) => !kept.includes(f));
    write([`forge scaffold${v['dry-run'] ? ' (dry run, nothing written)' : ''}: ${files.length} files in ${dest}`, ...files.map((f) => `  ${f}`),
      ...(replaced.length ? [`existing files${v['dry-run'] ? ' (a real run needs --force)' : ' (replaced)'}: ${replaced.join(', ')}`] : []),
      ...(kept.length ? [`existing files (kept): ${kept.join(', ')}`] : [])].join('\n'));
    return 0;
  } catch (e) {
    write(e.exit === 1 ? e.message : `${e.message}\n${USAGE}`); // a settings.json that is not valid JSON: exit 1, nothing written
    return e.exit ?? 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2), console.log);
}
