// Ronda −1 do F-30 (#141): utilitários partilhados pelos ataques ao /forge:sync com o bloco Learned rules do projeto. Só biblioteca padrão.
// Reutiliza o sandbox e o projeto gerado do f-22a-r0 (HOME, USERPROFILE, CLAUDE_CONFIG_DIR, LOCALAPPDATA, APPDATA e XDG_* temporários; git sem
// config de sistema nem global) e o `learn` do f-22b-r0. O sync corre em processo, pelo seam do ticket: `main(['--project', dir])` de
// scripts/sync.mjs, com essas mesmas pastas no process.env. Sem rede, sem ai-memory e sem sessões claude.
//
// LEITURA DO CONTRATO (corpo da #141, sem comentários à data, 2026-11-01):
// - «o patch leva o bloco»: uma linha ACRESCENTADA do patch (começa por «+», fora dos cabeçalhos de cada ficheiro) contém «ACME», «## Learned rules»
//   ou um dos marcadores, ou é igual a uma linha não vazia do bloco que o readout escreveu no projeto (o título, o cabeçalho, as regras, «- none»
//   e o rodapé). As linhas de contexto não contam: são texto que o pacote já tem.
// - o sync tem de ter corrido: um exit 2 (erro) nunca conta como patch limpo.
// - EN e PT: a língua do projeto (English; Portuguese (Portugal), com a tradução substituta do f-01) e o SYMPTOM nessa língua. O PT passa as
//   respostas com --answers: a tradução substituta tira dos documentos a linha de onde o sync lê o repo, e sem elas o sync sai com 2.
// - C4 «nenhum patch»: nada chega ao stdout e, com --out, o ficheiro não existe ou está vazio. «nomeia o ficheiro»: uma linha do stderr, fora do
//   resumo «forge sync: N file(s) differ ...», com o nome CLAUDE.md ou AGENTS.md.
// - As respostas do projeto não têm «ACME» em nenhum valor: o nome do cliente só vem do SYMPTOM, como no #136.
import { writeFileSync, existsSync, statSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { ROOT, projeto, apaga, tmp, escreve, entrada, ficheiro, ambiente, check, linha, learn, ler, INI, FIM, SECAO, HOJE, L_BLOCO } from '../f-22b-r0/helpers.mjs';
import { ANSWERS } from '../f-01-r0/helpers.mjs';

export { ROOT, apaga, tmp, escreve, ler, check, linha, ambiente, INI, FIM, SECAO, HOJE, L_BLOCO };
export { base } from '../_comum/base.mjs';
export { soNoTicket } from '../_comum/ambito.mjs';

// O sync em processo herda o process.env: as mesmas pastas pessoais e o mesmo git sem config que os processos filhos do sandbox
const SB = ambiente();
for (const k of ['HOME', 'USERPROFILE', 'CLAUDE_CONFIG_DIR', 'LOCALAPPDATA', 'APPDATA', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'DISABLE_AUTOUPDATER', 'GIT_CONFIG_NOSYSTEM', 'GIT_CONFIG_GLOBAL', 'AI_MEMORY_URL']) process.env[k] = SB[k];

const lixo = [];
process.on('exit', () => lixo.forEach(apaga));
export const OVER = (lingua = 'en') => ({ projectName: 'Northwind Ledger', repo: 'northwind/ledger', memory: { workspace: 'northwind', project: 'ledger' }, ...(lingua === 'pt' ? { language: 'Portuguese (Portugal)' } : {}) });
export const RESPOSTAS = (lingua = 'en') => ANSWERS(OVER(lingua));
// Um projeto gerado (EN ou PT), apagado no fim do processo
export const novo = async (lingua = 'en') => { const P = await projeto(OVER(lingua)); lixo.push(P); return P; };
export const pasta = (p) => { const d = tmp(p); lixo.push(d); return d; };

// ---------- O registo e o readout ----------
export const DOCS = ['CLAUDE.md', 'AGENTS.md'];
export const SINTOMA = {
  en: (n) => `the invoice export of the ACME client dropped the VAT column (case ${n})`,
  pt: (n) => `a exportação de faturas do cliente ACME perdeu a coluna do IVA (caso ${n})`,
};
// n entradas E-001..E-00n em learnings/2026-10.md: PREVENTION text, SCOPE project, STATUS open (regras ativas do bloco), SYMPTOM com «ACME»
export const registo = (P, n, lingua = 'en', sintoma = SINTOMA[lingua]) => {
  if (n) escreve(P, 'learnings/2026-10.md', ficheiro('2026-10', Array.from({ length: n }, (_, i) => entrada(i + 1, 'text', { SCOPE: 'project', STATUS: 'open', CLASS: 'acme-vat-' + (i + 1), SYMPTOM: sintoma(i + 1) }))));
};
export const crlf = (P, docs = DOCS) => { for (const f of docs) writeFileSync(join(P, f), ler(P, f).replace(/\r?\n/g, '\r\n')); };
export const readout = (P) => { const r = learn(P, ['readout', '--today', HOJE]); assert.equal(r.status, 0, 'pré-condição: o readout falhou:\n' + r.out); };
// Acrescenta linhas do utilizador no fim de cada ficheiro, com o fim de linha dele (depois do readout, o bloco fica a meio)
export const acrescenta = (P, linhas, docs = DOCS) => {
  for (const f of docs) { const t = ler(P, f), eol = t.includes('\r\n') ? '\r\n' : '\n'; writeFileSync(join(P, f), t + (t.endsWith('\n') ? '' : eol) + eol + linhas.join(eol) + eol); }
};
// As linhas não vazias do bloco que o readout escreveu (do título ao marcador de fim), nos dois ficheiros; confirma que o bloco tem as n regras
export const blocoDoProjeto = (P, n) => {
  const todas = new Set();
  for (const f of DOCS) {
    const ls = ler(P, f).replace(/\r\n/g, '\n').split('\n'), i = ls.indexOf(SECAO), a = ls.indexOf(INI), b = ls.indexOf(FIM);
    assert.ok(i >= 0 && i < a && a < b, `pré-condição: ${f} não tem ${SECAO} seguido do bloco ${INI} … ${FIM}`);
    const corpo = ls.slice(a + 1, b);
    assert.equal(corpo.filter((l) => /^- E-\d{3} /.test(l)).length, n, `pré-condição: o bloco de ${f} não tem as ${n} regras:\n${corpo.join('\n')}`);
    if (!n) assert.ok(corpo.includes('- none'), `pré-condição: o bloco vazio de ${f} não tem «- none»`);
    for (const l of ls.slice(i, b + 1)) if (l.trim()) todas.add(l.trim());
  }
  return [...todas];
};

// ---------- O sync ----------
const { main } = await import(pathToFileURL(join(ROOT, 'scripts/sync.mjs')).href);
const RESP = pasta('critico-f30-resp-');
// sync.main(['--project', P, ...extra]): o patch é o que chega ao stdout, a saída é o stderr (LF)
export const sincroniza = async (P, { lingua = 'en', extra = [] } = {}) => {
  const args = ['--project', P, ...extra];
  if (lingua === 'pt') { const f = join(RESP, 'pt.json'); writeFileSync(f, JSON.stringify(RESPOSTAS('pt'))); args.push('--answers', f); }
  let patch = '';
  const err = [];
  const status = await main(args, (s) => { patch += s; }, (...a) => err.push(a.join(' ')));
  return { status, patch, err: err.join('\n').replace(/\r\n/g, '\n') };
};
// As linhas acrescentadas do patch (sem o «+»), fora dos cabeçalhos de cada ficheiro (de «diff --git» até ao primeiro «@@»)
export const acrescentadas = (patch) => {
  const out = [];
  let cab = false;
  for (const l of patch.replace(/\r\n/g, '\n').split('\n')) {
    if (l.startsWith('diff --git ')) { cab = true; continue; }
    if (l.startsWith('@@')) { cab = false; continue; }
    if (!cab && l.startsWith('+')) out.push(l.slice(1));
  }
  return out;
};
export const ficheirosDoPatch = (patch) => [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]);
export const correu = (r) => {
  assert.notEqual(r.status, 2, 'o sync saiu com 2 (erro): não há patch para avaliar:\n' + r.err.slice(-1500));
  assert.match(r.err, /^forge sync: /m, 'o sync não escreveu o resumo «forge sync: ...»:\n' + r.err.slice(-1500));
};
const PROIBIDO = ['ACME', SECAO, INI, FIM];
export const esperaSemBloco = (r, bloco = []) => {
  correu(r);
  const mas = acrescentadas(r.patch).filter((l) => PROIBIDO.some((p) => l.includes(p)) || bloco.includes(l.trim()));
  assert.deepEqual(mas, [], `o patch leva o bloco Learned rules do projeto (ficheiros do patch: ${ficheirosDoPatch(r.patch).join(', ') || 'nenhum'})`);
};

