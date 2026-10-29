// Critério 4: as portas em escuta são lidas de saídas reais de netstat (inglês e «ESCUTA»), lsof e ss.
// Oráculo: as saídas literais abaixo (formato real de cada ferramenta, com as armadilhas de cada uma) e o conjunto esperado.
// Armadilhas: o porto do endereço externo (0, 443, *), ligações ESTABLISHED/TIME_WAIT/CLOSE_WAIT, IPv6 entre parênteses retos,
// o mesmo porto em IPv4 e IPv6 (conta uma vez), o cabeçalho, %interface no ss, CRLF do Windows, linhas em branco.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, rng, pick } from './helpers.mjs';

const NETSTAT_EN = [
  '',
  'Active Connections',
  '',
  '  Proto  Local Address          Foreign Address        State           PID',
  '  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1696',
  '  TCP    0.0.0.0:445            0.0.0.0:0              LISTENING       4',
  '  TCP    0.0.0.0:5040           0.0.0.0:0              LISTENING       2000',
  '  TCP    127.0.0.1:4801         0.0.0.0:0              LISTENING       15232',
  '  TCP    127.0.0.1:4801         127.0.0.1:50612        ESTABLISHED     15232',
  '  TCP    127.0.0.1:50612        127.0.0.1:4801         ESTABLISHED     9876',
  '  TCP    192.168.1.20:51544     140.82.112.21:443      ESTABLISHED     7744',
  '  TCP    192.168.1.20:51600     13.107.42.14:443       TIME_WAIT       0',
  '  TCP    192.168.1.20:139       0.0.0.0:0              LISTENING       4',
  '  TCP    [::]:135               [::]:0                 LISTENING       1696',
  '  TCP    [::]:445               [::]:0                 LISTENING       4',
  '  TCP    [::1]:5173             [::]:0                 LISTENING       20480',
  '  TCP    [::1]:5173             [::1]:51700            ESTABLISHED     20480',
  '  TCP    [fe80::1c2d:3e4f:5a6b:7c8d%12]:2869  [::]:0   LISTENING       4',
  '',
].join('\r\n');
const NETSTAT_EN_PORTAS = [135, 139, 445, 2869, 4801, 5040, 5173];

const NETSTAT_PT = [
  '',
  'Conexões ativas',
  '',
  '  Proto  Endereço local         Endereço externo       Estado           PID',
  '  TCP    0.0.0.0:135            0.0.0.0:0              ESCUTA          1188',
  '  TCP    0.0.0.0:3000           0.0.0.0:0              ESCUTA          30112',
  '  TCP    127.0.0.1:9229         0.0.0.0:0              ESCUTA          30112',
  '  TCP    127.0.0.1:3000         127.0.0.1:61001        ESTABELECIDA    30112',
  '  TCP    10.0.0.7:61010         20.42.65.92:443        ESTABELECIDA    5120',
  '  TCP    10.0.0.7:61020         20.42.65.92:443        TEMPO_ESPERA    0',
  '  TCP    10.0.0.7:61030         20.42.65.92:80         FECHAR_ESPERA   5120',
  '  TCP    [::]:3000              [::]:0                 ESCUTA          30112',
  '  TCP    [::]:49664             [::]:0                 ESCUTA          900',
  '',
].join('\r\n');
const NETSTAT_PT_PORTAS = [135, 3000, 9229, 49664];

const LSOF = [
  'COMMAND     PID   USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME',
  'rapportd    512 utiliz    4u  IPv4 0x8f3c2a1b4d5e6f70      0t0  TCP *:49152 (LISTEN)',
  'rapportd    512 utiliz    5u  IPv6 0x8f3c2a1b4d5e6f71      0t0  TCP *:49152 (LISTEN)',
  'ControlCe   601 utiliz    9u  IPv4 0x8f3c2a1b4d5e6f72      0t0  TCP *:7000 (LISTEN)',
  'node      43120 utiliz   23u  IPv4 0x8f3c2a1b4d5e6f73      0t0  TCP 127.0.0.1:4802 (LISTEN)',
  'node      43121 utiliz   24u  IPv6 0x8f3c2a1b4d5e6f74      0t0  TCP [::1]:5174 (LISTEN)',
  'postgres    880 utiliz    7u  IPv6 0x8f3c2a1b4d5e6f75      0t0  TCP [::1]:5432 (LISTEN)',
  'postgres    880 utiliz    8u  IPv4 0x8f3c2a1b4d5e6f76      0t0  TCP 127.0.0.1:5432 (LISTEN)',
  '',
].join('\n');
const LSOF_PORTAS = [4802, 5174, 5432, 7000, 49152];

