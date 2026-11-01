// Ronda −1 do V-06 (#130, spec #123 §4.5): o gh falso dos ataques. Nunca chama o gh real nem a rede: serve o cenário em JSON e regista o argv.
// Como chega ao avancar: o helpers.mjs põe à frente no PATH uma pasta com gh.exe (uma cópia do node.exe; em POSIX, um sh `gh` que corre
// `node gh-falso.mjs "$@"`), tira do PATH as pastas do gh real e põe NODE_OPTIONS=--import=<este ficheiro>. Num processo gh este módulo
// faz de gh e sai antes de o node procurar o «script»; em qualquer outro processo node (o avancar, o executor, os testes) só regista o
// argv em node-argv.jsonl, onde o C4 procura o token.
// Estado em $FORGE_GH_FALSO_DIR: cenario.json (só leitura) e chamadas.jsonl (uma linha por chamada: argv, código, efeitos e corpos lidos).
// Servido (o resto sai com 2 e «gh falso: não suportado», incluindo --jq, --template e api graphql):
//   pr view|ready|merge|comment · issue view|list|create|comment · repo view · auth status|token
//   api repos/{o}/{r}[/pulls/N[/merge]|/issues[/N[/comments|/dependencies/blocked_by|/dependencies/blocking|/sub_issues|/parent]]]
import { appendFileSync, existsSync, readFileSync, writeSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = process.env.FORGE_GH_FALSO_DIR;

class Falha extends Error { constructor(msg, codigo = 1) { super(msg); this.codigo = codigo; } }
const naoSuportado = (o) => new Falha(`gh falso: não suportado: ${o}`, 2);

function escreve(fd, s) {
  const b = Buffer.from(s);
  for (let o = 0; o < b.length;) { try { o += writeSync(fd, b, o); } catch (e) { if (e.code !== 'EAGAIN') throw e; } }
}
const out = (s) => escreve(1, s);
const json = (v) => out(JSON.stringify(v, null, 2) + '\n');

// --- estado: o cenário mais os efeitos das chamadas anteriores ---
const lerChamadas = () => {
  const f = join(DIR, 'chamadas.jsonl');
  return existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
};
function estado(C) {
  const ef = lerChamadas().flatMap((c) => c.efeitos);
  const merge = ef.find((e) => e.tipo === 'merge') ?? null;
  return {
    merge,
    isDraft: !!C.pr.isDraft && !ef.some((e) => e.tipo === 'pronto'),
    novos: ef.filter((e) => e.tipo === 'comentario'),
    criadas: ef.filter((e) => e.tipo === 'issue'),
    fecha: new Set(merge && merge.base === C.padrao && C.pr.ticket ? [C.pr.ticket] : []),
  };
}
const url = (C, n) => `https://github.com/${C.repo}/${n === C.pr.number ? 'pull' : 'issues'}/${n}`;
const num = (x) => { const m = String(x).match(/(\d+)\/?$/); return m ? Number(m[1]) : NaN; };

function issuesTodas(C, S) {
  return [
    ...C.issues.map((i) => ({ ...i, state: S.fecha.has(i.number) ? 'CLOSED' : i.state })),
    ...S.criadas.map((e) => ({ number: e.number, title: e.title, body: e.corpo, state: 'OPEN', labels: e.labels, bloqueadoPor: [], pai: null })),
  ];
}
const prComoIssue = (C, S) => ({ number: C.pr.number, title: C.pr.title, body: C.pr.body, state: S.merge ? 'CLOSED' : 'OPEN', labels: [],
  bloqueadoPor: [], pai: null, pr: true });
function acha(C, S, n) {
  const i = [...issuesTodas(C, S), prComoIssue(C, S)].find((x) => x.number === n);
  if (!i) throw new Falha(`GraphQL: Could not resolve to an issue or pull request with the number of ${n}. (repository.issue)`);
  return i;
}
function comentarios(C, S, n) {
  const base = (C.comentarios[String(n)] ?? []).map((k, i) => ({ id: n * 100 + i, autor: k.autor, corpo: k.corpo, em: k.em }));
  return [...base, ...S.novos.filter((e) => e.alvo === n).map((e) => ({ id: e.id, autor: 'conta-falsa', corpo: e.corpo, em: e.em }))];
}
const gqlComentario = (C, n) => (k) => ({ id: `IC_${k.id}`, author: { login: k.autor }, authorAssociation: 'OWNER', body: k.corpo, createdAt: k.em,
  includesCreatedEdit: false, isMinimized: false, minimizedReason: '', reactionGroups: [], url: `${url(C, n)}#issuecomment-${k.id}`, viewerDidAuthor: true });
const restComentario = (C, n) => (k) => ({ id: k.id, user: { login: k.autor }, body: k.corpo, created_at: k.em, updated_at: k.em,
  html_url: `${url(C, n)}#issuecomment-${k.id}`, author_association: 'OWNER' });

// --- os campos do --json (os nomes do gh real; um campo desconhecido sai com 1, como no gh) ---
function seleciona(campos, lista) {
  const r = {};
  for (const k of lista.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (!(k in campos)) throw new Falha(`Unknown JSON field: "${k}"\nAvailable fields:\n  ${Object.keys(campos).sort().join('\n  ')}`);
    r[k] = typeof campos[k] === 'function' ? campos[k]() : campos[k];
  }
  return r;
}
function prCampos(C, S) {
  const P = C.pr;
  return {
    number: P.number, title: P.title, body: P.body, url: url(C, P.number), id: `PR_falso${P.number}`,
    state: S.merge ? 'MERGED' : 'OPEN', closed: !!S.merge, isDraft: S.isDraft, headRefOid: P.head, headRefName: P.headRefName,
    baseRefName: P.baseRefName, isCrossRepository: false, headRepositoryOwner: { login: C.repo.split('/')[0] },
    mergeCommit: S.merge ? { oid: S.merge.sha } : null, mergedAt: S.merge?.em ?? null, closedAt: S.merge?.em ?? null,
    mergeable: S.merge ? 'UNKNOWN' : 'MERGEABLE', mergeStateStatus: S.merge ? 'UNKNOWN' : S.isDraft ? 'DRAFT' : 'CLEAN',
    author: { login: 'conta-falsa', is_bot: false }, labels: [], assignees: [], reviewDecision: '', reviews: [], latestReviews: [],
    statusCheckRollup: [], createdAt: '2026-11-01T08:00:00Z', updatedAt: '2026-11-01T09:30:00Z',
    comments: () => comentarios(C, S, P.number).map(gqlComentario(C, P.number)),
    closingIssuesReferences: P.ticket ? [{ id: `I_falso${P.ticket}`, number: P.ticket, url: url(C, P.ticket),
      repository: { id: 'R_falso', name: C.repo.split('/')[1], owner: { id: 'U_falso', login: C.repo.split('/')[0] } } }] : [],
  };
}
const issueCampos = (C, S, i) => ({
  number: i.number, title: i.title, body: i.body, state: i.state, closed: i.state === 'CLOSED', url: url(C, i.number), id: `I_falso${i.number}`,
  labels: i.labels.map((name) => ({ id: `LA_${name}`, name, description: '', color: 'ededed' })), assignees: [], milestone: null,
  author: { login: 'conta-falsa', is_bot: false }, createdAt: '2026-11-01T08:00:00Z', updatedAt: '2026-11-01T09:30:00Z',
  closedAt: i.state === 'CLOSED' ? '2026-11-01T09:00:00Z' : null, stateReason: i.state === 'CLOSED' ? 'COMPLETED' : '',
  comments: () => comentarios(C, S, i.number).map(gqlComentario(C, i.number)),
});
function issueRest(C, S, i) {
  const todas = issuesTodas(C, S);
  const de = i.bloqueadoPor.map((n) => todas.find((x) => x.number === n)).filter(Boolean);
  const bloqueia = todas.filter((x) => x.bloqueadoPor.includes(i.number));
  const filhos = todas.filter((x) => x.pai === i.number);
  return {
    id: i.number, node_id: `I_falso${i.number}`, number: i.number, title: i.title, body: i.body, state: i.state.toLowerCase(),
    state_reason: i.state === 'CLOSED' ? 'completed' : null, labels: i.labels.map((name) => ({ name })), html_url: url(C, i.number),
    user: { login: 'conta-falsa' }, comments: comentarios(C, S, i.number).length, created_at: '2026-11-01T08:00:00Z',
    closed_at: i.state === 'CLOSED' ? '2026-11-01T09:00:00Z' : null,
    issue_dependencies_summary: { blocked_by: de.filter((x) => x.state === 'OPEN').length, total_blocked_by: de.length,
      blocking: bloqueia.filter((x) => x.state === 'OPEN').length, total_blocking: bloqueia.length },
    sub_issues_summary: { total: filhos.length, completed: filhos.filter((x) => x.state === 'CLOSED').length,
      percent_completed: filhos.length ? Math.round((100 * filhos.filter((x) => x.state === 'CLOSED').length) / filhos.length) : 0 },
    ...(i.pr ? { pull_request: { url: url(C, i.number), html_url: url(C, i.number), merged_at: S.merge?.em ?? null } } : {}),
  };
}
function prRest(C, S) {
  const P = C.pr;
  return { id: P.number, number: P.number, title: P.title, body: P.body, state: S.merge ? 'closed' : 'open', draft: S.isDraft,
    merged: !!S.merge, merge_commit_sha: S.merge?.sha ?? null, merged_at: S.merge?.em ?? null, html_url: url(C, P.number),
    head: { sha: P.head, ref: P.headRefName }, base: { ref: P.baseRefName }, user: { login: 'conta-falsa' } };
}

// --- as flags (as do gh real, por subcomando; uma flag desconhecida sai com 1, como no gh) ---
function opcoes(args, { valores = [], bools = [], alias = {} } = {}) {
  const V = new Set(['--repo', ...valores]), B = new Set(bools), A = { '-R': '--repo', ...alias };
  const pos = [], fl = new Map();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { pos.push(...args.slice(i + 1)); break; }
    if (!a.startsWith('-') || a === '-') { pos.push(a); continue; }
    let nome = a, valor;
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq > 2) { nome = a.slice(0, eq); valor = a.slice(eq + 1); }
    nome = A[nome] ?? nome;
    if (B.has(nome)) valor ??= true;
    else if (V.has(nome)) { if (valor === undefined) { if (i + 1 >= args.length) throw new Falha(`flag needs an argument: ${a}`); valor = args[++i]; } }
    else throw new Falha(`unknown flag: ${a}`);
    if (!fl.has(nome)) fl.set(nome, []);
    fl.get(nome).push(valor);
  }
  return { pos, tem: (k) => fl.has(k), um: (k) => fl.get(k)?.at(-1), todos: (k) => fl.get(k) ?? [] };
}
function confereRepo(C, o) {
  const r = o.um('--repo');
  if (r !== undefined && r.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '') !== C.repo)
    throw new Falha(`GraphQL: Could not resolve to a Repository with the name '${r}'. (repository)`);
}
function corpo(o) {
  if (o.tem('--body')) return o.um('--body');
  const f = o.um('--body-file');
  if (f === undefined) return null;
  return f === '-' ? readFileSync(0, 'utf8') : readFileSync(resolve(f), 'utf8');
}
const COMENTAR = { valores: ['--body', '--body-file'], bools: ['--edit-last', '--create-if-none', '--yes', '--web'], alias: { '-b': '--body', '-F': '--body-file', '-w': '--web' } };
const VER = { valores: ['--json'], bools: ['--comments', '--web'], alias: { '-c': '--comments', '-w': '--web' } };

