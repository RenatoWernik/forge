// Ronda −1 do F-06 (#7): utilitários partilhados pelos ataques. Só biblioteca padrão.
// ADIANTADA: escrita antes de o F-05 (#6) entrar na main. Os ficheiros que dependem da saída do F-05 dizem-no no topo.
// Nunca toca na config real nem deixa lixo: no import cria UMA pasta temporária; HOME, USERPROFILE e CLAUDE_CONFIG_DIR apontam
// para <pasta>/home e TMP, TEMP e TMPDIR para <pasta>/tmp (também nos processos filhos). Tudo o que os ataques criam fica dentro
// dela, e ela é apagada no after() e, de reserva, no exit. Nenhum ataque abre uma sessão `claude` real.
//
// Contrato: a #7 com as respostas do orquestrador às 7 PERGUNTAS (comentário de 2026-10-29), que estes ataques seguem:
//   - resposta 2: os 4 briefs são `.claude/briefs/<papel>.md`; o papel sai do nome do ficheiro (ROLE_BY_NAME), cada papel uma vez;
//   - resposta 1: os literais são verificados na saída do scaffold, antes da tradução, contra o template em inglês, nas duas
//     línguas do corpus e nos dois modos (cada cláusula aceita também o literal português do ticket, por exemplo VEREDITO, que
//     um template em inglês não usa); as linhas do check.cjs são verificadas no projeto «traduzido» com o mesmo substituto do
//     scripts/corpus.test.mjs, aplicado também ao AGENTS.md (F-05), aos 4 briefs e ao .checkpoints/README.md;
//   - resposta 3: os critérios 1 a 4 e a regra das sessões são verificados por UMA linha, chamada `briefs`; nos critérios 1, 3 e 4
//     e na regra das sessões, a linha FAIL diz qual o brief (o nome do ficheiro) e qual a regra em falta (BRIEF_RULES);
//   - «a linha X» do check.cjs = a linha cujo nome é X ou começa por «X:» ou «X (»: o detalhe é livre.
import { after } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename, extname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

// O ambiente real, antes de o sandbox o trocar: os ataques de página do F-12 gerem o ambiente deles (Chrome com o USERPROFILE real)
export const REAL_ENV = (() => { const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; return env; })();
const WORK = mkdtempSync(join(tmpdir(), 'critico-f06-'));
const HOME = join(WORK, 'home'), TMP = join(WORK, 'tmp');
mkdirSync(HOME); mkdirSync(TMP);
for (const k of ['HOME', 'USERPROFILE', 'CLAUDE_CONFIG_DIR']) process.env[k] = HOME;
for (const k of ['TMP', 'TEMP', 'TMPDIR']) process.env[k] = TMP;
const cleanup = () => { try { rmSync(WORK, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* o exit volta a tentar */ } };
after(cleanup);
process.on('exit', cleanup);
export const WORK_DIR = WORK;

let n = 0;
export const tmp = (prefix = 'd') => { const d = join(WORK, `${prefix}${++n}`); mkdirSync(d); return d; };

// Sem NODE_TEST_CONTEXT: herdado, um `node --test` filho fala o protocolo interno do runner e sai com 0 mesmo a falhar
export const sandboxEnv = () => { const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; return env; };

export const BRIEFS_DIR = '.claude/briefs';
export const README = '.checkpoints/README.md';
export const DOCS = ['CLAUDE.md', 'AGENTS.md', 'FRAMEWORK.md', 'BOOTSTRAP.md'];
export const ROLES = ['dev', 'critic', 'roundMinus1', 'batch'];
// Papel pelo nome do ficheiro; a Ronda −1 é testada primeiro (o nome dela pode ter «critic»)
const ROLE_BY_NAME = [
  ['roundMinus1', /round[-_ ]?(minus|m)[-_ ]?1|round[-_ ]?[−-]1|ronda[-_ ]?(menos|m)?[-_ ]?[−-]?1|minus[-_ ]?1|attacks?|ataques?/i],
  ['critic', /critic|cr[ií]tico|judge/i],
  ['dev', /\bdev|developer|desenvolvedor|builder/i],
  ['batch', /batch|lote|tester|integration/i],
];
export const roleOf = (file) => (ROLE_BY_NAME.find(([, re]) => re.test(basename(file, '.md'))) ?? [])[0];

const MODELS = () => ({
  developer: { model: 'haiku', effort: 'xhigh', label: 'Dev Logic 1.0', reason: 'logic and server code' },
  developerUi: { model: 'opus', effort: 'high', label: 'Dev UI 2.0', reason: 'rich UI' },
  critic: { model: 'opus', effort: 'high', label: 'Judge 3.0', match: 'opus', reason: 'the critic stays on Opus' },
  tester: { model: 'haiku', effort: 'xhigh', label: 'Tester 4.0', reason: 'the batch suite is mechanical work' },
  aux: { model: 'sonnet', effort: 'medium', reason: 'panel records only' },
});
// `repo` é a pergunta de setup do F-05; antes dele o scaffold ignora a chave
export const ANSWERS = (over = {}) => ({
  projectName: 'Acme Billing', language: 'English', mode: 'rigorous', plainStyle: true, repo: 'acme-org/billing',
  models: MODELS(), memory: { workspace: 'acme', project: 'billing' }, ...over,
});
export const ANSWERS_PT = (over = {}) => ANSWERS({ projectName: 'Clube do Livro', language: 'Portuguese (Brazil)', ...over });
// As 4 combinações língua × modo que os ataques percorrem
export const COMBOS = [
  ['en-rigorous', ANSWERS({ mode: 'rigorous' })], ['en-accelerated', ANSWERS({ mode: 'accelerated' })],
  ['pt-rigorous', ANSWERS_PT({ mode: 'rigorous' })], ['pt-accelerated', ANSWERS_PT({ mode: 'accelerated' })],
];

export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));
export const loadScaffold = () => import(pathToFileURL(join(ROOT, 'scripts/scaffold.mjs')).href);

