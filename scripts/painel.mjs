// Command line to update .checkpoints/painel.json; the file always stays valid, and applying one operation twice gives the same file.
//   node painel.mjs ticket <painel.json> --id=T-01 --issue=11 --titulo=... --estado=dev --rondas=0     define (create or replace) a ticket
//   node painel.mjs agente <painel.json> --nome=... --papel=dev --ticket=T-01 --modelo=... --checkpoint=x.md [--porta=4801]
//   node painel.mjs remover-agente <painel.json> --nome=...
//   node painel.mjs objetivo <painel.json> --texto=...
// Exit 0 when applied; exit 1 with the reason on stderr when refused (the file is then untouched). A missing painel.json is created.
import { readFileSync, writeFileSync, renameSync, unlinkSync, openSync, closeSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validar } from './painel-leitor.mjs';

const LOCK_MS = 5000;
const RETRY = ['EEXIST', 'EPERM', 'EACCES', 'EBUSY']; // Windows reports a file being deleted by another process as EPERM or EACCES
const dorme = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const num = (s) => (/^-?\d+$/.test(s) ? Number(s) : s); // anything else stays text, and the validator refuses it

export const bloqueio = (file) => `${file}.lock`;

// the key=value pairs each command accepts, as the object it defines
const OPS = {
  ticket: { chaves: ['id', 'issue', 'titulo', 'estado', 'rondas'], aplica: (o, a) => poe(o.tickets, 'id', { id: a.id, issue: num(a.issue), titulo: a.titulo, estado: a.estado, rondas: num(a.rondas) }) },
  agente: { chaves: ['nome', 'papel', 'ticket', 'modelo', 'checkpoint', 'porta'], aplica: (o, a) => poe(o.agentes, 'nome', { nome: a.nome, papel: a.papel, ticket: a.ticket, modelo: a.modelo, checkpoint: a.checkpoint, ...(a.porta !== undefined && { porta: num(a.porta) }) }) },
  'remover-agente': { chaves: ['nome'], aplica: (o, a) => { o.agentes = o.agentes.filter((x) => x.nome !== a.nome); } },
  objetivo: { chaves: ['texto'], aplica: (o, a) => { o.objetivo = a.texto; } },
};
const poe = (lista, k, x) => { const i = lista.findIndex((y) => y[k] === x[k]); i < 0 ? lista.push(x) : (lista[i] = x); };

function bloquear(lock) {
  const fim = Date.now() + LOCK_MS;
  for (;;) {
    try { return closeSync(openSync(lock, 'wx')); } catch (e) {
      if (!RETRY.includes(e.code)) throw e;
      if (Date.now() >= fim) throw new Error(`${lock} is held by another process (if none is writing, delete it)`);
      dorme(25);
    }
  }
}

function renomear(de, para) {
  for (let i = 0; ; i++) {
    try { return renameSync(de, para); } catch (e) { if (i >= 50 || !RETRY.includes(e.code)) throw e; dorme(20); }
  }
}

// Applies one operation under the lock; throws (with the file untouched) when the file or the result is invalid.
export function aplicar(ficheiro, comando, args) {
  const op = OPS[comando];
  if (!op) throw new Error(`unknown command "${comando}" (use ${Object.keys(OPS).join(', ')})`);
  const fora = Object.keys(args).filter((k) => !op.chaves.includes(k));
  if (fora.length) throw new Error(`${comando}: unknown option ${fora.map((k) => '--' + k).join(', ')}`);
  const file = resolve(ficheiro), tmp = `${file}.${process.pid}.tmp`;
  mkdirSync(dirname(file), { recursive: true });
  bloquear(bloqueio(file));
  try {
    let o = { versao: 1, modo: 'rigoroso', tickets: [], agentes: [] }; // the skeleton of a missing file
    let texto;
    try { texto = readFileSync(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (texto !== undefined) {
      try { o = JSON.parse(texto.replace(/^﻿/, '')); } catch (e) { throw new Error(`${file} is not valid JSON, left untouched: ${e.message}`); }
      const erros = validar(o);
      if (erros.length) throw new Error(`${file} is invalid, left untouched:\n${erros.join('\n')}`);
    }
    op.aplica(o, args);
    const erros = validar(o);
    if (erros.length) throw new Error(`refused, the file is untouched:\n${erros.join('\n')}`);
    writeFileSync(tmp, JSON.stringify(o, null, 2) + '\n'); // UTF-8, no BOM, LF; the rename makes it atomic
    renomear(tmp, file);
  } finally {
    rmSync(tmp, { force: true });
    unlinkSync(bloqueio(file));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [comando, ficheiro, ...resto] = process.argv.slice(2);
    if (!ficheiro) throw new Error(`usage: node painel.mjs <${Object.keys(OPS).join('|')}> <painel.json> [--chave=valor ...]`);
    const args = Object.create(null);
    for (const a of resto) {
      const m = /^--([a-z]+)=([\s\S]*)$/.exec(a);
      if (!m) throw new Error(`${comando}: expected --chave=valor, got "${a.slice(0, 40)}"`);
      args[m[1]] = m[2];
    }
    aplicar(ficheiro, comando, args);
  } catch (e) {
    console.error(`forge painel: ${e.message}`);
    process.exitCode = 1;
  }
}
