// F-25 C5: quota medida. Fonte principal: session.measure (e.rateLimits); recurso: $.session.usage().rateLimits em cada volta,
// gravado só se mudou. Secção QUOTA: «<5 h|semana|kind> <percentUsed arredondado>% · reinicia <HH:MM>» por janela e, no fim,
// «medido há <N>» ou «lido há <N>»; janela já reposta: «<janela> sem dados (reiniciou <HH:MM>)»; sem janelas, sem secção.
// Oráculo: o $ falso; TZ=UTC (helpers), AGORA = 12:00.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, MIN, H, AGORA, criar, runtime, projeto, quota, iso, flush } from './helpers.mjs';

const medir = (rateLimits) => ({ context: { percentUsed: 12 }, rateLimits, changed: ['rateLimits'] });
const JANELAS = [
  { kind: 'five_hour', percentUsed: 72, resetsAt: iso(AGORA + 2.5 * H) },
  { kind: 'seven_day', percentUsed: 41.5, resetsAt: iso(AGORA + 3 * 24 * H + 75 * MIN) },
];

test('C5: um session.measure com five_hour 72 % e seven_day 41,5 % dá as linhas literais e «medido há»', async () => {
  const r = runtime({ raiz: projeto().raiz });
  const painel = await criar();
  await painel.evento('session.measure', r.$, medir(JANELAS));
  await flush();
  await r.ctl.avancar(7 * S);
  const q = quota(await painel.ecra(r.$, 200));
  assert.ok(q, 'sem secção QUOTA');
  assert.deepEqual(q.slice(0, 2), ['5 h 72% · reinicia 14:30', 'semana 42% · reinicia 13:15']);
  assert.match(q[q.length - 1], /^medido há 7 s$/);
});

test('C5: outra janela mostra-se com o kind', async () => {
  const r = runtime({ raiz: projeto().raiz });
  const painel = await criar();
  await painel.evento('session.measure', r.$, medir([{ kind: 'spend_limit', percentUsed: 12.4, resetsAt: iso(AGORA + 3 * H) }]));
  await flush();
  const q = quota(await painel.ecra(r.$, 200));
  assert.ok(q?.includes('spend_limit 12% · reinicia 15:00'), JSON.stringify(q));
});

test('C5: com medição, o recurso não a substitui: o usage diferente não muda as linhas nem o «medido»', async () => {
  const r = runtime({ raiz: projeto().raiz });
  const painel = await criar();
  r.ctl.rateLimits = [{ kind: 'five_hour', percentUsed: 10, resetsAt: iso(AGORA + H) }];
  await painel.evento('session.measure', r.$, medir(JANELAS));
  await r.ctl.avancar(5 * S);
  await painel.volta(r.$);
  await r.ctl.avancar(5 * S);
  await painel.volta(r.$);
  const q = quota(await painel.ecra(r.$, 200));
  assert.equal(q?.[0], '5 h 72% · reinicia 14:30', JSON.stringify(q));
  assert.match(q[q.length - 1], /^medido há 10 s$/);
});

test('C5: sem medição, o recurso lê $.session.usage() e só grava quando muda («lido há»)', async () => {
  const r = runtime({ raiz: projeto().raiz });
  const painel = await criar();
  r.ctl.rateLimits = [{ kind: 'five_hour', percentUsed: 30, resetsAt: iso(AGORA + H) }];
  await painel.volta(r.$);
  await r.ctl.avancar(10 * S);
  await painel.volta(r.$);
  await r.ctl.avancar(2 * S);
  let q = quota(await painel.ecra(r.$, 200));
  assert.equal(q?.[0], '5 h 30% · reinicia 13:00', JSON.stringify(q));
  assert.match(q[q.length - 1], /^lido há 12 s$/, 'o usage igual numa segunda volta gravou outra vez');
  r.ctl.rateLimits = [{ kind: 'five_hour', percentUsed: 31, resetsAt: iso(AGORA + H) }];
  await painel.volta(r.$);
  await r.ctl.avancar(S);
  q = quota(await painel.ecra(r.$, 200));
  assert.equal(q?.[0], '5 h 31% · reinicia 13:00', JSON.stringify(q));
  assert.match(q[q.length - 1], /^lido há 1 s$/);
});

test('C5: com o resetsAt já passado, «<janela> sem dados (reiniciou <HH:MM>)», nunca uma percentagem', async () => {
  const r = runtime({ raiz: projeto().raiz });
  const painel = await criar();
  await painel.evento('session.measure', r.$, medir([{ kind: 'five_hour', percentUsed: 72, resetsAt: iso(AGORA - 10 * MIN) }, JANELAS[1]]));
  await flush();
  const q = quota(await painel.ecra(r.$, 200));
  assert.ok(q?.includes('5 h sem dados (reiniciou 11:50)'), JSON.stringify(q));
  assert.ok(!q.some((l) => /^5 h .*%/.test(l)), 'mostra uma percentagem de uma janela já reposta');
  assert.ok(q.includes('semana 42% · reinicia 13:15'));
});

test('C5: a janela repõe-se enquanto o painel está aberto: passa a «sem dados» sem nova medição', async () => {
  const r = runtime({ raiz: projeto().raiz });
  const painel = await criar();
  await painel.evento('session.measure', r.$, medir([{ kind: 'five_hour', percentUsed: 99, resetsAt: iso(AGORA + 30 * S) }]));
  await flush();
  assert.equal(quota(await painel.ecra(r.$, 200))?.[0], '5 h 99% · reinicia 12:00');
  await r.ctl.avancar(31 * S);
  const q = quota(await painel.ecra(r.$, 200));
  assert.equal(q?.[0], '5 h sem dados (reiniciou 12:00)', JSON.stringify(q));
  assert.ok(!q.some((l) => l.includes('%')), 'percentagem depois do resetsAt');
});

test('C5: o recurso com o resetsAt já passado também dá «sem dados»', async () => {
  const r = runtime({ raiz: projeto().raiz });
  const painel = await criar();
  r.ctl.rateLimits = [{ kind: 'seven_day', percentUsed: 50, resetsAt: iso(AGORA - H) }];
  await painel.volta(r.$);
  const q = quota(await painel.ecra(r.$, 200));
  assert.ok(q?.includes('semana sem dados (reiniciou 11:00)'), JSON.stringify(q));
  assert.ok(!q.some((l) => l.includes('%')));
});

test('C5: sem janelas (medição e usage vazios), não há secção QUOTA', async () => {
  const r = runtime({ raiz: projeto().raiz });
  const painel = await criar();
  await painel.evento('session.measure', r.$, medir([]));
  await painel.volta(r.$);
  const txt = await painel.ecra(r.$, 200);
  assert.equal(quota(txt), null, txt);
  assert.doesNotMatch(txt, /medido há|lido há/);
});