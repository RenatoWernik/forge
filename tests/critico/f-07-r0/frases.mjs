// Corpus fechado do critério 2 do F-07 (#8): frases de critério com e sem palavra absoluta, em inglês e em português, mais um
// gerador com semente fixa que faz mutações nas frases de base (inserir uma palavra absoluta, ou uma palavra que só a contém).
// Palavras absolutas (literal do contrato): never, always, any, all, every, nunca, sempre, qualquer, todos, todas, nenhum, nenhuma.
// Ficam de fora, nos dois lados, as palavras que o contrato não lista e cuja leitura é discutível (anyone, everything, todo, toda,
// quaisquer, nenhumas, all-time): nem são exigidas como absolutas nem como inocentes.
import { rng, pick } from './helpers.mjs';

export const ABS = ['never', 'always', 'any', 'all', 'every', 'nunca', 'sempre', 'qualquer', 'todos', 'todas', 'nenhum', 'nenhuma'];
// Oráculo de referência do próprio corpus (fronteira de palavra em Unicode): serve só para provar que o corpus está bem escrito.
export const hasAbs = (s) => new RegExp(`(?<![\\p{L}\\p{N}_])(?:${ABS.join('|')})(?![\\p{L}\\p{N}_])`, 'iu').test(s);

export const POS = [
  // inglês
  'The export never drops a row.',
  'Never store the token in the log',
  'The page always loads in under 2 s',
  'ALWAYS redirect to HTTPS',
  'Rejects any file over 10 MB',
  'The parser accepts any UTF-8 input.',
  'All tests pass on Windows and Linux',
  'The report lists all invoices',
  'Every request carries the CSRF header',
  'The job retries every failed upload',
  'Secrets are redacted (never printed).',
  'Logs are rotated, always.',
  'No secret leaks in any response',
  'Covers all: create, read, update, delete',
  'The banner shows on every page',
  'Nothing breaks when the queue is empty, never.',
  '"Always" means on each run',
  'Ensure that ALL rows are imported',
  // português
  'O relatório nunca perde uma linha.',
  'Nunca gravar o token no registo',
  'A página carrega sempre em menos de 2 s',
  'SEMPRE redirecionar para HTTPS',
  'Recusa qualquer ficheiro acima de 10 MB',
  'Qualquer utilizador vê o painel',
  'Todos os testes passam no Windows e no Linux',
  'O relatório lista todas as faturas',
  'Nenhum segredo aparece nos registos',
  'Nenhuma fatura fica por emitir',
  'As faturas são todas emitidas',
  'Os pedidos são, todos, auditados.',
  'O segredo não sai para o ecrã («nunca»).',
  'Não há nenhum alarme falso.',
  'Funciona com qualquer língua.',
  'TODAS as páginas têm título',
  'Nenhuma regressão: os testes passam sempre',
  'Todos: criar, ler, apagar',
];

export const NEG = [
  // inglês: palavras que só contêm os termos (as 6 do contrato primeiro) e frases sem eles
  'Install the plugin in a temp folder',
  'Many small files are merged into one',
  'The company name appears in the footer',
  'Everyday usage stays under 100 MB',
  'Allocate 2 workers per batch',
  'The alloy price is shown with 2 decimals',
  'The callback returns 200 within 3 s',
  'Nevertheless, the retry waits 5 s',
  'The overall score is 9 of 10',
  'Recall is at least 0.95 on the corpus',
  'Germany and Albany use the EU date format',
  'The firewall blocks port 23',
  'Botany samples are tagged',
  'The installer allows 3 retries',
  'Anyway, the button is disabled at 0 items',
  'The hallmark test runs in 2 s',
  'Totally 12 rows are exported for the sample file',
  'The tally shows 4 votes',
  'The ballot page loads under 2 s',
  'Severity is high for 3 of 5 cases',
  // português: «métodos» contém «todos», «sempreviva» contém «sempre» (uma fronteira \b em ASCII parte-as no acento)
  'Os métodos de pagamento aceites são 2',
  'Métodos e períodos aparecem no topo',
  'Os metodos antigos ficam marcados',
  'Uma sempreviva decora o cabeçalho',
  'O relatório mostra 3 linhas para o ficheiro de exemplo',
  'A instalação usa uma pasta temporária',
  'A companhia aparece no rodapé',
  'O total inclui IVA de 23 %',
  'Os períodos de 7 dias são agregados',
  'O botão fica desativado com 0 itens',
  'A página carrega em menos de 2 s no percentil 95',
  'Os pagamentos falhados são repetidos 3 vezes',
  'Os relatórios de 2025 são arquivados',
];

// Palavras que contêm um termo absoluto sem o serem
export const TRAPS = ['install', 'many', 'company', 'everyday', 'allocate', 'alloy', 'small', 'overall', 'nevertheless', 'anyway', 'tally', 'callback', 'firewall', 'Germany', 'ballot', 'recall', 'allows', 'hallmark', 'totally', 'métodos', 'sempreviva', 'Métodos'];
const CASES = [(w) => w, (w) => w[0].toUpperCase() + w.slice(1), (w) => w.toUpperCase()];
const WRAP = [(w) => w, (w) => `(${w})`, (w) => `«${w}»`, (w) => `"${w}"`, (w) => `${w},`, (w) => `${w}.`, (w) => `${w}:`, (w) => `${w};`];

const insert = (r, base, word) => { const ws = base.split(' '); ws.splice(Math.floor(r() * (ws.length + 1)), 0, word); return ws.join(' '); };

// Mutações do corpus: n positivas (frase inocente + palavra absoluta) e n negativas (frase inocente + armadilha), sempre as mesmas
export const generated = (n = 100, seed = 20261029) => {
  const r = rng(seed);
  const pos = [], neg = [];
  for (let i = 0; i < n; i++) {
    pos.push(insert(r, pick(r, NEG), pick(r, WRAP)(pick(r, CASES)(ABS[i % ABS.length]))));
    neg.push(insert(r, pick(r, NEG), pick(r, WRAP)(pick(r, CASES)(pick(r, TRAPS)))));
  }
  return { pos, neg };
};
