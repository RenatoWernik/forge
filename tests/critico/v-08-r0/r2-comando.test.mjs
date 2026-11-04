// V-08, Ronda 2 (#132; RESPOSTA do orquestrador ao veredito da R1, pontos 1, 3, 4 e 6). Ataques novos, em acréscimo aos 40 da Ronda −1 (que não se tocam):
//   1. `formato: tap` só dá pass com prova (plano 1..N com N linhas ok, ou o sumário do node com as folhas); o resto é erro ou fail, com o motivo, e o código é 1;
//   3. um manifesto com `suites: []` é erro de uso (código 2), no executor e no check-ticket;
//   4. `comando` aceita texto ou lista, corre por shell no Windows real sem matar o motor: um arranque falhado é «erro» da unidade e o código é 1 (nunca 3 sem fim);
//   6. nenhuma unidade herda os tokens do gh, mesmo numa chamada direta do executor (o comando só diz SE os vê, nunca os valores).
// O projeto é o que sai do scaffold; as vagas e os clones ficam num TEMP privado (helpers.mjs). O «npm» é um falso numa pasta temporária, sem rede.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { gerar, conjunto, preCondicao, repo, tmp, escreve, comSuites, correAteFim, resultado, git, commita, fim } from './helpers.mjs';

const WIN = process.platform === 'win32';
const js = (nome, codigo, formato = 'tap', extra = {}) => ({ nome, tipo: 'comando', comando: [process.execPath, '-e', codigo], formato, limite_s: 60, ...extra });
const estados = (res) => Object.fromEntries(Object.entries(res.suites ?? {}).map(([n, s]) => [n, s.estado]));
const unidade = (res, suite) => (res.unidades ?? []).find((u) => u.suite === suite);
const comPath = (dir) => { const k = Object.keys(process.env).find((x) => x.toUpperCase() === 'PATH') ?? 'PATH'; return { [k]: dir + delimiter + (process.env[k] ?? '') }; };
const projeto = async (suites) => {
  const P = await gerar(await conjunto('en-plain-published'));
  preCondicao(P);
  comSuites(P, suites);
  return { P, sha: repo(P) };
};

test('R2-1: `formato: tap` sem prova nunca dá pass: «ok» solto, plano por cumprir, Bail out! e sumário sem linhas dão erro, um not ok com saída 0 dá fail, o TAP válido dá pass; o código é 1 e a unidade diz o motivo e o formato', async () => {
  const { P, sha } = await projeto([
    js('ok-solto', "console.log('ok compilou, nao correu nenhum teste')"),
    js('plano-curto', "console.log('1..5\\nok 1 - a')"),
    js('plano-vazio', "console.log('1..0')"),
    js('bail', "console.log('1..3\\nok 1 - a\\nBail out! db em baixo')"),
    js('sumario', "console.log('# tests 3\\n# pass 3\\n# fail 0\\n# skipped 0\\n# todo 0')"),
    js('not-ok-com-0', "console.log('1..2\\nok 1 - a\\nnot ok 2 - b')"),
    js('valido', "console.log('TAP version 13\\nok 1 - a\\nok 2 - b\\n1..2')"),
    js('so-codigo', 'process.exit(0)', 'codigo'),
  ]);
  const r = correAteFim(P, 'executor.mjs', ['--todas']);
  assert.equal(r.status, 1, `código ${r.status} ao fim de ${r.chamadas} chamada(s)` + fim(r));
  const res = resultado(P, sha);
  assert.deepEqual(estados(res), { 'ok-solto': 'erro', 'plano-curto': 'erro', 'plano-vazio': 'erro', bail: 'erro', sumario: 'erro', 'not-ok-com-0': 'fail', valido: 'pass', 'so-codigo': 'pass' });
  for (const s of ['ok-solto', 'plano-curto', 'plano-vazio', 'bail', 'sumario']) assert.ok(unidade(res, s)?.motivo, `${s}: o erro não diz o motivo: ` + JSON.stringify(unidade(res, s)));
  assert.equal(unidade(res, 'valido')?.pass, 2, 'valido: ' + JSON.stringify(unidade(res, 'valido')));
  assert.equal(unidade(res, 'valido')?.formato, 'tap');
  assert.equal(unidade(res, 'so-codigo')?.formato, 'codigo', 'o formato codigo fica escrito no resultado');
});