// O mesmo substituto da tradução que o scripts/corpus.test.mjs usa em e083b6a (passo de tradução da skill new-project)
const LINE_PT = 'Esta parte descreve o que o agente faz para cada peça, com o teste e a evidência que não podem faltar.';
const NATURAL = { '## Step 8': '## Etapa 8', '## 5. Checkpoint script': '## 5. Script do checkpoint', '## 1. Roles and models': '## 1. Funções e modelos' };
export const translatePt = (text) => {
  let fence = false;
  return text.split(/\r?\n/).map((l) => {
    if (/^\s*```/.test(l)) { fence = !fence; return l; }
    if (fence || !l.trim() || /^[|\s:-]+$/.test(l)) return l;
    if (l.startsWith('#')) return NATURAL[l] ?? l.replace(/^(#{2,} )(\d+\. )?.*$/, '$1$2Seção');
    return l.match(/^\s*(?:[-*] |\d+\. |> |\| )?/)[0] + LINE_PT + (l.includes('Verifies:') ? ' Verifica: ' : ' ') + (l.match(/`[^`]*`/g) ?? []).join(' ');
  }).join('\n');
};

const read = (dest, rel) => (existsSync(join(dest, rel)) ? readFileSync(join(dest, rel), 'utf8') : undefined);
export const briefFiles = (dest) => {
  const dir = join(dest, BRIEFS_DIR);
  return existsSync(dir) ? readdirSync(dir).filter((f) => extname(f) === '.md').sort().map((f) => `${BRIEFS_DIR}/${f}`) : [];
};
// papel -> caminho relativo do brief; lança se não houver exatamente 4, um por papel
export const briefsByRole = (dest) => {
  const files = briefFiles(dest);
  const by = {};
  for (const f of files) { const r = roleOf(f); if (r) (by[r] ??= []).push(f); }
  const bad = ROLES.filter((r) => by[r]?.length !== 1).map((r) => `${r}: ${JSON.stringify(by[r] ?? [])}`);
  const orphans = files.filter((f) => !roleOf(f));
  if (files.length !== 4 || bad.length || orphans.length) {
    throw new Error(`${BRIEFS_DIR}/ tem de ter os 4 briefs, um por papel (ficheiros: ${JSON.stringify(files)}; papéis mal resolvidos: ${bad.join('; ') || 'nenhum'}; sem papel: ${JSON.stringify(orphans)})`);
  }
  return Object.fromEntries(ROLES.map((r) => [r, by[r][0]]));
};

// Gera o projeto numa pasta temporária. `raw` = os ficheiros como o scaffold os escreveu (antes da tradução), por caminho relativo.
// Em português aplica o substituto da tradução aos documentos, aos briefs e ao .checkpoints/README.md.
export const generate = async (answers) => {
  const { scaffold } = await loadScaffold();
  const dest = tmp('proj');
  await scaffold(answers, { dest });
  const fj = readJson(join(dest, '.claude/forge.json'));
  const rels = [...DOCS, ...briefFiles(dest), README];
  const raw = Object.fromEntries(rels.map((d) => [d, read(dest, d)]));
  if (/^pt/i.test(fj.langTag)) for (const d of rels) if (raw[d] !== undefined) writeFileSync(join(dest, d), translatePt(raw[d]));
  return { dest, fj, raw };
};

