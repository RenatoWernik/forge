// O motor destacado do executor (V-01, #125, REDESENHO C7–C10): sem inanição das unidades longas, a chamada não mata, retoma depois da morte do
// motor, um só motor por árvore, e vagas a rodar sem erro fatal. Os repos são gerados aqui (manifesto + unidades que dormem N s e registam
// o início e o fim em .sonda/); cada cenário tem um TEMP privado, por isso as vagas da máquina ficam intactas. Reutiliza o arnês dos ataques.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURES, correr, esperaAte, eventos, gitOk, inicios, intervalos, lerJson, limpa, mataArvore, registaPid, resultados, saida, sobreposicaoMax,
  tempPrivado, tmp, umResultado, validaResultado, vivo } from '../tests/critico/v-01-r0/helpers.mjs';

after(limpa);

const UNIDADE = (seg) => `import { test } from 'node:test';\nimport { marca, dorme } from '../sonda.mjs';\n`
  + `test('dorme', async () => { marca(import.meta.url, 'inicio'); await dorme(${seg}); marca(import.meta.url, 'fim'); });\n`;
// um repo git temporário: scripts/suites.json (as suites vêm como [{nome, limite_s, ...}] sobre os ficheiros s/<nome>.*.fx.mjs) e uma unidade por nome
function montar(nome, manifesto, unidades) {
  const d = tmp(`motor-${nome}-`);
  mkdirSync(join(d, 'scripts')); mkdirSync(join(d, 's'));
  copyFileSync(join(FIXTURES, 'sonda.mjs'), join(d, 'sonda.mjs'));
  copyFileSync(join(FIXTURES, 'gitignore'), join(d, '.gitignore'));
  for (const [n, seg] of Object.entries(unidades)) writeFileSync(join(d, 's', `${n}.fx.mjs`), UNIDADE(seg));
  const suites = manifesto.suites.map((s) => ({ tipo: 'node-test', ficheiros: [`s/${s.nome}*.fx.mjs`], ...s }));
  writeFileSync(join(d, 'scripts', 'suites.json'), JSON.stringify({ versao: 1, vagas_globais: 4, carga_sensivel: 4, ...manifesto, suites }));
  gitOk(d, 'init', '-q', '-b', 'main'); gitOk(d, 'config', 'core.autocrlf', 'false'); gitOk(d, 'add', '-A'); gitOk(d, 'commit', '-q', '-m', 'fixture');
  return d;
}
// os motores deste repo (o PID de cada .forge/motor/*.json); regista-os para o `limpa` os matar pela árvore
const motores = (d) => {
  const pasta = join(d, '.forge', 'motor');
  const js = existsSync(pasta) ? readdirSync(pasta).filter((n) => n.endsWith('.json')).map((n) => lerJson(join(pasta, n))) : [];
  for (const j of js) registaPid(j.pid);
  return js;
};
const feitas = (d) => umResultado(d).dados.unidades;

test('C8: a chamada não mata: 4 unidades de 60 s com orcamento_s 20 saem com 3 em ≤ 30 s e acabam todas em pass, sem limite', { timeout: 150000 }, async () => {
  const d = montar('c8', { paralelo: 4, orcamento_s: 20, suites: [{ nome: 'q', limite_s: 480 }] }, { 'q-1': 60, 'q-2': 60, 'q-3': 60, 'q-4': 60 });
  const env = tempPrivado(), codigos = [];
  const r1 = await correr(d, ['--todas'], { env, limite_ms: 60000 });
  motores(d);
  assert.equal(r1.status, 3, saida(r1));
  assert.ok(r1.ms <= 30000, `a 1.ª chamada levou ${Math.round(r1.ms / 1000)} s`);
  codigos.push(r1.status);
  const r2 = await correr(d, ['--todas', '--continuar'], { env, limite_ms: 60000 });
  const fim2 = Date.now();
  codigos.push(r2.status);
  assert.ok(r2.status === 3 || r2.status === 0, saida(r2));
  const ini = Object.fromEntries(feitas(d).map((u) => [u.ficheiro, Date.parse(u.inicio)]));
  assert.equal(Object.keys(ini).length, 4, 'as 4 unidades têm de estar no ficheiro (em_curso ou finais) depois da 2.ª chamada');
  for (const [f, t] of Object.entries(ini)) assert.ok(t < fim2, `${f}: inicio depois do fim da 2.ª chamada`);
  for (let i = 0; i < 4 && codigos.at(-1) === 3; i++) codigos.push((await correr(d, ['--todas', '--continuar'], { env, limite_ms: 60000 })).status);
  assert.equal(codigos.at(-1), 0, `a cadeia não acabou: ${codigos.join(', ')}`);
  const res = umResultado(d).dados;
  assert.deepEqual(validaResultado(res, { raiz: d }), []);
  assert.deepEqual(res.unidades.map((u) => u.estado), ['pass', 'pass', 'pass', 'pass']);
  for (const f of Object.keys(ini)) assert.equal(inicios(d, f).length, 1, `${f} correu mais de uma vez`);
});