function comenta(C, S, reg, n, texto) {
  acha(C, S, n);
  if (texto == null || texto === '') throw new Falha('gh falso: falta --body ou --body-file');
  const id = 900000 + lerChamadas().length;
  const e = { tipo: 'comentario', alvo: n, id, corpo: texto, em: new Date().toISOString() };
  reg.efeitos.push(e);
  return e;
}
function criaIssue(C, S, reg, title, texto, labels) {
  if (!title || texto == null) throw new Falha('must provide `--title` and `--body` when not running interactively');
  for (const l of labels) if (!C.rotulos.includes(l)) throw new Falha(`could not add label: '${l}' not found`);
  const e = { tipo: 'issue', number: 9500 + S.criadas.length, title, corpo: texto, labels };
  reg.efeitos.push(e);
  return e;
}
// o squash na origem: commit-tree com a árvore do head real e pai na ponta da base; recusa um --match-head-commit diferente do head real
function fazMerge(C, S, reg, { esperado, titulo }) {
  const P = C.pr;
  if (S.merge) throw new Falha(`X Pull request #${P.number} (${P.title}) was already merged`);
  if (esperado !== undefined && esperado !== P.headReal) {
    reg.efeitos.push({ tipo: 'merge-recusado', esperado });
    throw new Falha('GraphQL: Head branch was modified. Review and try the merge again. (mergePullRequest)');
  }
  const env = { ...process.env, GIT_AUTHOR_NAME: 'gh-falso', GIT_AUTHOR_EMAIL: 'gh-falso@example.invalid', GIT_COMMITTER_NAME: 'gh-falso',
    GIT_COMMITTER_EMAIL: 'gh-falso@example.invalid' };
  const g = (...a) => {
    const r = spawnSync('git', ['--git-dir', C.origem, ...a], { encoding: 'utf8', env });
    if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  };
  const ref = `refs/heads/${P.baseRefName}`, antes = g('rev-parse', ref), arvore = g('rev-parse', `${P.headReal}^{tree}`);
  const sha = g('commit-tree', arvore, '-p', antes, '-m', `${titulo ?? P.title} (#${P.number})`);
  g('update-ref', ref, sha, antes);
  const e = { tipo: 'merge', sha, base: P.baseRefName, antes, em: new Date().toISOString() };
  reg.efeitos.push(e);
  return e;
}

