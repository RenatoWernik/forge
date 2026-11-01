#!/usr/bin/env node
// Avanço automático (V-06, #130; spec #123 §4.5): depois do APROVADO do crítico, faz o merge do PR e arranca a fase seguinte, sem espera humana.
//   node scripts/avancar.mjs --pr <n> --repo <owner/repo> --modo forge|projeto [--integracao <branch>]
// Exige, para o MESMO head H do PR, o último VEREDITO (APROVADO, com HEAD e EXECUTOR) e o último CHECK-TICKET (VERDE). Faz o merge só com
// `--squash --match-head-commit H`, corre as afetadas num clone temporário do commit squash e, se estiver verde, grava e comenta a fase seguinte.
// Saída: 0 tudo ok; 1 pós-merge vermelho (abre uma issue `regressao`, não avança, nunca reverte); 2 recusa ou erro antes do merge.
// Só biblioteca padrão. O token nunca é lido: o gh usa o seu próprio ambiente, e o executor corre sem os tokens.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

class Recusa extends Error {}
const TOKENS = ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN'];
const SHA = /^[0-9a-f]{40}$/;
const MERGE = (n, repo, h) => ['pr', 'merge', String(n), '-R', repo, '--squash', '--match-head-commit', h]; // a única forma de merge: pr merge --squash --match-head-commit

const tira = (s) => {
  let r = String(s);
  for (const k of TOKENS) { const v = process.env[k]; if (v && v.length >= 8) r = r.replaceAll(v, '***'); }
  return r;
};
const diz = (s) => console.log(tira(s));