test('C7: sem inanição: uma unidade de 30 s com limite_s 480 acaba, num executor com orcamento_s 15, enquanto a fila de outro ocupa as vagas', { timeout: 200000 }, async () => {
  const env = tempPrivado();
  const a = montar('c7a', { paralelo: 2, vagas_globais: 2, carga_sensivel: 2, orcamento_s: 15, suites: [{ nome: 'longa', limite_s: 480 }, { nome: 'curta', limite_s: 60 }] },
    { longa: 30, 'curta-1': 2, 'curta-2': 2 });
  const b = montar('c7b', { paralelo: 2, vagas_globais: 2, carga_sensivel: 2, orcamento_s: 15, suites: [{ nome: 'fila', limite_s: 60 }] },
    Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`fila-${i}`, 8])));
  const t0 = Date.now();
  const B = correr(b, ['--todas'], { env, limite_ms: 120000 });
  const codigos = [(await correr(a, ['--todas'], { env, limite_ms: 120000 })).status];
  motores(a); motores(b);
  for (let i = 0; i < 8 && codigos.at(-1) === 3; i++) codigos.push((await correr(a, ['--todas', '--continuar'], { env, limite_ms: 120000 })).status);
  const total = Date.now() - t0;
  assert.equal(codigos.at(-1), 0, `a cadeia de A não acabou: ${codigos.join(', ')}`);
  const longa = feitas(a).find((u) => u.ficheiro === 's/longa.fx.mjs');
  assert.equal(longa.estado, 'pass', `a unidade longa: ${longa.estado}`);
  const espera = Math.max(0, Date.parse(longa.inicio) - t0);
  assert.ok(total <= 30000 + espera + 20000, `A levou ${Math.round(total / 1000)} s (> 30 s + ${Math.round(espera / 1000)} s de espera por vagas + 20 s)`);
  const rb = await B;
  assert.ok(rb.status === 0 || rb.status === 3, saida(rb));
});

test('C9: retoma depois de morte: matar o PID do motor a meio relança só as unidades sem estado final (pelo inicio e pelo PID)', { timeout: 150000 }, async () => {
  const d = montar('c9', { paralelo: 2, orcamento_s: 10, suites: [{ nome: 'q', limite_s: 60 }] }, { 'q-1': 6, 'q-2': 6, 'q-3': 12, 'q-4': 12 });
  const env = tempPrivado();
  const r1 = await correr(d, ['--todas'], { env, limite_ms: 60000 });
  const [motor] = motores(d);
  assert.equal(r1.status, 3, saida(r1));
  assert.ok(motor && vivo(motor.pid), 'o motor tem de estar vivo depois da 1.ª chamada');
  assert.ok(await esperaAte(() => inicios(d).length === 4, 30000), 'as unidades 3 e 4 não arrancaram');
  const antes = Object.fromEntries(feitas(d).map((u) => [u.ficheiro, u]));
  assert.deepEqual(Object.values(antes).map((u) => u.estado).sort(), ['em_curso', 'em_curso', 'pass', 'pass']);
  mataArvore(motor.pid);
  assert.ok(await esperaAte(() => !vivo(motor.pid), 10000), 'o motor não morreu');
  const morto = Date.now();
  const codigos = [];
  for (let i = 0; i < 4; i++) { codigos.push((await correr(d, ['--todas', '--continuar'], { env, limite_ms: 60000 })).status); motores(d); if (codigos.at(-1) === 0) break; }
  assert.equal(codigos.at(-1), 0, `a cadeia não acabou: ${codigos.join(', ')}`);
  const depois = Object.fromEntries(feitas(d).map((u) => [u.ficheiro, u]));
  for (const [f, u] of Object.entries(antes)) {
    if (u.estado === 'pass') assert.deepEqual({ pid: depois[f].pid, inicio: depois[f].inicio }, { pid: u.pid, inicio: u.inicio }, `${f}: voltou a correr`);
    else assert.ok(depois[f].pid !== u.pid && Date.parse(depois[f].inicio) >= morto, `${f}: não foi relançada depois da morte do motor`);
    assert.equal(depois[f].estado, 'pass', f);
    assert.equal(inicios(d, f).length, u.estado === 'pass' ? 1 : 2, `${f}: arranques`);
  }
  assert.notEqual(motores(d)[0].pid, motor.pid, 'o motor relançado tem de ter outro PID');
});