// ---------- C4: bloco mal formado ----------
// Tira de um só ficheiro a linha de um marcador (o outro ficheiro fica com o bloco bem formado)
export const tiraMarcador = (P, f, marcador) => {
  const t = ler(P, f), sem = t.replace(new RegExp('^[ \\t]*' + marcador.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[ \\t]*\\r?\\n', 'm'), '');
  assert.ok(t.includes(marcador) && !sem.includes(marcador), `pré-condição: ${f} devia ter o marcador ${marcador} uma vez`);
  writeFileSync(join(P, f), sem);
};
export const esperaRecusa = (r, f, saida) => {
  assert.equal(r.status, 3, `um bloco mal formado em ${f} sai com 3 (saiu com ${r.status}):\n` + r.err.slice(-1500));
  assert.equal(r.patch, '', 'um bloco mal formado não dá patch, mas o sync escreveu um no stdout');
  if (saida) assert.ok(!existsSync(saida) || statSync(saida).size === 0, 'um bloco mal formado não dá patch, mas o sync escreveu-o no --out');
  const nomeia = r.err.split('\n').filter((l) => l.includes(f) && !l.startsWith('forge sync: '));
  assert.ok(nomeia.length, `nenhuma mensagem do sync (fora do resumo «forge sync: ...») nomeia ${f}:\n` + r.err.slice(-1500));
};

// ---------- C5: um projeto novo gerado a partir do pacote com o patch ----------
// Copia scripts/ e templates/ do pacote para uma pasta nova com git, aplica o patch com git apply e devolve a pasta
export const pacoteCom = (patch) => {
  const pkg = pasta('critico-f30-pkg-');
  for (const d of ['scripts', 'templates']) cpSync(join(ROOT, d), join(pkg, d), { recursive: true });
  const git = (...a) => spawnSync('git', ['-c', 'core.autocrlf=false', ...a], { cwd: pkg, encoding: 'utf8', env: ambiente() });
  assert.equal(git('init', '-q').status, 0, 'pré-condição: git init no pacote copiado');
  if (patch) {
    writeFileSync(join(pkg, 'c1.patch'), patch);
    const r = git('apply', '--whitespace=nowarn', 'c1.patch');
    assert.equal(r.status, 0, 'pré-condição: o git apply do patch do sync falhou no pacote copiado:\n' + r.stderr);
  }
  return pkg;
};
export const geraDe = async (pkg, lingua = 'en') => {
  const { scaffold } = await import(pathToFileURL(join(pkg, 'scripts/scaffold.mjs')).href);
  const dest = pasta('critico-f30-novo-');
  await scaffold(RESPOSTAS(lingua), { dest });
  return dest;
};