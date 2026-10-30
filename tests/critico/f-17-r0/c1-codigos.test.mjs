// F-17 critério 1: a tabela dos códigos de saída, com a máquina falsa do F-15b (fonte de versões fixa, sem rede).
// Oráculo: a tabela CASOS abaixo, fechada. Cada linha é uma máquina, os argumentos e o código que o contrato manda. As linhas do --check
// correm nas três formas (`--check`, `--check --json` e sem flags) e dão o mesmo código. ATAQUE = vermelho na base 712b690 (que sai
// com 1); GUARDA = verde na base e tem de continuar verde. customized e unknown dão 4 (respostas P1 e P2 do orquestrador na #58).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  maquina, instala, upd, estado, latest, doDoctor, TUDO_VERIFICADO, TUDO_REFERENCIA, personalizada, URL_PONYTAIL, NOVO_UPSTREAM, CHECKS, join, mkdirSync,
} from './helpers.mjs';

const sem = (o, k) => { const c = { ...o }; delete c[k]; return c; };
const M = {
  tudoOk: () => instala(maquina(), TUDO_VERIFICADO),
  tudoOkComAvisoDoOriginal: () => instala(maquina({ fontes: latest({ upstream: NOVO_UPSTREAM }) }), TUDO_VERIFICADO),
  vazia: () => maquina(),
  umMissing: () => instala(maquina(), sem(TUDO_VERIFICADO, 'uv')),
  umOutdated: () => instala(maquina(), { ...TUDO_VERIFICADO, uv: '0.13.5' }),
  umUnverified: () => instala(maquina({ fontes: latest({ ponytail: '5.4.0' }) }), TUDO_VERIFICADO),
  soForgeOutdated: () => instala(maquina(), { ...TUDO_VERIFICADO, forge: '0.1.0' }),
  referencia: () => instala(maquina(), TUDO_REFERENCIA),
  customized: () => instala(maquina(), { ...TUDO_VERIFICADO, 'gauntlet-loop': personalizada() }),
  unknown: () => instala(maquina({ fontes: latest({ sem: [URL_PONYTAIL] }) }), TUDO_VERIFICADO),
  unknownEOutdated: () => instala(maquina({ fontes: latest({ sem: [URL_PONYTAIL] }) }), { ...TUDO_VERIFICADO, uv: '0.13.5' }),
};

// [nome, máquina, estados esperados (sanidade da fixture), código | conjunto de códigos aceites, ATAQUE/GUARDA]
const CASOS = [
  ['tudo ok', 'tudoOk', { ok: 11 }, 0, 'GUARDA'],
  ['tudo ok e o aviso de commits novos no original do gauntlet-loop (um aviso não é uma componente)', 'tudoOkComAvisoDoOriginal', { ok: 11 }, 0, 'GUARDA'],
  ['máquina vazia: tudo missing', 'vazia', { missing: 11 }, 4, 'ATAQUE'],
  ['um missing (uv), o resto ok', 'umMissing', { missing: 1, ok: 10 }, 4, 'ATAQUE'],
  ['um outdated (uv), o resto ok', 'umOutdated', { outdated: 1, ok: 10 }, 4, 'ATAQUE'],
  ['um unverified (ponytail 5.4.0 acima do verifiedWith), o resto ok', 'umUnverified', { unverified: 1, ok: 10 }, 4, 'ATAQUE'],
  ['só o alvo forge outdated', 'soForgeOutdated', { outdated: 1, ok: 10 }, 4, 'ATAQUE'],
  ['referência de 2026-09-30: vários outdated', 'referencia', { outdated: 9, ok: 2 }, 4, 'ATAQUE'],
  ['só um customized (resposta P1)', 'customized', { customized: 1, ok: 10 }, 4, 'ATAQUE'],
  ['só um unknown (resposta P2)', 'unknown', { unknown: 1, ok: 10 }, 4, 'ATAQUE'],
  ['um unknown e um outdated (resposta P2)', 'unknownEOutdated', { unknown: 1, outdated: 1, ok: 9 }, 4, 'ATAQUE'],
];