function textoDe(campos) {
  return `title:\t${campos.title}\nstate:\t${campos.state}\nauthor:\tconta-falsa\nlabels:\t${(campos.labels ?? []).map((l) => l.name).join(', ')}\n`
    + `number:\t${campos.number}\nurl:\t${campos.url}\n--\n${campos.body}\n`;
}
function textoComentarios(lista) {
  return lista.map((k) => `author:\t${k.author.login}\nassociation:\towner\nedited:\tfalse\nstatus:\tnone\n--\n${k.body}\n--\n`).join('');
}

function pr(C, s, args, reg) {
  const S = estado(C), P = C.pr;
  const alvo = (o) => {
    const x = o.pos[0];
    if (x === undefined) throw new Falha('gh falso: indica o número do PR');
    if (num(x) !== P.number && x !== P.headRefName) throw new Falha(`GraphQL: Could not resolve to a PullRequest with the number of ${x}. (repository.pullRequest)`);
    return P.number;
  };
  if (s === 'view') {
    const o = opcoes(args, VER);
    confereRepo(C, o); alvo(o);
    if (o.tem('--web')) throw naoSuportado('--web');
    const campos = prCampos(C, S);
    if (o.tem('--json')) { json(seleciona(campos, o.um('--json'))); return 0; }
    out(textoDe(campos) + (o.tem('--comments') ? textoComentarios(campos.comments()) : ''));
    return 0;
  }
  if (s === 'ready') {
    const o = opcoes(args, { bools: ['--undo'] });
    confereRepo(C, o); alvo(o);
    if (o.tem('--undo')) throw naoSuportado('pr ready --undo');
    if (S.merge) throw new Falha(`X Pull request #${P.number} is closed. Only draft pull requests can be marked as "ready for review"`);
    if (!S.isDraft) { escreve(2, `! Pull request #${P.number} is already "ready for review"\n`); return 0; }
    reg.efeitos.push({ tipo: 'pronto' });
    escreve(2, `✓ Pull request #${P.number} is marked as "ready for review"\n`);
    return 0;
  }
  if (s === 'merge') {
    const o = opcoes(args, { valores: ['--match-head-commit', '--subject', '--body', '--body-file', '--author-email'],
      bools: ['--squash', '--merge', '--rebase', '--admin', '--auto', '--delete-branch', '--disable-auto'],
      alias: { '-s': '--squash', '-m': '--merge', '-r': '--rebase', '-d': '--delete-branch', '-t': '--subject', '-b': '--body', '-F': '--body-file', '-A': '--author-email' } });
    confereRepo(C, o); alvo(o);
    fazMerge(C, S, reg, { esperado: o.um('--match-head-commit'), titulo: o.um('--subject') });
    return 0;
  }
  if (s === 'comment') {
    const o = opcoes(args, COMENTAR);
    confereRepo(C, o);
    const e = comenta(C, S, reg, alvo(o), corpo(o));
    out(`${url(C, P.number)}#issuecomment-${e.id}\n`);
    return 0;
  }
  throw naoSuportado(`pr ${s}`);
}

