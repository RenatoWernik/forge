// O motor destacado do executor (V-01, #125, REDESENHO C7–C10): sem inanição das unidades longas, a chamada não mata, retoma depois da morte do
// motor, um só motor por árvore, e vagas a rodar sem erro fatal. Os repos são gerados aqui (manifesto + unidades que dormem N s e registam
// o início e o fim em .sonda/); cada cenário tem um TEMP privado, por isso as vagas da máquina ficam intactas. Reutiliza o arnês dos ataques.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURES, correr, esperaAte, eventos, gitOk, inicios, intervalos, lerJson, limpa, mataArvore, registaPid, resultados, saida, sobreposicaoMax,
  tempPrivado, tmp, umResultado, validaResultado, vivo } from './helpers.mjs';

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

test('C3: a chamada à espera sai com 2 e o resultado fica valido:false se a árvore mudar com o motor vivo; nada fica pass sobre o conteúdo novo e o --continuar recomeça', { timeout: 120000 }, async () => {
  const d = montar('invalida', { paralelo: 1, orcamento_s: 60, suites: [{ nome: 'q', limite_s: 60 }] }, { 'q-1': 3, 'q-2': 3, 'q-3': 3 });
  const env = tempPrivado();
  const call = correr(d, ['--todas'], { env, limite_ms: 100000 });
  assert.ok(await esperaAte(() => inicios(d).length === 1, 30000), 'a primeira unidade não arrancou');
  writeFileSync(join(d, 's', 'q-3.fx.mjs'), `${UNIDADE(3)}// editado com o motor vivo\n`);
  const r = await call;
  motores(d);
  assert.equal(r.status, 2, saida(r));
  assert.match(r.out, /invalidado/);
  const res = umResultado(d).dados;
  assert.equal(res.valido, false);
  assert.equal(res.completo, false);
  assert.ok(res.unidades.every((u) => u.estado === 'invalidado' || u.estado === 'pass'), JSON.stringify(res.unidades.map((u) => u.estado)));
  assert.ok(inicios(d).length < 3, 'o motor lançou unidades depois da mudança');
  gitOk(d, 'checkout', '--', 's/q-3.fx.mjs'); // de volta à árvore limpa: o resultado invalidado não serve ao --continuar
  const r2 = await correr(d, ['--todas', '--continuar'], { env, limite_ms: 100000 });
  motores(d);
  assert.equal(r2.status, 0, saida(r2));
  assert.equal(umResultado(d).dados.valido, undefined);
  assert.deepEqual(feitas(d).map((u) => u.estado), ['pass', 'pass', 'pass']);
});

