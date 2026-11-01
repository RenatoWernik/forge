// Ronda −1 do F-22b (#76): os registos de teste do C2 (0, 3 e 14 regras ativas) e as goldens do bloco, literais.
// Regra ativa = PREVENTION text e STATUS open ou recurred, por ordem de id. Linha: `- E-NNN `<class>`: <SYMPTOM cortado a 100> (learnings/<ficheiro>)`.
// Teto (leitura do critério): no máximo 12 linhas entre os marcadores; com mais regras ficam as mais recentes e a última linha passa a ser
// `+<N> more ...`, por isso 12 = o cabeçalho + as 10 regras de id mais alto + a linha `+<N> more`.
import { ficheiro, set9, out10, CAB, ROD } from './helpers.mjs';

const T = (over) => ({ STATUS: 'open', ...over }); // uma regra de texto ativa (open)

// 0 regras ativas: um test aberto e um texto prevented
export const R0 = {
  '2026-10.md': ficheiro('2026-10', [out10(1, 'test', T({ CLASS: 'fixed-test-port' })), out10(2, 'text', { CLASS: 'quiet-retry', STATUS: 'prevented' })]),
};
export const G0 = [CAB, '- none', ROD];

// 3 regras ativas (E-001, E-004 recurred, E-006) entre 4 que não o são (test open, text prevented, text escalated, memory open); dois meses
export const LONGO = 'the critic accepted the evidence that the developer declared in the delivery note without running the command again';
export const R3 = {
  '2026-09.md': ficheiro('2026-09', [
    set9(1, 'text', T({ CLASS: 'evidence-self-declared', SYMPTOM: LONGO })),
    set9(2, 'test', T({ CLASS: 'fixed-test-port' })),
  ]),
  '2026-10.md': ficheiro('2026-10', [
    out10(3, 'text', { CLASS: 'quiet-retry', STATUS: 'prevented' }),
    out10(4, 'text', { CLASS: 'stale-graph', SYMPTOM: 'the graph was built before the last commit', STATUS: 'recurred' }),
    out10(5, 'text', { CLASS: 'lost-baton', STATUS: 'escalated' }),
    out10(6, 'text', T({ CLASS: 'missing-lock-file', SYMPTOM: 'the add wrote without the lock' })),
    out10(7, 'memory', T({ CLASS: 'quiet-noise' })),
  ]),
};
export const G3 = [
  CAB,
  '- E-001 `evidence-self-declared`: the critic accepted the evidence that the developer declared in the delivery note without running th (learnings/2026-09.md)',
  '- E-004 `stale-graph`: the graph was built before the last commit (learnings/2026-10.md)',
  '- E-006 `missing-lock-file`: the add wrote without the lock (learnings/2026-10.md)',
  ROD,
];

// 14 regras ativas em 16 entradas (E-003 text prevented e E-010 test open não são regras); E-001..E-005 em 2026-09, o resto em 2026-10
const n2 = (n) => String(n).padStart(2, '0');
const regra = (n) => ({ CLASS: 'class-' + n2(n), SYMPTOM: 'the rule number ' + n2(n) + ' was broken', STATUS: n % 2 ? 'open' : 'recurred' });
const e14 = (n) => {
  const mk = n <= 5 ? set9 : out10;
  if (n === 3) return mk(n, 'text', { ...regra(n), STATUS: 'prevented' });
  if (n === 10) return mk(n, 'test', { ...regra(n), STATUS: 'open' });
  return mk(n, 'text', regra(n));
};
export const R14 = {
  '2026-09.md': ficheiro('2026-09', [1, 2, 3, 4, 5].map(e14)),
  '2026-10.md': ficheiro('2026-10', [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map(e14)),
};
export const G14 = [
  CAB,
  '- E-006 `class-06`: the rule number 06 was broken (learnings/2026-10.md)',
  '- E-007 `class-07`: the rule number 07 was broken (learnings/2026-10.md)',
  '- E-008 `class-08`: the rule number 08 was broken (learnings/2026-10.md)',
  '- E-009 `class-09`: the rule number 09 was broken (learnings/2026-10.md)',
  '- E-011 `class-11`: the rule number 11 was broken (learnings/2026-10.md)',
  '- E-012 `class-12`: the rule number 12 was broken (learnings/2026-10.md)',
  '- E-013 `class-13`: the rule number 13 was broken (learnings/2026-10.md)',
  '- E-014 `class-14`: the rule number 14 was broken (learnings/2026-10.md)',
  '- E-015 `class-15`: the rule number 15 was broken (learnings/2026-10.md)',
  '- E-016 `class-16`: the rule number 16 was broken (learnings/2026-10.md)',
  '+4 more in learnings/; register and counts: `node .claude/learn.mjs report`.',
];
// Uma regra de texto ativa a acrescentar a um registo de 2026-10 (para tornar o bloco antigo)
export const EXTRA = (n, over = {}) => out10(n, 'text', T({ CLASS: 'extra-' + n, SYMPTOM: 'an extra rule ' + n, ...over }));