function aplicaBusca(lista, q) {
  let em = null;
  for (const tok of q.match(/"[^"]*"|\S+/g) ?? []) {
    const t = tok.replace(/^"|"$/g, '');
    const m = t.match(/^(is|state|label|in|repo|sort|type):(.*)$/i);
    if (!m) { const w = t.toLowerCase(); lista = lista.filter((i) => (em === 'title' ? i.title : em === 'body' ? i.body : `${i.title}\n${i.body}`).toLowerCase().includes(w)); continue; }
    const [, k, v0] = m, v = v0.replace(/^"|"$/g, '').toLowerCase();
    if ((k === 'is' || k === 'state') && (v === 'open' || v === 'closed')) lista = lista.filter((i) => i.state.toLowerCase() === v);
    else if (k === 'is' && v === 'pr') lista = [];
    else if (k === 'label') lista = lista.filter((i) => i.labels.some((l) => l.toLowerCase() === v));
    else if (k === 'in') em = v;
  }
  return lista;
}

function issue(C, s, args, reg) {
  const S = estado(C);
  if (s === 'view') {
    const o = opcoes(args, VER);
    confereRepo(C, o);
    if (o.pos[0] === undefined) throw new Falha('gh falso: indica o número da issue');
    const campos = issueCampos(C, S, acha(C, S, num(o.pos[0])));
    if (o.tem('--json')) { json(seleciona(campos, o.um('--json'))); return 0; }
    out(textoDe(campos) + (o.tem('--comments') ? textoComentarios(campos.comments()) : ''));
    return 0;
  }
  if (s === 'list') {
    const o = opcoes(args, { valores: ['--label', '--state', '--search', '--limit', '--json', '--assignee', '--author', '--milestone', '--mention', '--app'],
      bools: ['--web'], alias: { '-l': '--label', '-s': '--state', '-S': '--search', '-L': '--limit', '-a': '--assignee', '-A': '--author', '-m': '--milestone' } });
    confereRepo(C, o);
    let l = issuesTodas(C, S);
    const st = (o.um('--state') ?? 'open').toLowerCase();
    if (st !== 'all') l = l.filter((i) => i.state.toLowerCase() === st);
    for (const lab of o.todos('--label').flatMap((x) => x.split(',')).map((x) => x.trim()).filter(Boolean)) l = l.filter((i) => i.labels.includes(lab));
    if (o.tem('--search')) l = aplicaBusca(l, o.um('--search'));
    l = l.toSorted((a, b) => b.number - a.number).slice(0, Number(o.um('--limit') ?? 30));
    if (o.tem('--json')) { json(l.map((i) => seleciona(issueCampos(C, S, i), o.um('--json')))); return 0; }
    out(l.map((i) => `${i.number}\t${i.state}\t${i.title}\t${i.labels.join(', ')}\t2026-11-01T09:30:00Z\n`).join(''));
    return 0;
  }
  if (s === 'create') {
    const o = opcoes(args, { valores: ['--title', '--body', '--body-file', '--label', '--assignee', '--milestone', '--project'], bools: ['--web'],
      alias: { '-t': '--title', '-b': '--body', '-F': '--body-file', '-l': '--label', '-a': '--assignee', '-m': '--milestone', '-p': '--project' } });
    confereRepo(C, o);
    const labels = o.todos('--label').flatMap((x) => x.split(',')).map((x) => x.trim()).filter(Boolean);
    const e = criaIssue(C, S, reg, o.um('--title'), corpo(o), labels);
    out(`${url(C, e.number)}\n`);
    return 0;
  }
  if (s === 'comment') {
    const o = opcoes(args, COMENTAR);
    confereRepo(C, o);
    if (o.pos[0] === undefined) throw new Falha('gh falso: indica o número da issue');
    const n = num(o.pos[0]);
    const e = comenta(C, S, reg, n, corpo(o));
    out(`${url(C, n)}#issuecomment-${e.id}\n`);
    return 0;
  }
  throw naoSuportado(`issue ${s}`);
}