test('R2-1 (classe): o TAP de um `node --test` com grupos conta as folhas (a unidade passa), e um teste que falha dentro de um grupo dá fail', async () => {
  const { P, sha } = await projeto([
    { nome: 'grupos', tipo: 'comando', comando: [process.execPath, '--test', '--test-reporter=tap', 't/g.test.mjs'], formato: 'tap', limite_s: 60 },
    { nome: 'grupo-vermelho', tipo: 'comando', comando: [process.execPath, '--test', '--test-reporter=tap', 't/v.test.mjs'], formato: 'tap', limite_s: 60 },
  ]);
  escreve(P, 't/g.test.mjs', "import { test, describe } from 'node:test';\ntest('v1', () => {});\ndescribe('grupo', () => { test('g1', () => {}); test('g2', () => {}); });\ntest('v2', () => {});\n");
  escreve(P, 't/v.test.mjs', "import { test, describe } from 'node:test';\nimport assert from 'node:assert/strict';\ndescribe('grupo', () => { test('g1', () => {}); test('g2', () => { assert.equal(1, 2); }); });\n");
  commita(P, 'testes');
  const sha2 = git(P, 'rev-parse', 'HEAD').trim();
  const r = correAteFim(P, 'executor.mjs', ['--todas']);
  assert.equal(r.status, 1, `código ${r.status}` + fim(r));
  const res = resultado(P, sha2);
  assert.notEqual(sha2, sha);
  assert.deepEqual(estados(res), { grupos: 'pass', 'grupo-vermelho': 'fail' });
  assert.equal(unidade(res, 'grupos')?.pass, 4, 'as 4 folhas: ' + JSON.stringify(unidade(res, 'grupos')));
});

test('R2-3: um manifesto com `suites: []` é erro de uso (código 2) no executor e no check-ticket do projeto, nunca «0/0 unidades» com código 0', async () => {
  const { P } = await projeto([]);
  for (const [modulo, args] of [['executor.mjs', ['--todas']], ['executor.mjs', ['--afetadas', '--base', 'main']], ['check-ticket.mjs', ['--ambito', '**', '--base', 'main']]]) {
    const r = correAteFim(P, modulo, args);
    assert.equal(r.status, 2, `${modulo} ${args.join(' ')}: código ${r.status}` + fim(r));
    assert.match(r.out, /suites/i);
  }
});

test('R2-4: no Windows real, "npm test", ["npm","test"], ["npm.cmd","test"] e um caminho com espaços correm; um comando inexistente dá erro da unidade, com o código 1, em ≤ 2 chamadas', async () => {
  const bin = tmp('critico-v08-npm-'), esp = join(tmp('critico-v08-esp-'), 'pasta com espacos');
  mkdirSync(esp);
  const falso = (dir, nome) => {
    const f = join(dir, nome + (WIN ? '.cmd' : ''));
    writeFileSync(f, WIN ? `@echo off\r\necho ${nome}-falso %*\r\nexit /b 0\r\n` : `#!/bin/sh\necho ${nome}-falso "$@"\nexit 0\n`);
    if (!WIN) chmodSync(f, 0o755);
    return f;
  };
  falso(bin, 'npm');
  const ferramenta = falso(esp, 'ferramenta');
  const cmd = (nome, comando) => ({ nome, tipo: 'comando', comando, formato: 'codigo', limite_s: 60 });
  const { P, sha } = await projeto([
    cmd('texto', 'npm test'),
    cmd('lista', ['npm', 'test']),
    cmd('lista-cmd', [WIN ? 'npm.cmd' : 'npm', 'test']),
    cmd('com-espacos', [ferramenta, 'um argumento']),
    cmd('inexistente', ['comando-que-nao-existe-xyz', '--versao']),
  ]);
  const r = correAteFim(P, 'executor.mjs', ['--todas'], { env: comPath(bin) });
  assert.ok(r.chamadas <= 2 && r.status === 1, `código ${r.status} ao fim de ${r.chamadas} chamada(s) (esperado 1 em ≤ 2)` + fim(r));
  const res = resultado(P, sha);
  assert.deepEqual(estados(res), { texto: 'pass', lista: 'pass', 'lista-cmd': 'pass', 'com-espacos': 'pass', inexistente: 'erro' });
  assert.match(unidade(res, 'inexistente')?.motivo ?? '', /não encontrado/);
  for (const [s, re] of [['texto', /npm-falso test/], ['lista', /npm-falso test/], ['lista-cmd', /npm-falso test/], ['com-espacos', /ferramenta-falso "?um argumento"?/]]) {
    const tap = readFileSync(join(P, unidade(res, s).tap), 'utf8');
    assert.match(tap, re, `${s}: o comando não correu o falso`);
  }
});