test('C10: um motor por árvore: duas chamadas --todas em simultâneo dão um só PID de motor, um só ficheiro de resultados e cada unidade uma só vez', { timeout: 100000 }, async () => {
  const d = montar('c10', { paralelo: 3, orcamento_s: 60, suites: [{ nome: 'q', limite_s: 60 }] }, { 'q-1': 3, 'q-2': 3, 'q-3': 3, 'q-4': 3 });
  const env = tempPrivado();
  const [r1, r2] = await Promise.all([correr(d, ['--todas'], { env }), correr(d, ['--todas'], { env })]);
  assert.equal(r1.status, 0, saida(r1));
  assert.equal(r2.status, 0, saida(r2));
  assert.equal(motores(d).length, 1, 'mais de um ficheiro de motor');
  assert.equal(resultados(d).length, 1);
  assert.ok(!existsSync(join(d, '.forge', 'motor', `${resultados(d)[0].nome.replace('.json', '')}.lock`)), 'o lock ficou para trás');
  for (const u of feitas(d)) assert.equal(inicios(d, u.ficheiro).length, 1, `${u.ficheiro} correu mais de uma vez`);
  assert.equal(new Set(feitas(d).map((u) => u.estado)).size, 1);
});

test('o motor sai sozinho e mata a sua árvore quando o ficheiro dele desaparece (pasta apagada)', { timeout: 60000 }, async () => {
  const d = montar('orfao', { paralelo: 2, orcamento_s: 6, suites: [{ nome: 'q', limite_s: 120 }] }, { 'q-1': 100, 'q-2': 100 });
  const r = await correr(d, ['--todas'], { env: tempPrivado(), limite_ms: 30000 });
  const [motor] = motores(d);
  assert.equal(r.status, 3, saida(r));
  assert.ok(vivo(motor.pid));
  const unidades = inicios(d).map((e) => e.ppid);
  assert.equal(unidades.length, 2);
  rmSync(join(d, '.forge', 'motor'), { recursive: true, force: true });
  assert.ok(await esperaAte(() => !vivo(motor.pid) && unidades.every((p) => !vivo(p)), 20000), 'o motor ou as unidades dele ficaram vivos');
});

test('um leitor com o ficheiro de resultados aberto sem partilha (Windows) não deita o motor abaixo: acaba completo', { skip: process.platform !== 'win32' && 'só no Windows', timeout: 100000 }, async () => {
  const d = montar('leitor', { paralelo: 1, orcamento_s: 60, suites: [{ nome: 'q', limite_s: 60 }] }, Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`q-${i}`, 1])));
  const call = correr(d, ['--todas'], { env: tempPrivado(), limite_ms: 90000 });
  assert.ok(await esperaAte(() => resultados(d).length === 1, 30000), 'sem ficheiro de resultados');
  const f = join(d, '.forge', 'resultados', resultados(d)[0].nome);
  const ps = spawn('powershell', ['-NoProfile', '-Command', `$h = [IO.File]::Open('${f}', 'Open', 'Read', 'None'); Start-Sleep 4; $h.Close()`], { stdio: 'ignore', windowsHide: true });
  registaPid(ps.pid);
  const r = await call;
  assert.equal(r.status, 0, saida(r));
  assert.equal(umResultado(d).dados.completo, true);
  assert.equal(feitas(d).length, 8);
});

test('classe EPERM: 3 executores a tomar e largar vagas em ciclo não têm erro fatal nem passam de vagas_globais', { timeout: 150000 }, async () => {
  const env = tempPrivado();
  const repos = [0, 1, 2].map((i) => montar(`rajada${i}`, { paralelo: 2, vagas_globais: 2, carga_sensivel: 2, orcamento_s: 120, suites: [{ nome: 'q', limite_s: 30 }] },
    Object.fromEntries(Array.from({ length: 10 }, (_, j) => [`q-${j}`, 0.2]))));
  const rs = await Promise.all(repos.map((d) => correr(d, ['--todas'], { env, limite_ms: 140000 })));
  for (const r of rs) {
    assert.equal(r.status, 0, saida(r));
    assert.doesNotMatch(r.out, /EPERM|EBUSY|EACCES/);
  }
  for (const d of repos) assert.doesNotMatch(motoresLog(d), /EPERM|EBUSY|EACCES|Error/);
  const ints = repos.flatMap((d) => intervalos(eventos(d)));
  assert.equal(ints.length, 30);
  assert.ok(sobreposicaoMax(ints) <= 2, `${sobreposicaoMax(ints)} unidades ao mesmo tempo com vagas_globais 2`);
});

function motoresLog(d) {
  const pasta = join(d, '.forge', 'motor');
  return existsSync(pasta) ? readdirSync(pasta).filter((n) => n.endsWith('.log')).map((n) => readFileSync(join(pasta, n), 'utf8')).join('\n') : '';
}
