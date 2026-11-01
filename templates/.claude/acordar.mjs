// The wake-up after the usage limit (FRAMEWORK.md, section 12). Usage, from the project root:
//   node .claude/acordar.mjs --at <time>            ->  wake: 2026-10-31 19:00 local (2026-10-31T19:00:00.000Z)
//   node .claude/acordar.mjs --at <time> --cron     ->  the 5-field cron line of the wake-up (M H DoM Mon *), for CronCreate
//   node .claude/acordar.mjs --at <time> --sleep    ->  waits for the wake-up, prints "wake: now" (a timer, not a test)
// <time> is the "resets <time>" of the answer: HH:MM (24 h), or H am|pm, Ham|pm, H:MMam|pm, H:MM am|pm (any case), in the local time zone of the process.
// The wake-up is that time plus 2 minutes, today if that is still ahead, otherwise tomorrow. The clock is FORGE_NOW_MS (ms since the epoch) when set.
// An unknown format exits 1 with "unrecognized reset time: <time>". Standard library only.
import { parseArgs } from 'node:util';

const MIN = 60000;
const FORMATOS = [/^(\d{2}):(\d{2})$/, /^(\d{1,2})(?::(\d{2}))?\s?(am|pm)$/i]; // 24 h, then 12 h

// "18:58" / "6pm" / "7:30 PM" -> [hour, minute] of the day, or null
function hora(texto) {
  const [, h, m = '0', ap] = texto.trim().match(FORMATOS[0]) ?? texto.trim().match(FORMATOS[1]) ?? [];
  if (h === undefined) return null;
  let hh = Number(h);
  if (ap === undefined ? hh > 23 : hh < 1 || hh > 12) return null;
  if (Number(m) > 59) return null;
  if (ap !== undefined) hh = (hh % 12) + (ap.toLowerCase() === 'pm' ? 12 : 0);
  return [hh, Number(m)];
}

// the first instant after `agora` that is 2 minutes after the local time h:m (setDate keeps the local hour across a clock change)
function despertar(agora, [h, m]) {
  const t = new Date(agora);
  t.setHours(h, m, 0, 0);
  if (t.getTime() + 2 * MIN <= agora) t.setDate(t.getDate() + 1);
  return t.getTime() + 2 * MIN;
}

const p2 = (n) => String(n).padStart(2, '0');
const injetado = Number(process.env.FORGE_NOW_MS);
const t0 = injetado > 0 ? injetado : Date.now(); // NaN and 0 are not clocks
const real0 = Date.now();

let o;
try { o = parseArgs({ args: process.argv.slice(2), options: { at: { type: 'string' }, cron: { type: 'boolean' }, sleep: { type: 'boolean' } } }).values; } catch { o = {}; }
if (o.at === undefined || (o.cron && o.sleep)) {
  console.error('usage: node .claude/acordar.mjs --at <time> [--cron | --sleep]');
  process.exit(1);
}
const hm = hora(o.at);
if (!hm) {
  console.error(`unrecognized reset time: ${o.at}`);
  process.exit(1);
}
const w = despertar(t0, hm);
const d = new Date(w);
if (o.cron) console.log(`${d.getMinutes()} ${d.getHours()} ${d.getDate()} ${d.getMonth() + 1} *`);
else if (o.sleep) {
  // the real time that passes, counted from the injected "now"; re-read in slices so a machine that slept does not oversleep
  for (let left = w - t0; left > 0; left = w - (t0 + Date.now() - real0)) await new Promise((r) => setTimeout(r, Math.min(left, 30000)));
  console.log('wake: now');
} else console.log(`wake: ${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())} local (${d.toISOString()})`);