test('identidade(pid): hora de arranque e linha de comando do processo; um PID que não existe dá null', async () => {
  const { identidade } = await import('../../../scripts/executor.mjs');
  const eu = identidade(process.pid);
  assert.ok(eu && eu.inicio && eu.cmd.includes('node'), JSON.stringify(eu));
  assert.deepEqual(identidade(process.pid)?.inicio, eu.inicio);
  assert.equal(identidade(2 ** 22 + 12345), null);
  assert.equal(identidade('1; echo x'), null);
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

// --- classe «um motor destacado nunca abre consolas nem fica em ciclo» (a causa: um spawn sem windowsHide num processo sem consola abre uma janela por chamada) ---
const EXECUTOR_SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'scripts', 'executor.mjs');

test('classe windowsHide: todo spawn, spawnSync, execFile, exec e fork de scripts/executor.mjs leva windowsHide: true nos argumentos', () => {
  const src = readFileSync(EXECUTOR_SRC, 'utf8');
  const falhas = [], vistos = [];
  for (const m of src.matchAll(/(?<![.\w])(spawn|spawnSync|execFile|execFileSync|exec|execSync|fork)\(/g)) {
    let fundo = 1, i = m.index + m[0].length;
    while (i < src.length && fundo > 0) { const ch = src[i++]; if (ch === '(') fundo++; else if (ch === ')') fundo--; }
    const chamada = src.slice(m.index, i), linha = src.slice(0, m.index).split('\n').length;
    vistos.push(linha);
    if (!/windowsHide:\s*true/.test(chamada)) falhas.push(`linha ${linha}: ${chamada.slice(0, 70)}`);
  }
  assert.ok(vistos.length >= 2, `o lint não encontrou chamadas de spawn (${vistos.length}): o padrão está errado`);
  assert.deepEqual(falhas, []);
});

test('classe git falha: se o git não consegue verificar o HEAD e a árvore, o motor marca valido:false com o motivo e sai (sem retry em ciclo)', { timeout: 90000 }, async () => {
  const d = montar('gitfalha', { paralelo: 1, orcamento_s: 4, suites: [{ nome: 'q', limite_s: 60 }] }, { 'q-1': 5, 'q-2': 5, 'q-3': 5 });
  const r = await correr(d, ['--todas'], { env: tempPrivado(), limite_ms: 40000 });
  const [motor] = motores(d);
  assert.equal(r.status, 3, saida(r));
  assert.ok(motor && vivo(motor.pid), 'o motor tem de estar vivo depois da 1.ª chamada');
  writeFileSync(join(d, '.git', 'HEAD'), 'lixo\n'); // o git passa a sair com 128
  assert.ok(await esperaAte(() => !vivo(motor.pid), 20000), 'o motor continuou vivo com o git a falhar');
  const res = umResultado(d).dados;
  assert.equal(res.valido, false);
  assert.equal(res.completo, false);
  assert.match(res.motivo, /git|verificar/);
  assert.ok(inicios(d).length < 3, 'o motor lançou unidades com o git a falhar');
});

test('classe raiz apagada: um motor cuja raiz é apagada a meio sai em ≤ 10 s e não deixa unidades vivas', { timeout: 90000 }, async () => {
  const d = montar('raizapagada', { paralelo: 2, orcamento_s: 6, suites: [{ nome: 'q', limite_s: 120 }] }, { 'q-1': 100, 'q-2': 100 });
  const r = await correr(d, ['--todas'], { env: tempPrivado(), limite_ms: 30000 });
  const [motor] = motores(d);
  assert.equal(r.status, 3, saida(r));
  assert.ok(motor && vivo(motor.pid));
  const unidades = feitas(d).map((u) => u.pid);
  assert.equal(unidades.length, 2);
  for (const p of unidades) registaPid(p);
  // Windows: a pasta que é cwd de uma unidade não se apaga; apaga-se tudo o que está dentro, entrada a entrada, e o que falhar fica
  for (const n of readdirSync(d)) { try { rmSync(join(d, n), { recursive: true, force: true }); } catch { /* preso por uma unidade */ } }
  try { rmSync(d, { recursive: true, force: true }); } catch { /* idem */ }
  assert.ok(!existsSync(join(d, '.git')), 'o teste não conseguiu apagar o .git');
  const t0 = Date.now();
  assert.ok(await esperaAte(() => !vivo(motor.pid), 10000), 'o motor continuou vivo mais de 10 s depois de a raiz ser apagada');
  assert.ok(Date.now() - t0 <= 10000);
  assert.ok(await esperaAte(() => unidades.every((p) => !vivo(p)), 10000), 'as unidades do motor ficaram vivas');
});

test('classe spawns: o número de processos que o motor lança não cresce com o tempo de espera por vagas (sem git a cada passo do agendador)', { timeout: 90000 }, async () => {
  const env = tempPrivado();
  const vagas = join(env.TEMP, 'forge-vagas', '0'); // a única vaga global fica presa durante ~6 s por um dono vivo (este processo)
  mkdirSync(vagas, { recursive: true });
  writeFileSync(join(vagas, 'info.json'), JSON.stringify({ pid: process.pid, sensivel: false, carga_sensivel: 1 }));
  const d = montar('spawns', { paralelo: 2, vagas_globais: 1, carga_sensivel: 1, orcamento_s: 40, suites: [{ nome: 'q', limite_s: 60 }] }, { 'q-1': 2, 'q-2': 2 });
  setTimeout(() => rmSync(vagas, { recursive: true, force: true }), 6000);
  const r = await correr(d, ['--todas'], { env, limite_ms: 60000 });
  motores(d);
  assert.equal(r.status, 0, saida(r));
  const res = umResultado(d).dados;
  assert.ok(Number.isInteger(res.processos), `o resultado não traz o contador de processos: ${res.processos}`);
  assert.ok(res.processos <= 2 * 8 + 5, `o motor lançou ${res.processos} processos para 2 unidades`);
});

test('C9 (batimento): um fail real, longe da morte do motor (> 5 s antes do último batimento), continua final e a unidade não volta a correr', { timeout: 150000 }, async () => {
  const d = montar('failreal', { paralelo: 2, orcamento_s: 6, suites: [{ nome: 'q', limite_s: 60 }] }, { 'q-1': 1, 'q-2': 25 });
  writeFileSync(join(d, 's', 'q-1.fx.mjs'), `import { test } from 'node:test';\nimport { marca } from '../sonda.mjs';\ntest('falha a sério', () => { marca(import.meta.url, 'inicio'); throw new Error('falha real'); });\n`);
  gitOk(d, 'commit', '-qam', 'q-1 falha');
  const env = tempPrivado();
  const r1 = await correr(d, ['--todas'], { env, limite_ms: 60000 });
  const [motor] = motores(d);
  assert.equal(r1.status, 3, saida(r1));
  assert.ok(await esperaAte(() => feitas(d).find((u) => u.ficheiro === 's/q-1.fx.mjs')?.estado === 'fail', 15000), 'o q-1 não ficou em fail');
  const fimFail = Date.parse(feitas(d).find((u) => u.ficheiro === 's/q-1.fx.mjs').fim);
  assert.ok(await esperaAte(() => lerJson(join(d, '.forge', 'motor', readdirSync(join(d, '.forge', 'motor')).find((n) => n.endsWith('.json.bat')))).t - fimFail > 6000, 20000), 'o batimento não avançou 6 s depois do fail');
  mataArvore(motor.pid);
  assert.ok(await esperaAte(() => !vivo(motor.pid), 10000), 'o motor não morreu');
  const codigos = [];
  for (let i = 0; i < 4; i++) { codigos.push((await correr(d, ['--todas', '--continuar'], { env, limite_ms: 90000 })).status); motores(d); if (codigos.at(-1) !== 3) break; }
  assert.equal(codigos.at(-1), 1, `a cadeia devia acabar com 1 (um fail real): ${codigos.join(', ')}`);
  const us = Object.fromEntries(feitas(d).map((u) => [u.ficheiro, u.estado]));
  assert.deepEqual(us, { 's/q-1.fx.mjs': 'fail', 's/q-2.fx.mjs': 'pass' });
  assert.equal(inicios(d, 's/q-1.fx.mjs').length, 1, 'o fail real voltou a correr');
});

test('faixa sensível por ficheiro: sensivel_ao_tempo com uma lista de ficheiros prende a carga só enquanto esses correm; os outros da suíte correm juntos', { timeout: 90000 }, async () => {
  const d = montar('sensivelficheiro', { paralelo: 4, vagas_globais: 4, carga_sensivel: 1, orcamento_s: 60,
    suites: [{ nome: 'q', limite_s: 60, sensivel_ao_tempo: ['s/q-a.fx.mjs', 's/q-b.fx.mjs'] }] }, { 'q-a': 3, 'q-b': 3, 'q-c': 3, 'q-d': 3 });
  const r = await correr(d, ['--todas'], { env: tempPrivado(), limite_ms: 80000 });
  motores(d);
  assert.equal(r.status, 0, saida(r));
  const ints = intervalos(eventos(d)), por = (f) => ints.find((i) => i.f === `s/${f}.fx.mjs`);
  assert.equal(ints.length, 4);
  assert.ok(sobreposicaoMax([por('q-c'), por('q-d')]) >= 2, 'as unidades não marcadas deviam correr juntas');
  for (const f of ['q-a', 'q-b']) assert.equal(sobreposicaoMax(ints, por(f).ini, por(f).fim), 1, `${f} (sensível) correu com outras unidades`);
  assert.equal(Object.fromEntries(feitas(d).map((u) => [u.ficheiro, u.concorrentes_max]))['s/q-a.fx.mjs'], 1);
});

function motoresLog(d) {
  const pasta = join(d, '.forge', 'motor');
  return existsSync(pasta) ? readdirSync(pasta).filter((n) => n.endsWith('.log')).map((n) => readFileSync(join(pasta, n), 'utf8')).join('\n') : '';
}