test('R2-4 (classe): numa lista, aspas, % e quebras de linha chegam intactos a um executável (sem shell); a um .cmd do Windows, que só corre pelo cmd, o elemento é um erro da unidade, nunca uma injeção nem o motor morto', async () => {
  const bin = tmp('critico-v08-cmd-');
  const f = join(bin, WIN ? 'eco.cmd' : 'eco');
  writeFileSync(f, WIN ? '@echo off\r\necho eco %*\r\nexit /b 0\r\n' : '#!/bin/sh\necho eco "$@"\nexit 0\n');
  if (!WIN) chmodSync(f, 0o755);
  const sonda = "const a = process.argv.slice(1); process.exit(a[0] === 'a\"b' && a[1] === '100%' && a[2] === 'x&y' && a[3] === 'l1\\nl2' ? 0 : 1)";
  const { P: P2, sha: sha2 } = await projeto([
    { nome: 'exe-intacto', tipo: 'comando', comando: [process.execPath, '-e', sonda, 'a"b', '100%', 'x&y', 'l1\nl2'], formato: 'codigo', limite_s: 60 },
    { nome: 'cmd-seguro', tipo: 'comando', comando: [f, 'um', 'dois'], formato: 'codigo', limite_s: 60 },
    ...(WIN ? [{ nome: 'cmd-aspas', tipo: 'comando', comando: [f, 'a"b'], formato: 'codigo', limite_s: 60 }, { nome: 'cmd-percento', tipo: 'comando', comando: [f, '%PATH%'], formato: 'codigo', limite_s: 60 }] : []),
  ]);
  const r = correAteFim(P2, 'executor.mjs', ['--todas']);
  const res = resultado(P2, sha2);
  assert.equal(r.status, WIN ? 1 : 0, `código ${r.status} ao fim de ${r.chamadas} chamada(s)` + fim(r));
  assert.deepEqual(estados(res), { 'exe-intacto': 'pass', 'cmd-seguro': 'pass', ...(WIN ? { 'cmd-aspas': 'erro', 'cmd-percento': 'erro' } : {}) });
  if (WIN) for (const s of ['cmd-aspas', 'cmd-percento']) assert.match(unidade(res, s)?.motivo ?? '', /\.cmd/);
});

test('R2-6: nenhuma unidade herda GH_TOKEN, GITHUB_TOKEN, GH_ENTERPRISE_TOKEN nem GITHUB_ENTERPRISE_TOKEN, numa chamada direta do executor, nem com o env da suíte a pedir @real; os valores não aparecem em nenhum ficheiro', async () => {
  const NOMES = ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN'];
  const visto = `const v = [${NOMES.map((k) => `'${k}'`).join(',')}].filter((k) => process.env[k] !== undefined); console.log('VISTOS=' + v.join(',')); process.exit(v.length ? 1 : 0)`;
  const { P, sha } = await projeto([
    js('direto', visto, 'codigo'),
    js('env-real', visto, 'codigo', { env: Object.fromEntries(NOMES.map((k) => [k, '@real'])) }),
    { nome: 'nodetest', tipo: 'node-test', ficheiros: ['t/token.test.mjs'], limite_s: 60 },
  ]);
  escreve(P, 't/token.test.mjs', `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\ntest('sem tokens', () => { assert.deepEqual(${JSON.stringify(NOMES)}.filter((k) => process.env[k] !== undefined), []); });\n`);
  commita(P, 'token');
  const sha2 = git(P, 'rev-parse', 'HEAD').trim();
  const segredos = Object.fromEntries(NOMES.map((k, i) => [k, `segredo-do-teste-${i}-xyzxyz`]));
  const r = correAteFim(P, 'executor.mjs', ['--todas'], { env: segredos });
  assert.equal(r.status, 0, `código ${r.status}` + fim(r));
  assert.notEqual(sha2, sha);
  assert.deepEqual(estados(resultado(P, sha2)), { direto: 'pass', 'env-real': 'pass', nodetest: 'pass' });
  const varre = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? varre(join(dir, e.name)) : [join(dir, e.name)]));
  const com = varre(join(P, '.forge')).filter((f) => Object.values(segredos).some((s) => readFileSync(f, 'utf8').includes(s)));
  assert.deepEqual(com, [], 'um segredo ficou em ficheiros do .forge');
  assert.ok(!Object.values(segredos).some((s) => r.out.includes(s)), 'um segredo apareceu na saída');
  assert.ok(existsSync(join(P, '.forge')));
});
