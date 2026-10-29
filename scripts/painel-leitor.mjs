// painel.json v1: the validator and the shared reader. One source in the package; the generated project gets a byte-for-byte copy.
// Pure and self-contained (no imports, no clock, no file system): text + checkpoint mtimes + "now" in, view model out.
export const ESTADOS = ['main', 'aprovado', 'critico', 'dev', 'reprovado', 'espera', 'falta']; // the fixed order of the counts
export const PAPEIS = ['dev', 'critico', 'tester', 'outro'];
export const MODOS = ['acelerado', 'rigoroso'];

const MIN = 60000;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v, min, max = Infinity) => Number.isInteger(v) && v >= min && v <= max;
const isStr = (v) => typeof v === 'string';
// a bare file name inside .checkpoints/: no separator, no drive or stream colon, no control character, not . or ..
const isNomeDeFicheiro = (v) => isStr(v) && /^[^\\/:\x00-\x1f]+$/.test(v) && v !== '.' && v !== '..';

// -> string[] of messages, each starting with the path of the field (tickets[2].estado); [] = valid. Extra fields are accepted.
export function validar(o) {
  if (!isObj(o)) return ['painel.json: must be an object'];
  const erros = [];
  const err = (path, msg) => erros.push(`${path}: ${msg}`);
  if (!isInt(o.versao, 1)) err('versao', 'must be an integer of 1 or more');
  if (o.projeto !== undefined && !isStr(o.projeto)) err('projeto', 'must be text');
  if (o.objetivo !== undefined && !isStr(o.objetivo)) err('objetivo', 'must be text');
  if (!MODOS.includes(o.modo)) err('modo', `must be one of ${MODOS.join(', ')}`);
  const lista = (campo, regras) => {
    if (!Array.isArray(o[campo])) return err(campo, 'must be a list');
    const vistos = new Set();
    o[campo].forEach((x, i) => {
      const at = `${campo}[${i}]`;
      if (!isObj(x)) return err(at, 'must be an object');
      regras(x, (k, msg) => err(`${at}.${k}`, msg));
      const chave = campo === 'tickets' ? x.id : x.nome;
      if (isStr(chave) && chave !== '') {
        if (vistos.has(chave)) err(`${at}.${campo === 'tickets' ? 'id' : 'nome'}`, `"${chave}" is repeated`);
        vistos.add(chave);
      }
    });
  };
  lista('tickets', (t, e) => {
    if (!isStr(t.id) || t.id === '') e('id', 'must be non-empty text');
    if (!isInt(t.issue, 1)) e('issue', 'must be an integer of 1 or more');
    if (!isStr(t.titulo)) e('titulo', 'must be text');
    if (!ESTADOS.includes(t.estado)) e('estado', `must be one of ${ESTADOS.join(', ')}`);
    if (!isInt(t.rondas, 0)) e('rondas', 'must be an integer of 0 or more');
  });
  lista('agentes', (a, e) => {
    if (!isStr(a.nome) || a.nome === '') e('nome', 'must be non-empty text');
    if (!PAPEIS.includes(a.papel)) e('papel', `must be one of ${PAPEIS.join(', ')}`);
    if (!isStr(a.ticket)) e('ticket', 'must be text');
    if (!isStr(a.modelo)) e('modelo', 'must be text');
    if (!isNomeDeFicheiro(a.checkpoint)) e('checkpoint', 'must be a file name inside .checkpoints/, not a path');
    if (a.porta !== undefined && !isInt(a.porta, 1, 65535)) e('porta', 'must be an integer from 1 to 65535');
  });
  return erros;
}

// The life of an agent from the age of its checkpoint, on the real elapsed time (no rounding); a future mtime counts as 0.
const vida = (mtime, agora) => {
  if (!Number.isFinite(mtime)) return { vida: 'a começar', minutos: null };
  const ms = Math.max(0, agora - mtime);
  return { vida: ms < 10 * MIN ? 'ativo' : ms < 30 * MIN ? 'sem sinal' : 'parado?', minutos: Math.floor(ms / MIN) };
};

const falha = (erro) => ({ erro, contagens: null, agentes: [] });

// texto: the content of painel.json (a leading BOM is accepted); mtimes: { <checkpoint file name>: mtime in ms }; agora: ms.
// Never throws: a missing, truncated or invalid painel.json gives { erro, contagens: null, agentes: [] }, never partial data.
export function ler(texto, mtimes = {}, agora) {
  if (!isStr(texto)) return falha('painel.json is missing');
  let o;
  try { o = JSON.parse(texto.replace(/^﻿/, '')); } catch (e) { return falha(`painel.json is not valid JSON: ${e.message}`); }
  const erros = validar(o);
  if (erros.length) return falha(erros.join('; '));
  const n = Object.fromEntries(ESTADOS.map((e) => [e, 0]));
  for (const t of o.tickets) n[t.estado]++;
  const feitos = n.main + n.aprovado;
  return {
    projeto: o.projeto, modo: o.modo, objetivo: o.objetivo ?? '',
    contagens: ESTADOS.map((e) => [e, n[e]]),
    percentagem: o.tickets.length ? Math.round((100 * feitos) / o.tickets.length) : 0,
    agentes: o.agentes.map((a) => ({ ...a, ...vida(Object.hasOwn(mtimes, a.checkpoint) ? mtimes[a.checkpoint] : undefined, agora) })),
  };
}