export const check = (cwd, args = []) => {
  const r = spawnSync(process.execPath, ['.claude/check.cjs', ...args], { cwd, encoding: 'utf8', env: sandboxEnv(), timeout: 240000 });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
// As linhas cujo nome é `prefix` ou começa por `prefix:` ou `prefix (`: [{ state, text }]
export const linesOf = (out, prefix) => out.split(/\r?\n/).map((l) => l.match(/^(ok|FAIL) {2,4}(.*)$/))
  .filter((m) => m && (m[2] === prefix || m[2].startsWith(prefix + ':') || m[2].startsWith(prefix + ' ('))).map((m) => ({ state: m[1], text: m[2] }));
// "FAIL" se alguma dessas linhas falha, "ok" se existem e estão todas ok, undefined se não há nenhuma
export const lineState = (out, prefix) => {
  const ls = linesOf(out, prefix).map((x) => x.state);
  return !ls.length ? undefined : ls.includes('FAIL') ? 'FAIL' : 'ok';
};
export const fails = (out) => out.split(/\r?\n/).filter((l) => l.startsWith('FAIL')).map((l) => l.slice(0, 400)).join('\n');

// Resposta 3: o que a linha FAIL `briefs` tem de dizer, por regra (oráculo finito de palavras, em inglês ou em português)
export const BRIEF_RULES = {
  hook: /CONTEXT WARNING|\bhook\b|\bwarning\b|\baviso\b/i,
  kill: /\bkill|taskkill|killall|pkill|\bPID\b|\bprocess|\bmatar\b|\bprocesso/i,
  foreground: /foreground|background|run_in_background|primeiro plano|segundo plano/i,
  checkpoint: /checkpoint/i,
  contract: /gh issue view|\bcontract\b|\bcontrato\b|\bissue\b/i,
  sessions: /\bsessions?\b|\bsess(ão|ões)\b|claude -p|\breal\b/i,
};
// Há exatamente uma linha `briefs` (resposta 3: «é uma só»)?
export const oneBriefsLine = (out) => linesOf(out, 'briefs').length === 1;
// A linha `briefs` falha, o check.cjs sai com 1 e a linha FAIL nomeia o brief (nome do ficheiro, com ou sem .md) e a regra
export const briefsFailNames = (r, file, rule) => {
  const base = basename(file, '.md').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const named = new RegExp(`(^|[^\\w-])${base}(\\.md)?($|[^\\w-])`, 'i');
  return r.status === 1 && linesOf(r.out, 'briefs').some((x) => x.state === 'FAIL' && named.test(x.text) && BRIEF_RULES[rule].test(x.text));
};

export const edit = (dest, rel, fn) => {
  const f = join(dest, rel);
  const before = readFileSync(f, 'utf8');
  const after = fn(before);
  if (after === before) throw new Error(`a mutação não mudou ${rel}`);
  writeFileSync(f, after);
};

// ---------------------------------------------------------------------------------------------------------------------------
// O oráculo: a tabela literal das cláusulas. Uma cláusula está presente quando TODOS os seus padrões casam com o texto do brief.
// Os padrões são as palavras do ticket (#7 e a adenda 6499805500) e da spec (#1), na forma inglesa do template ou no literal
// português do contrato. A redação é livre (fora da barra) desde que estes literais lá estejam.
// ---------------------------------------------------------------------------------------------------------------------------
const lit = (s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

// Critério 1: o aviso do hook, todo nas primeiras 5 linhas
export const HOOK = [
  /CONTEXT WARNING/, /CRITICAL/,
  /orchestrator|orquestrador/i,
  /\b(never|not|no)\b[^\n]{0,80}\b(stop|reason to stop|halt|pause)|\b(ignore|ignora)\b|\bnunca\b[^\n]{0,80}\bpar(e|es|ar|em)\b/i,
];
export const HOOK_LINES = 5;
export const hookAtTop = (text) => {
  const top = text.split(/\r?\n/).slice(0, HOOK_LINES).join('\n');
  return HOOK.every((re) => re.test(top));
};

// Critério 2: as cláusulas de cada brief
export const CLAUSES = {
  critic: {
    'materialidade com os 3 critérios': [
      /materiality|materialidade/i,
      /always[- ]fails?|fails? always|always[- ]rejects?|reprova sempre/i,
      /(goal|objective|purpose|intent)\b[^.\n]{0,20}\bcriteri(on|a)|criterion'?s (goal|objective|purpose)|objetivo do crit[ée]rio/i,
      /reproducib\w*|reproduz\w*/i, /oracle|or[áa]culo/i,
    ],
    'a lista do que é MENOR': [
      /\bMINOR\b|\bMENOR(ES)?\b/, /cosmetic|cosm[ée]tic/i, /literal (reading|read)|read(ing)? literally|leitura literal/i,
      /ambigu/i, /\b(own|your)\b[^.\n]{0,10}\battacks?\b|pr[óo]prio ataque|teu ataque/i,
    ],
    'o formato do veredito': [
      /\bVERDICT\b|\bVEREDITO\b/, /\bBLOCKING\b|\bBLOCKERS\b|\bBLOQUEANTES\b/, /\bMINOR\b|\bMENORES\b/,
      /QUESTIONS (TO|FOR|ON|ABOUT) THE BAR|BAR QUESTIONS|PERGUNTAS À BARRA/, /\bFOLLOW-?UPS?\b|\bSEGUIMENTO\b/,
    ],
    'R1 exaustiva e rondas seguintes curtas': [
      /\bR1\b|\bround 1\b|\bfirst round\b|\bronda 1\b/i, /exhaustive|exaustiv/i,
      /(later|following|subsequent|next|other)\s+rounds\b[^.\n]{0,100}\b(short|only)\b|rondas seguintes[^.\n]{0,60}(curtas|s[óo])/i,
    ],
  },
  roundMinus1: {
    '«exatamente o oráculo, sem acrescentar exigências»': [
      /exactly\b[^.\n]{0,20}\boracles?|exatamente o or[áa]culo/i,
      /(without|never|no|not)\s+add\w*\b[^.\n]{0,40}\b(requirements?|demands?|exig\w+)|sem acrescentar exig/i,
    ],
    'LACUNAS DA BARRA': [/BAR GAPS|GAPS (IN|OF|ON) THE BAR|LACUNAS DA BARRA/],
    'provar que os ataques falham na base': [
      /\b(prove|show|confirm|demonstrate)\w*\b[^.\n]{0,80}\b(fails?|failing|red)\b|prov\w*[^.\n]{0,80}(falh|vermelh)/i,
      /\bbase\b|\bmain\b|before the code|antes do c[óo]digo/i,
    ],
    'não editar código do produto': [
      /(do not|don't|never|not)\s+(edit|change|touch|modify|write)\w*\b[^.\n]{0,40}\b(product|production)\b[^.\n]{0,10}\bcode|n[ãa]o edit\w*[^.\n]{0,20}c[óo]digo do produto/i,
    ],
  },
  dev: {
    'correção por classe com um teste da classe': [
      /(fix|correct)\w*\b[^.\n]{0,60}\bby class|\bclass of inputs|corre\w*\b[^.\n]{0,30}por classe/i,
      /\btest\b[^.\n]{0,20}\bclass\b|teste da classe/i,
    ],
    '/ponytail-review com Must fix e Should fix corrigidos antes de entregar': [
      lit('/ponytail-review'), /Must fix/i, /Should fix/i,
      /before (you )?(deliver|hand)|before (the )?(delivery|handing)|antes de entregar/i,
    ],
    'os ataques da Ronda −1 a verde': [/Round [−-]1|Ronda [−-]1/i, /attacks?\b[^.\n]{0,80}\bgreen\b|ataques[^.\n]{0,80}verde/i],
    '«o contrato ganha ao ataque»': [/contract wins|contrato ganha/i],
    'a Ronda 0': [/\bRound 0\b|\bRonda 0\b/i],
  },
  batch: {
    'fusão aditiva': [/additiv\w*|aditiv\w*/i, /\bmerg\w*|fus[ãa]o/i],
    'a regra dos flaky': [/flaky/i, /isolated|isolad/i, /\bdiff\b/i],
    'a regressão volta à peça que a causou': [
      /regressions?\b[^.\n]{0,120}\b(piece|ticket)\b[^.\n]{0,20}\b(that )?caused|regress\w*[^.\n]{0,80}pe[çc]a que a causou/i,
    ],
    'nenhum push, PR ou merge sem o sim do utilizador': [
      // numa só linha: push, PR, merge, o utilizador e a negação
      /^(?=.*\bpush\b)(?=.*\bPRs?\b)(?=.*\bmerge\b)(?=.*\b(user|utilizador|usu[áa]rio)\b)(?=.*\b(never|no|not|without|nunca|sem|nenhum)\b).*$/im,
    ],
  },
};

// Critério 3: as regras operacionais, em todos os briefs
export const OPS = {
  'nunca matar processos por nome, só por PID': [lit('taskkill /IM'), lit('killall'), lit('pkill'), /\bPID\b/],
  'testes em primeiro plano, blocos de até 9 min, nunca run_in_background': [
    /foreground|primeiro plano/i, /\b9\s*min(utes)?\b|\b540\s*s\b/i, lit('run_in_background'),
  ],
  'checkpoint em .checkpoints/ depois de cada etapa': [lit('.checkpoints/'), /after (each|every)\s+(step|stage)|depois de cada etapa/i],
};

// Critério 4: o contrato é a issue GitHub
export const CONTRACT = {
  'lido com gh issue view <n> --json body,comments': [/gh issue view <n> [^`\n]*--json body,comments/],
  'o corpo da issue mais os comentários do orquestrador': [
    /\bbody\b|\bcorpo\b/i,
    /orchestrator'?s?\b[^.\n]{0,30}\bcomments|comments\b[^.\n]{0,30}\borchestrator|coment[áa]rios do orquestrador/i,
  ],
  'os comentários dos críticos são só contexto': [
    /critics?'?s?\b[^.\n]{0,20}\bcomments\b[^.\n]{0,60}\bcontext|coment[áa]rios dos cr[íi]ticos[^.\n]{0,40}contexto/i,
  ],
  'uma dúvida vira um comentário PERGUNTA na issue': [/\bQUESTION\b|\bPERGUNTA\b/, /\bcomment|coment[áa]rio/i],
};

// Adenda 6499805500: a regra das sessões Claude reais, em todos os briefs
export const SESSIONS = {
  'só subagentes do orquestrador; nenhuma janela ou sessão claude nova': [
    /subagents?\b[^.\n]{0,80}\borchestrator|orchestrator\b[^.\n]{0,80}\bsubagents?|subagentes?[^.\n]{0,80}orquestrador/i,
    /(new|another|separate|second)\s+(`?claude`?\s+)?(window|session)|(janela|sess[ãa]o)\s+(`?claude`?\s+)?nova|nova (janela|sess[ãa]o)/i,
  ],
  'ataques e testes sempre com o claude falso ou o runtime falso': [
    /fake\b[^.\n]{0,15}(`?claude`?|runtime)|(`?claude`?|runtime)[^.\n]{0,5}\bfals[oa]\b/i,
  ],
  'sessão real só como objeto de teste, na verificação final, uma vez por ticket, só crítico ou tester': [
    /object of (a |the )?test|test object|under test|objeto de teste/i,
    /final (verification|check)|verifica[çc][ãa]o final/i,
    /once (per|a|for each|for every) (ticket|piece)|uma vez por (ticket|pe[çc]a)/i,
    /\b(critics?|cr[íi]ticos?)\b[^.\n]{0,30}\b(or|and|ou|e)\b[^.\n]{0,15}\btesters?\b|\btesters?\b[^.\n]{0,15}\b(or|and|ou|e)\b[^.\n]{0,30}\b(critics?|cr[íi]ticos?)\b/i,
  ],
  'headless e curta, claude -p ou claude plugin validate, DISABLE_AUTOUPDATER=1, Haiku, ≤ 3 chamadas, nunca bypass, nunca morta a meio, registada no checkpoint': [
    /headless/i, lit('claude -p'), lit('claude plugin validate'), lit('DISABLE_AUTOUPDATER=1'), /haiku/i,
    /\b(3|three)\b[^.\n]{0,30}\bcalls\b|(at most|no more than|max(imum)?|up to)\s+(3|three)\b|no m[áa]ximo 3/i,
    /bypass/i,
    /(never|do not|don't)\s+(kill|stop|interrupt|abort)\w*\b[^.\n]{0,40}\b(mid|middle|halfway|half-way|partway|before it (ends|finishes))|wait (for it )?(to|until it) (finish|end)|\ba meio\b/i,
    /(record|log|register|note|write)\w*\b[^.\n]{0,60}\bcheckpoint|regist\w*[^.\n]{0,40}checkpoint/i,
  ],
};

export const missing = (text, table) => Object.entries(table).filter(([, res]) => !res.every((re) => re.test(text ?? ''))).map(([k]) => k);

// Neutraliza uma cláusula: troca cada ocorrência de cada padrão por «qq», para que nenhum literal dela fique no brief
export const neutralize = (text, res) => res.reduce((t, re) => t.replace(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'), 'qq'), text);

export const loadCorpus = (kind) => {
  const dir = join(ROOT, 'scripts/corpus', kind);
  const names = existsSync(dir) ? readdirSync(dir).filter((f) => extname(f) === '.json').sort() : [];
  return names.map((f) => ({ name: basename(f, '.json'), value: readJson(join(dir, f)) }));
};