// --- as provas: comentários do PR. Uma etiqueta (VEREDITO:, HEAD:, EXECUTOR:, CHECK-TICKET:) vale em qualquer linha do comentário, depois de
// tirar o BOM, os `*` e os acentos graves, os espaços e os marcadores `>` e `-`: os críticos publicam com BOM, cabeçalho e bloco de código.
// Em caso de dúvida recusa: uma linha citada (`>`) nunca aprova (só pode reprovar) e um APROVADO seguido de texto é lido como REPROVADO. ---
const linhas = (corpo) => String(corpo).replace(/\r/g, '').split('\n').map((l) => ({ t: l.replace(/[\uFEFF*`]/g, '').replace(/^[\s>-]+/, '').trim(), citada: /^[\s\uFEFF]*>/.test(l) }));
const campo = (ls, re) => ls.filter((l) => !l.citada).map((l) => re.exec(l.t)).find(Boolean) ?? null;

// o veredito de um comentário: null (não é veredito) ou { decisao, head: prefixo de 7 a 40 hex | null, executor: sha256 | null }
function vereditoDe(body) {
  const ls = linhas(body), vs = ls.map((l) => ({ m: /^VEREDITO:\s*(APROVADO|REPROVADO)\b(.*)$/.exec(l.t), citada: l.citada })).filter((x) => x.m);
  const aprova = vs.some((x) => !x.citada && x.m[1] === 'APROVADO' && /^\s*([—–:.(-].*)?$/.test(x.m[2]));
  const reprova = vs.some((x) => x.m[1] === 'REPROVADO' || (!x.citada && x.m[1] === 'APROVADO' && !/^\s*([—–:.(-].*)?$/.test(x.m[2])));
  if (!aprova && !reprova) return null;
  return { decisao: reprova ? 'REPROVADO' : 'APROVADO', head: campo(ls, /^HEAD:\s*([0-9a-f]{7,40})\b/i)?.[1].toLowerCase() ?? null,
    executor: campo(ls, /^EXECUTOR:\s*\S+\s+([0-9a-f]{64})\b/i)?.[1] ?? null };
}

// devolve o motivo da recusa, ou null se as duas provas são do head H
export function provasDe(comentarios, h) {
  const todos = comentarios.map((k) => vereditoDe(k.body)).filter(Boolean);
  if (!todos.length) return 'sem comentário VEREDITO no PR';
  // do head H: os do HEAD que é prefixo de H e os REPROVADO sem HEAD (na dúvida valem); um APROVADO sem HEAD não é prova
  const doHead = todos.filter((v) => (v.head ? h.startsWith(v.head) : v.decisao === 'REPROVADO'));
  const v = doHead.at(-1);
  if (!v) return `nenhum VEREDITO é do head ${h}`;
  if (v.decisao !== 'APROVADO') return `o último VEREDITO do head ${h} é REPROVADO`;
  if (!v.executor) return 'o VEREDITO não tem a linha EXECUTOR: <ficheiro> <sha256>';
  const cs = comentarios.map((k) => linhas(k.body)).filter((ls) => ls.some((l) => l.t.startsWith('CHECK-TICKET:')));
  if (!cs.length) return 'sem comentário CHECK-TICKET no PR';
  const c = campo(cs.at(-1), /^CHECK-TICKET:\s*(\S+)\s+([0-9a-f]{7,40})\s+([0-9a-f]{64})\b/i);
  if (!c || c[1] !== 'VERDE') return 'o último CHECK-TICKET não é VERDE com sha e sha256 do relatório';
  if (!h.startsWith(c[2].toLowerCase())) return `o CHECK-TICKET VERDE é de outro head (${c[2]}), o head é ${h}`;
  return null;
}

// os tickets que o PR fecha: «Closes #n» (ou Fecha #n) no corpo
export const ticketsDe = (corpo) => [...String(corpo ?? '').matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|fecha(?:r|do|dos)?)\s+#(\d+)/gi)].map((m) => Number(m[1]));
// --- a fase seguinte: as issues abertas do pacote (corpo «Parte da spec #N») cujos bloqueios estão todos fechados ---
export function bloqueiosDe(corpo, pacote) {
  const itens = [];
  for (const [, resto] of String(corpo).matchAll(/\*\*Bloqueado por:\*\*([^\n]*)/g)) {
    const t = resto.replace(/\([^)]*\)/g, '').trim().replace(/\.$/, '').trim();
    if (!t || /^(—|-|nenhum|nenhuma)$/i.test(t)) continue;
    const ids = [...t.matchAll(/#(\d+)|\b([A-Za-z]+-\d+)\b/g)];
    if (!ids.length) { itens.push(null); continue; } // texto que não se entende: fica preso
    for (const [, n, id] of ids) {
      if (n) { itens.push(Number(n)); continue; }
      const alvo = pacote.filter((i) => i.title.startsWith(`${id}:`));
      itens.push(alvo.length === 1 ? alvo[0].number : null);
    }
  }
  return itens;
}

export function proximas(todas, spec, fechadas, excluidas) {
  const pacote = todas.filter((i) => new RegExp(`Parte da spec #${spec}(?!\\d)`).test(i.body ?? ''));
  const fechada = (n) => fechadas.has(n) || todas.find((i) => i.number === n)?.state === 'CLOSED';
  return pacote
    .filter((i) => i.state === 'OPEN' && !excluidas.has(i.number) && bloqueiosDe(i.body, pacote).every((n) => n !== null && fechada(n)))
    .map((i) => ({ numero: i.number, titulo: i.title })).toSorted((a, b) => a.numero - b.numero);
}

// --- processos ---
function corre(cmd, args, { cwd, input, env, timeout } = {}) {
  const r = spawnSync(cmd, args, { cwd, input, env: env ?? process.env, encoding: 'utf8', maxBuffer: 1 << 28, windowsHide: true, timeout });
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`);
  return r;
}
const gh = (args, input) => {
  const r = corre('gh', args, { input });
  if (r.status !== 0) throw new Error(tira(`gh ${args.slice(0, 2).join(' ')}: ${(r.stderr || r.stdout).trim().slice(-400)}`));
  return r.stdout;
};
const ghJson = (args) => JSON.parse(gh(args));
const git = (cwd, ...args) => {
  const r = corre('git', args, { cwd });
  if (r.status !== 0) throw new Error(tira(`git ${args[0]}: ${r.stderr.trim().slice(-400)}`));
  return r.stdout.trim();
};

function lerArgs(argv) {
  const o = { pr: null, repo: null, modo: null, integracao: null };
  const chaves = { '--pr': 'pr', '--repo': 'repo', '--modo': 'modo', '--integracao': 'integracao' };
  for (let i = 0; i < argv.length; i++) {
    const k = chaves[argv[i]];
    if (!k || i + 1 >= argv.length) throw new Recusa(`argumento desconhecido ou sem valor: ${argv[i]}`);
    o[k] = argv[++i];
  }
  if (!/^[1-9]\d*$/.test(o.pr ?? '')) throw new Recusa('--pr: número do PR');
  if (!/^[\w.-]+\/[\w.-]+$/.test(o.repo ?? '')) throw new Recusa('--repo: owner/repo');
  if (!['forge', 'projeto'].includes(o.modo)) throw new Recusa('--modo: forge ou projeto');
  if (o.modo === 'projeto' && !/^[\w][\w./-]*$/.test(o.integracao ?? '')) throw new Recusa('--modo projeto exige --integracao <branch>');
  if (o.modo === 'forge' && o.integracao) throw new Recusa('--integracao só com --modo projeto');
  o.pr = Number(o.pr);
  return o;
}

// --- o pós-merge: clone temporário do commit squash e o executor sobre os ficheiros dele; devolve { verde, resumo } ---
function posMerge(sha) {
  const origem = git(process.cwd(), 'remote', 'get-url', 'origin');
  git(process.cwd(), 'fetch', '--quiet', 'origin');
  const pasta = mkdtempSync(join(tmpdir(), 'forge-avancar-'));
  try {
    git(pasta, 'clone', '--quiet', '--no-checkout', '--', origem, '.');
    git(pasta, 'checkout', '--quiet', '--detach', sha);
    git(pasta, 'rev-parse', '--verify', `${sha}^`);
    const exec = ['scripts/executor.mjs', '.claude/executor.mjs'].find((f) => existsSync(join(pasta, f)));
    if (!exec) throw new Error('o squash não tem executor (scripts/executor.mjs ou .claude/executor.mjs)');
    const env = { ...process.env };
    for (const k of TOKENS) delete env[k];
    const corre1 = (...a) => corre(process.execPath, [exec, ...a], { cwd: pasta, env, timeout: 3600000 });
    let r = corre1('--afetadas', '--base', `${sha}^`);
    // shortcut: até o V-02 entrar o executor não conhece --afetadas (sai com 2); então corre tudo. Sai daqui quando o V-02 estiver na main.
    if (r.status === 2 && /--afetadas ainda não existe/.test(r.stderr)) r = corre1('--todas');
    const verde = r.status === 0;
    const logs = join(pasta, '.forge', 'resultados', 'logs');
    const falhas = !existsSync(logs) ? [] : readdirSync(logs).filter((n) => n.endsWith('.tap'))
      .flatMap((n) => readFileSync(join(logs, n), 'utf8').split(/\r?\n/).filter((l) => /^\s*not ok /.test(l)).map((l) => `${n}: ${l.trim()}`));
    const resumo = [`executor: saída ${r.status}`, ...r.stdout.trim().split('\n').slice(-12), ...r.stderr.trim().split('\n').slice(-6), ...falhas.slice(0, 40)].join('\n');
    return { verde, resumo: tira(resumo) };
  } finally { rmSync(pasta, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
}

// --- a fase seguinte: .forge/proxima-fase.json, stdout e comentário na issue da spec ---
const ficheiroFase = () => join(git(process.cwd(), 'rev-parse', '--show-toplevel'), '.forge', 'proxima-fase.json');
// uma fase velha nunca fica a parecer a desta corrida: se o ficheiro existe, é reescrito sem próximas e com o motivo
function invalidaFase(motivo) {
  try {
    const f = ficheiroFase();
    if (!existsSync(f)) return;
    let spec = null;
    try { spec = JSON.parse(readFileSync(f, 'utf8')).spec ?? null; } catch { /* ilegível: fica sem spec */ }
    writeFileSync(f, JSON.stringify({ spec, geradoEm: new Date().toISOString(), proximas: [], motivo: tira(motivo) }, null, 2) + '\n');
  } catch { /* sem repo ou sem permissão: não há ficheiro a invalidar */ }
}

function faseSeguinte(o, pr, padrao) {
  const tickets = new Set(ticketsDe(pr.body));
  const todas = ghJson(['issue', 'list', '-R', o.repo, '--state', 'all', '--limit', '500', '--json', 'number,title,body,state']);
  const spec = [...tickets].map((n) => todas.find((i) => i.number === n)?.body?.match(/Parte da spec #(\d+)/)?.[1]).find(Boolean);
  if (!spec) { invalidaFase('sem spec'); diz(`sem spec: o ticket do PR #${o.pr} não diz «Parte da spec #N», por isso não há fase seguinte`); return; }
  // o merge na branch por omissão fecha o ticket (o GitHub pode demorar a fechá-lo); numa integração ele fica aberto, mas já está feito
  const lista = proximas(todas, Number(spec), pr.baseRefName === padrao ? tickets : new Set(), tickets);
  const fase = { spec: Number(spec), geradoEm: new Date().toISOString(), proximas: lista };
  const f = ficheiroFase();
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify(fase, null, 2) + '\n');
  const texto = lista.length ? lista.map((p) => `- #${p.numero} ${p.titulo}`).join('\n') : 'nenhuma';
  diz(`fase seguinte (spec #${spec}):\n${texto}`);
  gh(['issue', 'comment', spec, '-R', o.repo, '--body-file', '-'], `Fase seguinte depois do merge do PR #${o.pr}:\n\n${texto}\n`);
}

export async function avancar(argv) {
  invalidaFase('em curso'); // a primeira instrução: antes dos argumentos e do gh, nenhuma recusa deixa a fase velha no disco
  try { return await executa(lerArgs(argv)); } catch (e) { invalidaFase(`${e instanceof Recusa ? 'recusa' : 'erro'}: ${e.message}`); throw e; }
}

async function executa(o) {
  const ver = (campos) => ghJson(['pr', 'view', String(o.pr), '-R', o.repo, '--json', campos]);
  const pr = ver('headRefOid,isDraft,baseRefName,state,body,comments');
  const h = String(pr.headRefOid ?? '').toLowerCase();
  if (!SHA.test(h)) throw new Recusa(`head do PR ilegível: ${pr.headRefOid}`);
  if (pr.state !== 'OPEN') throw new Recusa(`o PR #${o.pr} não está aberto (${pr.state})`);
  if (!ticketsDe(pr.body).length) throw new Recusa('PR sem Closes #n: o corpo do PR tem de fechar o ticket');
  const padrao = ghJson(['repo', 'view', o.repo, '--json', 'defaultBranchRef']).defaultBranchRef?.name;
  if (o.modo === 'projeto') {
    if (!padrao || pr.baseRefName === padrao) throw new Recusa(`modo projeto: a base do PR é a branch por omissão (${pr.baseRefName})`);
    if (pr.baseRefName !== o.integracao) throw new Recusa(`modo projeto: a base do PR (${pr.baseRefName}) não é a integração (${o.integracao})`);
  }
  const motivo = provasDe(pr.comments.map((k) => ({ body: k.body })), h);
  if (motivo) throw new Recusa(motivo);

  if (pr.isDraft) gh(['pr', 'ready', String(o.pr), '-R', o.repo]);
  try { gh(MERGE(o.pr, o.repo, h)); } catch (e) { throw new Recusa(`o gh recusou o merge de ${h}: ${e.message}`); }
  diz(`merge feito: PR #${o.pr} (${h}) na ${pr.baseRefName}`);

  // a partir daqui o merge já aconteceu: qualquer falha sai com 1 e nunca avança nem reverte
  try {
    let sha = null;
    for (let t = 0; t < 5 && !sha; t++) {
      sha = ver('mergeCommit').mergeCommit?.oid ?? null;
      if (!sha) spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 1000)']);
    }
    if (!SHA.test(sha ?? '')) throw new Error(`o gh não diz o commit squash do merge (${sha})`);
    const { verde, resumo } = posMerge(sha);
    if (!verde) {
      const corpo = `O PR #${o.pr} (https://github.com/${o.repo}/pull/${o.pr}) foi feito merge na ${pr.baseRefName} no commit ${sha} e o pós-merge ficou vermelho.\n\n`
        + `Não houve revert nem avanço para a fase seguinte.\n\n\`\`\`\n${resumo}\n\`\`\`\n`;
      invalidaFase('pós-merge vermelho');
      const criar = (...label) => ['issue', 'create', '-R', o.repo, '--title', `regressao: PR #${o.pr} partiu a ${pr.baseRefName} (${sha.slice(0, 7)})`, ...label, '--body-file', '-'];
      let url;
      // a label nunca bloqueia a abertura da issue: se o gh a recusa (não existe no repo), cria-se sem label
      try { url = gh(criar('--label', 'regressao'), corpo).trim(); } catch (e) {
        diz(`a label regressao falhou (${e.message}): issue criada sem label`);
        url = gh(criar(), corpo).trim();
      }
      diz(`PÓS-MERGE VERMELHO: ${url}\n${resumo}`);
      return 1;
    }
    gh(['pr', 'comment', String(o.pr), '-R', o.repo, '--body-file', '-'], `PÓS-MERGE VERDE ${sha}\n`);
    diz(`PÓS-MERGE VERDE ${sha}`);
    faseSeguinte(o, pr, padrao);
    return 0;
  } catch (e) {
    console.error(tira(`avancar: erro depois do merge (sem avanço): ${e.message}`));
    invalidaFase(`erro depois do merge: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  avancar(process.argv.slice(2)).then((c) => process.exit(c), (e) => {
    console.error(tira(`avancar: ${e instanceof Recusa ? 'recusa' : 'erro'}: ${e.message}`));
    process.exit(2);
  });
}

