// Ronda −1 do F-24 (#80), C4: o despertar depois da quota, `node .claude/acordar.mjs --at <hora> [--cron | --sleep]`.
// Oráculo: a tabela do contrato, com TZ=Europe/Lisbon e FORGE_NOW_MS fixo; nas linhas sem «Agora», agora é 2026-10-31 17:00 local.
// Mais: um caso por formato aceite, e uma propriedade com gerador fixo (o despertar nunca fica antes da reposição).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as H from './helpers.mjs';

const { local: L, AGORA_C4 } = H;
// [agora, hora, despertar esperado], da tabela do contrato
const TABELA = [
  [AGORA_C4, '18:58', L(2026, 10, 31, 19, 0)],
  [L(2026, 10, 31, 18, 59), '18:58', L(2026, 10, 31, 19, 0)],
  [L(2026, 10, 31, 19, 0), '6pm', L(2026, 11, 1, 18, 2)],
  [L(2026, 10, 31, 23, 0), '11:59pm', L(2026, 11, 1, 0, 1)],
  [AGORA_C4, '12am', L(2026, 11, 1, 0, 2)],
  [AGORA_C4, '12pm', L(2026, 11, 1, 12, 2)],
  [AGORA_C4, '7:30 PM', L(2026, 10, 31, 19, 32)],
];
// um caso por formato (sem distinguir maiúsculas): HH:MM, H am|pm, Ham|pm, H:MMam|pm, H:MM am|pm
const FORMATOS = [
  [AGORA_C4, '23:59', L(2026, 11, 1, 0, 1)],
  [AGORA_C4, '00:00', L(2026, 11, 1, 0, 2)],
  [AGORA_C4, '6 pm', L(2026, 10, 31, 18, 2)],
  [AGORA_C4, '6 PM', L(2026, 10, 31, 18, 2)],
  [AGORA_C4, '11AM', L(2026, 11, 1, 11, 2)],
  [AGORA_C4, '7:30pm', L(2026, 10, 31, 19, 32)],
  [AGORA_C4, '7:30Pm', L(2026, 10, 31, 19, 32)],
  [AGORA_C4, '12:15 am', L(2026, 11, 1, 0, 17)],
  [AGORA_C4, '4:59 pm', L(2026, 10, 31, 17, 1)],
  [AGORA_C4, '4:58 pm', L(2026, 11, 1, 17, 0)], // T + 2 min = agora: não é depois de agora, vai para amanhã
];

const confere = (proj, agora, hora, esperado) => {
  const f = H.formas(esperado);
  const r = H.acordar(proj, ['--at', hora], agora);
  assert.equal(r.status, 0, `--at ${hora}: ${H.mostra(r)}`);
  const m = H.linhas(r.stdout).length === 1 && r.stdout.trim().match(/^wake: (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) local \((.+)\)$/);
  assert.ok(m, `--at ${hora}: a saída não é «wake: <AAAA-MM-DD HH:MM> local (<ISO UTC>)»: ${H.mostra(r)}`);
  assert.equal(m[1], f.local, `--at ${hora} com agora ${H.formas(agora).local}`);
  assert.match(m[2], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/, 'o ISO não está em UTC (Z)');
  assert.equal(Date.parse(m[2]), esperado, `--at ${hora}: o ISO UTC não é o instante do despertar`);
  const c = H.acordar(proj, ['--at', hora, '--cron'], agora);
  assert.equal(c.status, 0, H.mostra(c));
  assert.equal(c.stdout.trim(), f.cron, `--at ${hora} --cron`);
  assert.equal(H.linhas(c.stdout).length, 1, '--cron imprime só a linha cron');
};

test('C4: a tabela do contrato (sem opção e com --cron): 18:58, 6pm, 11:59pm, 12am, 12pm e 7:30 PM', async () => {
  const proj = await H.gerar();
  for (const [agora, hora, esperado] of TABELA) confere(proj, agora, hora, esperado);
});

test('C4: os cinco formatos aceites, sem distinguir maiúsculas', async () => {
  const proj = await H.gerar();
  for (const [agora, hora, esperado] of FORMATOS) confere(proj, agora, hora, esperado);
});

for (const hora of ['25:00', '7.30pm', '', 'abc', '18h58']) {
  test(`C4: --at ${JSON.stringify(hora)} sai com 1 e «unrecognized reset time: ${hora}»`, async () => {
    const proj = await H.gerar();
    const r = H.acordar(proj, ['--at', hora], AGORA_C4);
    assert.equal(r.status, 1, H.mostra(r));
    assert.ok((r.stdout + r.stderr).split(/\r?\n/).some((l) => l.trim() === `unrecognized reset time: ${hora}`.trim()), H.mostra(r));
  });
}

test('C4: --sleep com o despertar a 1500 ms espera, imprime «wake: now» e sai com 0 entre 1,4 s e 5 s', async () => {
  const proj = await H.gerar();
  const despertar = L(2026, 10, 31, 19, 0);
  const r = H.acordar(proj, ['--at', '18:58', '--sleep'], despertar - 1500);
  assert.equal(r.status, 0, H.mostra(r));
  assert.equal(r.stdout.trim(), 'wake: now', H.mostra(r));
  assert.ok(r.ms >= 1400 && r.ms <= 5000, `durou ${r.ms} ms`);
});

// Propriedade (gerador fixo, 24 casos): o despertar é o primeiro instante depois de agora que cai 2 min depois da hora pedida
test('C4: propriedade: o despertar é sempre depois de agora, no máximo 24 h depois, e cai 2 min depois da hora de reposição', async () => {
  const proj = await H.gerar();
  let s = 7;
  const rnd = (n) => { s = (s * 1103515245 + 12345) % 2147483648; return s % n; };
  for (let i = 0; i < 24; i++) {
    const agora = L(2026, 10, 31, 0, 0) + rnd(24 * 60) * H.MIN + rnd(60) * 1000;
    const hh = rnd(24), mm = rnd(60);
    const hora = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    const hoje = Date.UTC(2026, 9, 31, hh, mm) + 2 * H.MIN;
    const esperado = hoje > agora ? hoje : hoje + 24 * 60 * H.MIN;
    confere(proj, agora, hora, esperado);
  }
});