const SS = [
  'LISTEN 0      4096   127.0.0.53%lo:53         0.0.0.0:*',
  'LISTEN 0      511          0.0.0.0:4803       0.0.0.0:*',
  'LISTEN 0      128          0.0.0.0:22         0.0.0.0:*',
  'LISTEN 0      4096       127.0.0.1:631        0.0.0.0:*',
  'LISTEN 0      511                *:8080             *:*',
  'LISTEN 0      128             [::]:22            [::]:*',
  'LISTEN 0      4096           [::1]:631           [::]:*',
  'LISTEN 0      4096 [::ffff:127.0.0.1]:6379          *:*',
  '',
].join('\n');
const SS_PORTAS = [22, 53, 631, 4803, 6379, 8080];

const CASOS = [
  ['netstat -ano -p tcp (inglês)', NETSTAT_EN, 'win32', NETSTAT_EN_PORTAS],
  ['netstat -ano -p tcp («ESCUTA»)', NETSTAT_PT, 'win32', NETSTAT_PT_PORTAS],
  ['lsof -iTCP -sTCP:LISTEN -P -n', LSOF, 'darwin', LSOF_PORTAS],
  ['ss -ltnH', SS, 'linux', SS_PORTAS],
];

const conjunto = (xs) => [...new Set(xs)].sort((a, b) => a - b);

for (const [nome, saida, so, portas] of CASOS) {
  test(`C4: ${nome}: as portas em escuta são exatamente ${portas.join(', ')}`, async () => {
    const u = await api();
    const r = await u.portas(saida, so);
    assert.ok(Array.isArray(r) && r.every((p) => Number.isInteger(p) && p >= 1 && p <= 65535), 'não é uma lista de inteiros 1..65535: ' + JSON.stringify(r));
    assert.deepEqual(conjunto(r), portas);
  });
}

test('C4: saída vazia, só cabeçalho, ou lixo dá [] sem lançar', async () => {
  const u = await api();
  for (const so of ['win32', 'darwin', 'linux']) {
    for (const s of ['', '\r\n', 'Active Connections\r\n\r\n  Proto  Local Address  Foreign Address  State  PID\r\n', 'COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\n', 'bash: ss: command not found\n', '\u0000\u0001garbage:99999 LISTEN\n']) {
      assert.deepEqual(conjunto(await u.portas(s, so)), [], `${so}: ${JSON.stringify(s)}`);
    }
  }
});

// Propriedade (semente fixa): linhas de cada saída baralhadas e repetidas dão o mesmo conjunto (a ordem e os duplicados não contam)
test('C4: propriedade, semente 4242: baralhar e repetir linhas não muda o conjunto', async () => {
  const u = await api();
  const r = rng(4242);
  for (const [nome, saida, so, portas] of CASOS) {
    const eol = saida.includes('\r\n') ? '\r\n' : '\n';
    const linhas = saida.split(eol).filter((l) => / LISTEN| ESCUTA|\(LISTEN\)|^LISTEN|ESTAB|TEMPO|TIME_|FECHAR/.test(l));
    for (let k = 0; k < 20; k++) {
      const mix = Array.from({ length: linhas.length * 2 }, () => pick(r, linhas)).concat(linhas.filter((l) => /LISTEN|ESCUTA/.test(l)));
      // todas as linhas em escuta vão no fim, por isso o conjunto esperado é sempre o do caso
      assert.deepEqual(conjunto(await u.portas(mix.join(eol) + eol, so)), portas, `${nome}, iteração ${k}, semente 4242`);
    }
  }
});
