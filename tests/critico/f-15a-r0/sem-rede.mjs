// Pré-carregado com NODE_OPTIONS=--import=<este ficheiro> nos processos que os ataques lançam: qualquer tentativa de rede
// (fetch, http, https, net, tls, dns) falha E fica registada em CRITICO_REDE_LOG, para que um teste que apanhe o erro e passe
// mesmo assim continue a ser detetado. Só biblioteca padrão.
import { appendFileSync } from 'node:fs';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';

const log = process.env.CRITICO_REDE_LOG;
const regista = (what, alvo) => {
  if (log) appendFileSync(log, `${process.pid} ${what} ${String(alvo ?? '').slice(0, 200)}\n`);
  return new Error('critico: tentativa de rede (' + what + ') ' + String(alvo ?? ''));
};
globalThis.fetch = async (u) => { throw regista('fetch', u?.url ?? u); };
for (const [mod, nomes] of [[http, ['request', 'get']], [https, ['request', 'get']], [net, ['connect', 'createConnection']], [tls, ['connect']], [dns, ['lookup', 'resolve', 'resolve4', 'resolve6']]]) {
  for (const n of nomes) mod[n] = (...a) => { throw regista(n, typeof a[0] === 'object' ? JSON.stringify(a[0])?.slice(0, 120) : a[0]); };
}
dns.promises.lookup = async (h) => { throw regista('dns.promises.lookup', h); };
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...a) {
  const o = a[0];
  // pipes nomeados e sockets de domínio (IPC local do Node) não são rede
  if ((o && typeof o === 'object' && o.path) || (typeof o === 'string' && isNaN(Number(o)))) return connect.apply(this, a);
  throw regista('socket.connect', typeof o === 'object' ? JSON.stringify(o) : o);
};