const conta = (by) => Object.values(by).reduce((a, c) => ({ ...a, [c.status]: (a[c.status] ?? 0) + 1 }), {});
const aceita = (want, code) => (Array.isArray(want) ? want.includes(code) : code === want);

for (const [nome, maq, estados, want, tipo] of CASOS) {
  test(`C1 ${tipo} --check, ${nome}: código ${Array.isArray(want) ? want.join(' ou ') : want} nas três formas`, async () => {
    const s = await estado(M[maq]());
    assert.deepEqual(conta(s.by), estados, 'sanidade da fixture: os estados da máquina não são os do caso');
    const got = [];
    for (const argv of CHECKS) {
      const r = await upd(M[maq](), argv);
      assert.deepEqual(r.execs.map((c) => c.str), [], 'o --check executou algo');
      got.push(`${JSON.stringify(argv)} → ${r.code}`);
      if (maq === 'tudoOkComAvisoDoOriginal' && !argv.includes('--json')) assert.match(r.out, /new commits|commits novos/i, 'o caso não exercita o aviso do original');
    }
    const bad = got.filter((g) => !aceita(want, +g.split('→ ')[1]));
    assert.deepEqual(bad, [], `esperava ${JSON.stringify(want)}: ${got.join('; ')}`);
  });
}

// O 2 e o 3 não mudam; o 1 continua nos erros reais do --apply (GUARDAS)
const dir = (m) => { const d = join(m.root, 'sem specify'); mkdirSync(d, { recursive: true }); return d; };
const USO = [
  ['--check e --apply juntos', ['--check', '--apply', 'uv']],
  ['uma flag desconhecida', ['--check', '--bogus']],
  ['--versions sem valor', ['--check', '--versions']],
  ['--versions com um ficheiro que não existe', ['--check', '--versions', 'nao-existe-critico.json']],
  ['--apply com um id que não existe', ['--apply', 'nada', '--yes']],
  ['--apply sem id', ['--apply']],
  ['dois --apply', ['--apply', 'uv', '--apply', 'ponytail', '--yes']],
  ['speckit-project sem --project', ['--apply', 'speckit-project', '--yes']],
];
for (const [nome, argv] of USO) {
  test(`C1 GUARDA uso inválido (${nome}): código 2, numa máquina com componentes por atualizar e noutra com tudo ok`, async () => {
    for (const maq of ['referencia', 'tudoOk']) assert.equal((await upd(M[maq](), argv)).code, 2, maq);
  });
}

test('C1 GUARDA speckit-project numa pasta sem .specify/: código 2', async () => {
  const m = M.referencia();
  assert.equal((await upd(m, ['--apply', 'speckit-project', '--project', dir(m), '--yes'])).code, 2);
});

test('C1 GUARDA barreira não confirmada (--apply de um outdated sem --yes): código 3 e nada corre', async () => {
  const r = await upd(M.umOutdated(), ['--apply', 'uv']);
  assert.equal(r.code, 3);
  assert.deepEqual(r.execs, []);
});

test('C1 GUARDA erros reais do --apply: o comando falha → 1; a componente unknown → 1', async () => {
  const m = M.umOutdated();
  const [cmd] = await doDoctor(m, 'uv');
  m.falhas[cmd] = 'critico: o comando falhou';
  assert.equal((await upd(m, ['--apply', 'uv', '--yes'])).code, 1, 'comando falhado');
  assert.equal((await upd(M.unknown(), ['--apply', 'ponytail', '--yes'])).code, 1, 'unknown');
});

test('C1 GUARDA --apply de uma componente já ok: código 0', async () => {
  assert.equal((await upd(M.tudoOk(), ['--apply', 'uv', '--yes'])).code, 0);
});