function poe(campos, kv, tipado) {
  const i = kv.indexOf('=');
  if (i < 1) throw new Falha(`field "${kv}" requires a value separated by an '=' sign`);
  const k = kv.slice(0, i);
  let v = kv.slice(i + 1);
  if (tipado) {
    if (v.startsWith('@')) v = readFileSync(v === '@-' ? 0 : resolve(v.slice(1)), 'utf8');
    else if (v === 'true' || v === 'false' || v === 'null') v = JSON.parse(v);
    else if (/^-?\d+$/.test(v)) v = Number(v);
  }
  if (k.endsWith('[]')) (campos[k.slice(0, -2)] ??= []).push(v);
  else campos[k] = v;
}

function api(C, args, reg) {
  const o = opcoes(args, { valores: ['--method', '--field', '--raw-field', '--input', '--header', '--hostname', '--cache', '--preview'],
    bools: ['--paginate', '--include', '--silent', '--slurp', '--verbose'],
    alias: { '-X': '--method', '-F': '--field', '-f': '--raw-field', '-H': '--header', '-i': '--include', '-p': '--preview' } });
  let ep = o.pos[0];
  if (!ep) throw new Falha('gh falso: api sem endpoint');
  if (ep === 'graphql') throw naoSuportado('api graphql');
  const campos = {};
  for (const kv of o.todos('--raw-field')) poe(campos, kv, false);
  for (const kv of o.todos('--field')) poe(campos, kv, true);
  let dados = Object.keys(campos).length ? campos : null;
  if (o.tem('--input')) { const f = o.um('--input'); dados = JSON.parse(f === '-' ? readFileSync(0, 'utf8') : readFileSync(resolve(f), 'utf8')); }
  const metodo = (o.um('--method') ?? (dados ? 'POST' : 'GET')).toUpperCase();
  const [dono, nome] = C.repo.split('/');
  ep = ep.replace(/^\//, '').replaceAll('{owner}', dono).replaceAll('{repo}', nome);
  const [caminho, qs = ''] = ep.split('?');
  const q = new URLSearchParams(qs);
  if (metodo === 'GET' && dados) for (const [k, v] of Object.entries(dados)) q.set(k, String(v));
  const m = caminho.match(/^repos\/([^/]+\/[^/]+)(?:\/(.*))?$/);
  if (!m) throw naoSuportado(`api ${metodo} ${caminho}`);
  if (m[1] !== C.repo) throw new Falha('gh: Not Found (HTTP 404)');
  const r = (m[2] ?? '').replace(/\/$/, ''), S = estado(C), rota = (re) => r.match(re);
  const todas = o.tem('--paginate'), pp = Number(q.get('per_page') ?? 30), pg = Number(q.get('page') ?? 1);
  const pagina = (l) => (todas ? l : l.slice((pg - 1) * pp, pg * pp));
  let x, res;
  if (r === '' && metodo === 'GET') res = { id: 1, full_name: C.repo, name: nome, owner: { login: dono }, default_branch: C.padrao, private: true, html_url: `https://github.com/${C.repo}` };
  else if ((x = rota(/^pulls\/(\d+)$/)) && metodo === 'GET') { if (+x[1] !== C.pr.number) throw new Falha('gh: Not Found (HTTP 404)'); res = prRest(C, S); }
  else if ((x = rota(/^pulls\/(\d+)\/merge$/)) && metodo === 'PUT') {
    if (+x[1] !== C.pr.number) throw new Falha('gh: Not Found (HTTP 404)');
    const e = fazMerge(C, S, reg, { esperado: dados?.sha, titulo: dados?.commit_title });
    res = { sha: e.sha, merged: true, message: 'Pull Request successfully merged' };
  } else if ((x = rota(/^pulls\/(\d+)\/(comments|reviews)$/)) && metodo === 'GET') res = [];
  else if (r === 'issues' && metodo === 'GET') {
    const st = q.get('state') ?? 'open', labs = (q.get('labels') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const l = [...issuesTodas(C, S), prComoIssue(C, S)]
      .filter((i) => st === 'all' || i.state.toLowerCase() === st).filter((i) => labs.every((lab) => i.labels.includes(lab)))
      .toSorted((a, b) => b.number - a.number);
    res = pagina(l).map((i) => issueRest(C, S, i));
  } else if (r === 'issues' && metodo === 'POST') {
    const e = criaIssue(C, S, reg, dados?.title, dados?.body, dados?.labels ?? []);
    res = issueRest(C, { ...S, criadas: [...S.criadas, e] }, { number: e.number, title: e.title, body: e.corpo, state: 'OPEN', labels: e.labels, bloqueadoPor: [], pai: null });
  } else if ((x = rota(/^issues\/(\d+)$/)) && metodo === 'GET') res = issueRest(C, S, acha(C, S, +x[1]));
  else if ((x = rota(/^issues\/(\d+)\/comments$/)) && metodo === 'GET') res = pagina(comentarios(C, S, acha(C, S, +x[1]).number).map(restComentario(C, +x[1])));
  else if ((x = rota(/^issues\/(\d+)\/comments$/)) && metodo === 'POST') {
    const e = comenta(C, S, reg, +x[1], dados?.body);
    res = restComentario(C, +x[1])({ id: e.id, autor: 'conta-falsa', corpo: e.corpo, em: e.em });
  } else if ((x = rota(/^issues\/(\d+)\/dependencies\/(blocked_by|blocking)$/)) && metodo === 'GET') {
    const i = acha(C, S, +x[1]), t = issuesTodas(C, S);
    const l = x[2] === 'blocked_by' ? i.bloqueadoPor.map((n) => t.find((y) => y.number === n)).filter(Boolean) : t.filter((y) => y.bloqueadoPor.includes(i.number));
    res = pagina(l).map((y) => issueRest(C, S, y));
  } else if ((x = rota(/^issues\/(\d+)\/sub_issues$/)) && metodo === 'GET') {
    const i = acha(C, S, +x[1]);
    res = pagina(issuesTodas(C, S).filter((y) => y.pai === i.number)).map((y) => issueRest(C, S, y));
  } else if ((x = rota(/^issues\/(\d+)\/parent$/)) && metodo === 'GET') {
    const i = acha(C, S, +x[1]);
    if (!i.pai) throw new Falha('gh: Not Found (HTTP 404)');
    res = issueRest(C, S, acha(C, S, i.pai));
  } else throw naoSuportado(`api ${metodo} ${caminho}`);
  if (!o.tem('--silent')) json(o.tem('--slurp') ? [res] : res);
  return 0;
}

function despacha(C, argv, reg) {
  if (argv.some((a) => ['--jq', '-q', '--template'].includes(a) || a.startsWith('--jq=') || a.startsWith('--template=')))
    throw naoSuportado('--jq/--template (usa --json e faz o parse no script)');
  const [g, s, ...resto] = argv;
  if (g === 'pr') return pr(C, s, resto, reg);
  if (g === 'issue') return issue(C, s, resto, reg);
  if (g === 'api') return api(C, [s, ...resto].filter((a) => a !== undefined), reg);
  if (g === 'repo' && s === 'view') {
    const o = opcoes(resto, { valores: ['--json', '--branch'], bools: ['--web'], alias: { '-b': '--branch', '-w': '--web' } });
    if (o.pos[0] !== undefined && o.pos[0].replace(/^https:\/\/github\.com\//, '') !== C.repo) throw new Falha(`GraphQL: Could not resolve to a Repository with the name '${o.pos[0]}'. (repository)`);
    const [dono, nome] = C.repo.split('/');
    const campos = { nameWithOwner: C.repo, name: nome, owner: { id: 'U_falso', login: dono }, url: `https://github.com/${C.repo}`,
      defaultBranchRef: { name: C.padrao }, isPrivate: true, viewerPermission: 'ADMIN', id: 'R_falso', description: '' };
    if (o.tem('--json')) json(seleciona(campos, o.um('--json')));
    else out(`name:\t${C.repo}\ndescription:\t\n--\n`);
    return 0;
  }
  if (g === 'auth' && (s === 'status' || s === 'token')) {
    opcoes(resto, { valores: ['--hostname', '--user'], bools: ['--show-token', '--active'], alias: { '-h': '--hostname', '-u': '--user', '-t': '--show-token', '-a': '--active' } });
    if (s === 'token') out(`${process.env.GH_TOKEN ?? ''}\n`);
    else escreve(2, 'github.com\n  ✓ Logged in to github.com account conta-falsa (GH_TOKEN)\n');
    return 0;
  }
  throw naoSuportado(argv.slice(0, 2).join(' ') || '(sem argumentos)');
}

function principal(argv) {
  const C = JSON.parse(readFileSync(join(DIR, 'cenario.json'), 'utf8'));
  const reg = { t: new Date().toISOString(), argv, cwd: process.cwd(), codigo: 0, efeitos: [] };
  let codigo;
  try { codigo = despacha(C, argv, reg); }
  catch (e) { escreve(2, `${e instanceof Falha ? e.message : `gh falso: erro interno: ${e.stack}`}\n`); codigo = e instanceof Falha ? e.codigo : 1; }
  reg.codigo = codigo;
  appendFileSync(join(DIR, 'chamadas.jsonl'), JSON.stringify(reg) + '\n');
  return codigo;
}

const comoGh = /^gh(\.exe)?$/i.test(basename(process.execPath));
const direto = !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (comoGh || direto) {
  // gh.exe: o node resolveu o 1.º argumento como caminho do «script» (cwd/pr); desfaz-se para «pr»
  const argv = !comoGh ? process.argv.slice(2) : process.argv[1] ? [relative(process.cwd(), process.argv[1]), ...process.argv.slice(2)] : [];
  if (!DIR) { escreve(2, 'gh falso: falta FORGE_GH_FALSO_DIR (o env do avancar não chegou ao gh)\n'); process.exit(1); }
  process.exit(principal(argv));
} else if (DIR) {
  try { appendFileSync(join(DIR, 'node-argv.jsonl'), JSON.stringify({ argv: process.argv, execArgv: process.execArgv }) + '\n'); } catch {}
}