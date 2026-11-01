#!/usr/bin/env node
// Executor paralelo (V-01, #125; spec #123 §4.1 e §4.2): corre as suítes de scripts/suites.json em paralelo, cada ficheiro de teste (ou bloco)
// num filho `node --test` com home e tmp próprios, limite de tempo que mata só a árvore do PID lançado, vagas partilhadas por todos os
// executores da máquina e resultados ligados ao sha e à árvore em .forge/resultados/. Só biblioteca padrão.
//   node scripts/executor.mjs (--todas | --suites a,b) [--passe 1|2] [--continuar] [--paralelo N] [--raiz <dir>]
// Um MOTOR destacado (o próprio script com --motor-interno; PID em .forge/motor/<sha>-<árvore>-p<passe>.json) corre a fila inteira até ao fim e
// grava cada unidade logo que acaba. A chamada só espera pelo motor até orcamento_s e nunca mata unidades; --continuar volta a ligar-se ao
// motor vivo ou, se ele morreu, lança outro só com as unidades sem estado final. O limite_s é só o kill de uma unidade.
// Saída: 0 tudo verde; 1 falha, limite ou erro; 2 erro de uso; 3 incompleto (o motor ainda corre ou morreu: repetir com --continuar).
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, globSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIMITE_PADRAO_S = 240; // unidade de uma suíte sem limite_s
const PASSO_MS = 100; // varredura do agendador e da carga global
const FINAIS = ['pass', 'fail', 'limite', 'erro'];
class Uso extends Error {}

// --- TAP do node --test: contagens das linhas `# pass|fail|skipped|todo` (a última de cada), motivos de `# SKIP`, duration_ms por teste ---
export function lerTap(texto) {
  const ult = (k) => { const m = [...texto.matchAll(new RegExp(`^# ${k} (\\d+)\\s*$`, 'gm'))]; return m.length ? +m[m.length - 1][1] : null; };
  const skips = [], duracoes = {};
  let nome = null;
  for (const l of texto.split(/\r?\n/)) {
    const ok = /^\s*(?:not )?ok \d+ - (.*?)(?: # (SKIP|TODO)\b ?(.*))?$/.exec(l);
    if (ok) { nome = ok[1]; if (ok[2] === 'SKIP') skips.push({ teste: ok[1], motivo: ok[3] ?? '' }); continue; }
    const d = nome !== null && /^\s+duration_ms: ([\d.]+)/.exec(l);
    if (d) { duracoes[nome] = Math.round(+d[1]); nome = null; }
  }
  return { pass: ult('pass'), fail: ult('fail'), skip: ult('skipped'), todo: ult('todo'), skips, duracoes };
}

// o estado de uma unidade que acabou sozinha: um filho sem contagens, ou que não correu nenhum teste, é um falso verde, por isso é «erro»
export function estadoDe(status, c) {
  if (c.pass === null || c.fail === null) return 'erro';
  if (c.fail > 0) return 'fail';
  return status === 0 && c.pass + c.skip + c.todo > 0 ? 'pass' : 'erro';
}

// o estado de uma suíte: o pior das unidades; «em_curso» enquanto faltar alguma por correr
export function estadoSuite(estados, faltam) {
  for (const e of ['fail', 'limite', 'erro']) if (estados.includes(e)) return e;
  return faltam || estados.includes('em_curso') ? 'em_curso' : 'pass';
}

export function arvoreDe(raiz) {
  const g = (...a) => spawnSync('git', a, { cwd: raiz, maxBuffer: 1 << 30 });
  const diff = g('diff', 'HEAD', '--binary').stdout;
  const novos = g('ls-files', '-o', '--exclude-standard', '-z').stdout.toString().split('\0').filter((f) => f && !f.startsWith('.forge/')).sort();
  if (!diff.length && !novos.length) return 'limpa';
  const h = createHash('sha256').update(diff);
  for (const f of novos) {
    let conteudo = '';
    try { conteudo = createHash('sha256').update(readFileSync(join(raiz, f))).digest('hex'); } catch { /* pasta ou ligação: só o nome conta */ }
    h.update(`\0${f}\0${conteudo}`);
  }
  return `suja:${h.digest('hex')}`;
}

// --- vagas globais: os.tmpdir()/forge-vagas/<n> (mkdir atómico, info.json com o PID do executor); `x` é a exclusiva ---
const vivoPid = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const lerInfo = (dir) => { try { return JSON.parse(readFileSync(join(dir, 'info.json'), 'utf8')); } catch { return null; } };
const rm = (d) => { try { rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* ocupada por outro processo: fica para a próxima recuperação */ } };
// um dono vivo, ou uma pasta acabada de criar (sem info.json há < 10 s)
function ocupada(dir) {
  const i = lerInfo(dir);
  if (i) return vivoPid(i.pid);
  try { return Date.now() - statSync(dir).mtimeMs < 10000; } catch { return false; }
}

class Vagas {
  constructor(n, carga) {
    this.dir = join(tmpdir(), 'forge-vagas');
    this.n = n; this.cargaSensivel = carga; this.minhas = new Set();
    mkdirSync(this.dir, { recursive: true });
  }
  slot(i) { return join(this.dir, i === 'x' ? 'x' : String(i)); }
  // só quem tem o `recupera` apaga pastas de donos mortos, por isso um dono vivo nunca perde a sua
  recupera(dir) {
    const lock = join(this.dir, 'recupera');
    try { mkdirSync(lock); } catch { try { if (Date.now() - statSync(lock).mtimeMs > 10000) rm(lock); } catch { /* outro executor */ } return; }
    try { if (!ocupada(dir)) rm(dir); } finally { rm(lock); }
  }
  toma(dir, info) {
    for (let t = 0; t < 2; t++) {
      try {
        mkdirSync(dir);
        try { writeFileSync(join(dir, 'info.json'), JSON.stringify(info)); } catch { rm(dir); return false; } // a pasta desapareceu a meio: tenta-se outra vez
        this.minhas.add(dir);
        return true;
      } catch (e) {
        if (['EPERM', 'EACCES', 'EBUSY'].includes(e.code)) return false; // Windows: a pasta de outro executor está a ser apagada
        if (e.code === 'ENOENT') { mkdirSync(this.dir, { recursive: true }); continue; }
        if (e.code !== 'EEXIST') throw e;
        if (ocupada(dir)) return false;
        this.recupera(dir);
      }
    }
    return false;
  }
  larga(dirs) { for (const d of dirs) { this.minhas.delete(d); rm(d); } }
  largaTudo() { this.larga([...this.minhas]); }
  // as vagas vivas e o que dizem: a carga conta uma exclusiva uma só vez; o limite é o menor carga_sensivel de uma unidade sensível
  estado() {
    const infos = [];
    for (let i = 0; i < this.n; i++) { const d = this.slot(i); if (ocupada(d)) infos.push(lerInfo(d) ?? { pid: 0 }); }
    const carga = infos.filter((i) => !i.exclusiva).length + new Set(infos.filter((i) => i.exclusiva).map((i) => i.pid)).size;
    return { carga, limite: Math.min(Infinity, ...infos.filter((i) => i.sensivel).map((i) => i.carga_sensivel)) };
  }
  // uma vaga para a unidade, ou null; depois de escrever a info, relê-se tudo: quem chega por último vê os outros e desiste se passar o limite
  tenta(u) {
    const { sensivel_ao_tempo: sensivel, exclusiva } = u.suite;
    if (exclusiva) return this.tentaExclusiva(u);
    if (ocupada(this.slot('x'))) return null;
    for (let i = 0; i < this.n; i++) {
      const d = this.slot(i);
      if (!this.toma(d, { pid: process.pid, sensivel: !!sensivel, carga_sensivel: this.cargaSensivel })) continue;
      const { carga, limite } = this.estado();
      if (ocupada(this.slot('x')) || carga > limite) { this.larga([d]); return null; }
      return { dirs: [d], carga };
    }
    return null;
  }
  // a exclusiva toma o `x` (ninguém mais arranca) e depois todas as vagas, à medida que se libertam
  tentaExclusiva(u) {
    u.dirs ??= [];
    if (!u.xTomado) { if (!this.toma(this.slot('x'), { pid: process.pid })) return null; u.xTomado = true; }
    for (let i = 0; i < this.n; i++) {
      const d = this.slot(i);
      if (!u.dirs.includes(d) && this.toma(d, { pid: process.pid, exclusiva: true })) u.dirs.push(d);
    }
    return u.dirs.length === this.n ? { dirs: [...u.dirs, this.slot('x')], carga: 1 } : null;
  }
}

// --- processos: só a árvore do PID que este executor lançou, nunca por nome ---
function mataArvore(pid) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  else { try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* já morreu */ } } }
}

function lerArgs(argv) {
  const o = { suites: null, passe: 1, continuar: false, paralelo: null, raiz: process.cwd(), arvoreMotor: null };
  const valor = (i, nome) => { if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new Uso(`${nome} precisa de um valor`); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--todas') o.suites = o.suites ?? '*';
    else if (a === '--suites') o.suites = valor(i++, a).split(',').filter(Boolean);
    else if (a === '--passe') { o.passe = +valor(i++, a); if (![1, 2].includes(o.passe)) throw new Uso('--passe: 1 ou 2'); }
    else if (a === '--continuar') o.continuar = true;
    else if (a === '--paralelo') { o.paralelo = +valor(i++, a); if (!Number.isInteger(o.paralelo) || o.paralelo < 1) throw new Uso('--paralelo: inteiro ≥ 1'); }
    else if (a === '--raiz') o.raiz = resolve(valor(i++, a));
    else if (a === '--motor-interno') o.arvoreMotor = valor(i++, a); // só a chamada o passa ao motor: a árvore com que a chamada decidiu
    else if (a === '--afetadas') throw new Uso('--afetadas ainda não existe (V-02)');
    else throw new Uso(`argumento desconhecido: ${a}`);
  }
  if (!o.suites) throw new Uso('indique --todas ou --suites a,b');
  return o;
}

function lerManifesto(raiz) {
  const f = join(raiz, 'scripts', 'suites.json');
  if (!existsSync(f)) throw new Uso(`falta ${f}`);
  const texto = readFileSync(f, 'utf8'), m = JSON.parse(texto);
  if (m.versao !== 1 || !Array.isArray(m.suites)) throw new Uso('suites.json: versao 1 com suites[] esperada');
  for (const k of ['paralelo', 'vagas_globais', 'carga_sensivel', 'orcamento_s']) if (!(m[k] > 0)) throw new Uso(`suites.json: ${k} inválido`);
  for (const s of m.suites) {
    if (s.tipo !== 'node-test') throw new Uso(`suite ${s.nome}: tipo ${s.tipo} não suportado (só node-test)`);
    s.limite_s ??= LIMITE_PADRAO_S;
  }
  m.hash = createHash('sha256').update(texto).digest('hex');
  return m;
}

// a duração (s) de cada unidade no último resultado com o mesmo manifesto; as unidades sem medida contam pelo limite_s (o pior caso)
function duracoesAnteriores(pasta, hash) {
  let melhor = null;
  const recentes = (existsSync(pasta) ? readdirSync(pasta) : []).filter((n) => n.endsWith('.json'))
    .map((n) => ({ n, t: statSync(join(pasta, n)).mtimeMs })).sort((a, b) => b.t - a.t).slice(0, 5); // só os 5 mais recentes: a pasta cresce com cada sha
  for (const { n } of recentes) {
    const r = lerJsonSeguro(join(pasta, n));
    if (r?.manifesto === hash && (!melhor || Date.parse(r.fim) > Date.parse(melhor.fim))) melhor = r;
  }
  return new Map((melhor?.unidades ?? []).filter((u) => u.estado === 'pass').map((u) => [`${u.ficheiro}\0${u.bloco ?? ''}`, u.duracao_s]));
}

// as unidades por correr, pela ordem do agendamento: as exclusivas primeiro (com a máquina vazia correm seguidas; no fim, cada uma esperava
// pelas outras), depois as normais e por fim as sensíveis ao tempo (cada uma prende a carga global a carga_sensivel enquanto corre); dentro
// de cada classe, as mais longas primeiro (a duração medida, ou o limite_s), para encurtar o fim do passe
function planeia(m, escolha, raiz, medidas) {
  const nomes = m.suites.map((s) => s.nome);
  if (escolha !== '*') { const f = escolha.filter((n) => !nomes.includes(n)); if (f.length) throw new Uso(`suites desconhecidas: ${f.join(', ')}`); }
  const us = [];
  for (const s of m.suites.filter((x) => escolha === '*' || escolha.includes(x.nome))) {
    const ficheiros = [...new Set(s.ficheiros.flatMap((g) => globSync(g, { cwd: raiz }).map((f) => f.replaceAll('\\', '/'))))].sort();
    if (!ficheiros.length) throw new Uso(`suite ${s.nome}: nenhum ficheiro casa`);
    // um bloco é o padrão (texto) ou {padrao, limite_s}: o limite_s do bloco, se houver, substitui o da suíte
    for (const ficheiro of ficheiros) for (const b of s.blocos?.[ficheiro] ?? [null]) {
      const bloco = b === null || typeof b === 'string' ? b : b.padrao, limite_s = b?.limite_s ?? s.limite_s, chave = `${ficheiro}\0${bloco ?? ''}`;
      us.push({ suite: s, ficheiro, bloco, chave, limite_s, peso: medidas.get(chave) ?? limite_s });
    }
  }
  us.forEach((u, i) => { u.ordem = i; });
  const classe = (u) => (u.suite.exclusiva ? 0 : u.suite.sensivel_ao_tempo ? 2 : 1);
  return us.toSorted((a, b) => classe(a) - classe(b) || b.peso - a.peso || a.ordem - b.ordem);
}

const lerJsonSeguro = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

// o que a chamada e o motor partilham: manifesto, sha, árvore, plano e os caminhos do passe
function prepara(argv) {
  const o = lerArgs(argv), raiz = o.raiz, m = lerManifesto(raiz);
  const rev = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: raiz, encoding: 'utf8' });
  if (rev.status !== 0) throw new Uso(`${raiz} não é um repositório git`);
  const sha = rev.stdout.trim(), arvore = o.arvoreMotor ?? arvoreDe(raiz);
  const pasta = join(raiz, '.forge', 'resultados');
  const plano = planeia(m, o.suites, raiz, duracoesAnteriores(pasta, m.hash));
  const marca = `${sha}-${arvore === 'limpa' ? 'limpa' : arvore.replace(':', '-')}-p${o.passe}`;
  return { o, raiz, m, sha, arvore, plano, pasta, marca, ficheiro: join(pasta, `${marca}.json`), motorDir: join(raiz, '.forge', 'motor') };
}

// as unidades do ficheiro de resultados com estado final (só as deste sha e desta árvore)
function lerFeitas(c) {
  const feitas = new Map();
  const antigo = existsSync(c.ficheiro) ? lerJsonSeguro(c.ficheiro) : null;
  if (antigo?.sha !== c.sha || antigo?.arvore !== c.arvore) return { feitas, inicio: null };
  for (const u of antigo.unidades) if (FINAIS.includes(u.estado)) feitas.set(`${u.ficheiro}\0${u.bloco ?? ''}`, u);
  return { feitas, inicio: antigo.inicio };
}

// --- a chamada: liga-se ao motor (ou lança-o), espera até orcamento_s e devolve o código; nunca mata unidades ---
// shortcut: o motor está vivo se o ficheiro dele não tem `fim` e o PID existe (sem confirmar o inicio do processo: um PID reutilizado depois de um kill duro engana)
const motorVivo = (f) => { const j = lerJsonSeguro(f); return j && !j.fim && j.pid > 0 && vivoPid(j.pid) ? j : null; };
const cobre = (motor, pedido) => motor === '*' || (pedido !== '*' && pedido.every((n) => motor.includes(n)));

async function chamada(argv, saida) {
  const c = prepara(argv), { o, raiz, m, plano, marca } = c, t0 = Date.now();
  const motorFicheiro = join(c.motorDir, `${marca}.json`), lock = join(c.motorDir, `${marca}.lock`);
  mkdirSync(join(c.pasta, 'logs'), { recursive: true });
  mkdirSync(c.motorDir, { recursive: true });
  const faltam = () => { const { feitas } = lerFeitas(c); return plano.filter((u) => !feitas.has(u.chave)).length; };

  // um só motor por sha, árvore e passe: quem toma o lock (mkdir atómico) decide e lança; os outros esperam e ligam-se ao que ele deixou
  let motor = null;
  for (let i = 0; !motor && i < 300; i++) {
    motor = motorVivo(motorFicheiro);
    if (motor || (o.continuar && !faltam())) break;
    try { mkdirSync(lock); } catch {
      try { if (Date.now() - statSync(lock).mtimeMs > 10000) rm(lock); } catch { /* o dono acabou de a apagar */ }
      await dorme(100);
      continue;
    }
    try {
      motor = motorVivo(motorFicheiro);
      if (!motor) {
        if (!o.continuar) rm(c.ficheiro); // uma corrida nova não herda o resultado antigo
        const log = openSync(join(c.motorDir, `${marca}.log`), 'a');
        // o cwd do motor é a pasta deste script: uma pasta de teste apagada pelo utilizador nunca fica presa ao processo
        const p = spawn(process.execPath, [fileURLToPath(import.meta.url), ...argv, '--raiz', raiz, '--motor-interno', c.arvore], {
          cwd: dirname(fileURLToPath(import.meta.url)), stdio: ['ignore', log, log], windowsHide: true, detached: true });
        p.unref();
        closeSync(log);
        motor = { pid: p.pid, sha: c.sha, arvore: c.arvore, passe: o.passe, suites: o.suites, inicio: new Date().toISOString() };
        writeFileSync(motorFicheiro, JSON.stringify(motor));
      }
    } finally { rm(lock); }
  }

  if (motor && !cobre(motor.suites, o.suites)) saida(`executor: o motor ${motor.pid} corre outra seleção de suítes; a esperar por ele`);
  while (motorVivo(motorFicheiro) && Date.now() - t0 < m.orcamento_s * 1000) await dorme(250);
  const vivo = !!motorVivo(motorFicheiro);

  const { feitas } = lerFeitas(c);
  const sel = plano.map((u) => feitas.get(u.chave)).filter(Boolean), mau = sel.filter((u) => u.estado !== 'pass');
  const resto = plano.length - sel.length, seg = Math.round((Date.now() - t0) / 1000);
  if (resto) {
    saida(`executor: ${sel.length}/${plano.length} unidades, ${mau.length} com falha, limite ou erro, ${resto} por acabar em ${seg} s`
      + (vivo ? `; o motor ${motor.pid} continua a correr: repita com --continuar` : '; o motor morreu antes de acabar: repita com --continuar para relançar o resto'));
    if (!vivo && existsSync(join(c.motorDir, `${marca}.log`))) saida(readFileSync(join(c.motorDir, `${marca}.log`), 'utf8').split(/\r?\n/).slice(-6).join('\n'));
    return 3;
  }
  saida(`executor: ${sel.length}/${plano.length} unidades, ${sel.length - mau.length} pass, ${mau.length} com falha, limite ou erro em ${seg} s → ${c.ficheiro}`);
  return mau.length ? 1 : 0;
}

// --- o motor: corre a fila inteira e sai sozinho; mata só a árvore das unidades que lançou ---
async function motorCorre(argv, saida) {
  const c = prepara(argv), { o, raiz, m, plano, marca, ficheiro } = c;
  const motorFicheiro = join(c.motorDir, `${marca}.json`);
  mkdirSync(join(c.pasta, 'logs'), { recursive: true });

  // retoma: as unidades com estado final deste mesmo sha e árvore não voltam a correr
  const { feitas, inicio: inicioAntigo } = o.continuar ? lerFeitas(c) : { feitas: new Map(), inicio: null };
  const inicio = inicioAntigo ?? new Date().toISOString();
  const fila = plano.filter((u) => !feitas.has(u.chave));
  const ordemChave = new Map(plano.toSorted((a, b) => a.ordem - b.ordem).map((u, i) => [u.chave, i]));
  const correm = new Set();
  const tapDe = (u) => `.forge/resultados/logs/${marca}-${u.suite.nome}-${u.ficheiro.replaceAll('/', '_')}${u.bloco ? `-b${plano.indexOf(u)}` : ''}.tap`;
  const emCurso = (r) => ({ suite: r.u.suite.nome, ficheiro: r.u.ficheiro, bloco: r.u.bloco, estado: 'em_curso', pass: 0, fail: 0, skip: 0, todo: 0, skips: [],
    duracoes: {}, duracao_s: 0, concorrentes_max: r.cmax, pid: r.pid, inicio: r.inicio.toISOString(), tap: tapDe(r.u) });

  const escreve = (completo) => {
    const unidades = [...feitas.values(), ...[...correm].map(emCurso)].sort((a, b) => (ordemChave.get(`${a.ficheiro}\0${a.bloco ?? ''}`) ?? 1e9) - (ordemChave.get(`${b.ficheiro}\0${b.bloco ?? ''}`) ?? 1e9));
    const suites = {};
    for (const nome of new Set(unidades.map((u) => u.suite))) {
      const us = unidades.filter((u) => u.suite === nome), soma = (k) => us.reduce((a, u) => a + u[k], 0);
      const falta = plano.some((p) => p.suite.nome === nome && !feitas.has(p.chave));
      suites[nome] = { estado: estadoSuite(us.map((u) => u.estado), falta), pass: soma('pass'), fail: soma('fail'), skip: soma('skip') };
    }
    const cmd = argv.slice(0, argv.indexOf('--motor-interno')).join(' ');
    const dados = { versao: 1, sha: c.sha, arvore: c.arvore, node: process.version, comando: `node scripts/executor.mjs ${cmd}`.trim(), manifesto: m.hash,
      inicio, fim: new Date().toISOString(), completo, unidades, suites };
    writeFileSync(`${ficheiro}.tmp`, JSON.stringify(dados, null, 2));
    renameSync(`${ficheiro}.tmp`, ficheiro);
  };

  const vagas = new Vagas(m.vagas_globais, m.carga_sensivel);
  const raizTmp = mkdtempSync(join(tmpdir(), 'forge-exec-'));
  const limpa = () => {
    for (const r of correm) mataArvore(r.pid);
    vagas.largaTudo(); rm(raizTmp);
    const j = lerJsonSeguro(motorFicheiro);
    if (j?.pid === process.pid) { try { writeFileSync(motorFicheiro, JSON.stringify({ ...j, fim: new Date().toISOString() })); } catch { /* a pasta desapareceu */ } }
  };
  process.once('exit', limpa);
  for (const sinal of ['SIGINT', 'SIGTERM']) process.once(sinal, () => process.exit(130));

  const t0 = Date.now(), paralelo = o.paralelo ?? m.paralelo;
  const lanca = (u, vaga) => {
    const dir = join(raizTmp, `u${u.ordem}`), home = join(dir, 'home'), tmp = join(dir, 'tmp');
    mkdirSync(home, { recursive: true }); mkdirSync(tmp, { recursive: true });
    const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: home, TMP: tmp, TEMP: tmp, TMPDIR: tmp, DISABLE_AUTOUPDATER: '1' };
    delete env.NODE_TEST_CONTEXT;
    for (const [k, v] of Object.entries(u.suite.env ?? {})) {
      if (v !== '@real') env[k] = String(v);
      else if (process.env[k] === undefined) delete env[k];
      else env[k] = process.env[k];
    }
    const args = ['--test', '--test-reporter=tap'];
    if (u.suite.concorrencia) args.push(`--test-concurrency=${u.suite.concorrencia}`);
    if (u.bloco) args.push(`--test-name-pattern=${u.bloco}`);
    args.push(u.ficheiro);
    const r = { u, vaga, cmax: vaga.carga, inicio: new Date(), limite: false, out: '', err: '' };
    const p = spawn(process.execPath, args, { cwd: raiz, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32' });
    r.pid = p.pid;
    p.stdout.on('data', (b) => { r.out += b; });
    p.stderr.on('data', (b) => { r.err += b; });
    r.relogio = setTimeout(() => { r.limite = true; mataArvore(p.pid); }, u.limite_s * 1000);
    r.fim = new Promise((resolver) => {
      let feito = false;
      const acaba = () => { if (!feito) { feito = true; clearTimeout(r.relogio); p.stdout.destroy(); p.stderr.destroy(); resolver(); } };
      p.on('close', acaba);
      p.on('exit', (status) => { r.status = status; setTimeout(acaba, 2000); }); // um neto com o stdio herdado não prende a unidade
      p.on('error', (e) => { r.err += String(e); acaba(); });
    });
    correm.add(r);
    escreve(false);
    r.fim.then(() => termina(r));
  };

  const termina = (r) => {
    correm.delete(r);
    vagas.larga(r.vaga.dirs);
    const cont = lerTap(r.out), { u } = r;
    const estado = r.limite ? 'limite' : r.status === null || r.status === undefined ? 'erro' : estadoDe(r.status, cont);
    const tap = tapDe(u);
    writeFileSync(join(raiz, tap), r.out);
    if (r.err) writeFileSync(join(raiz, `${tap}.err`), r.err);
    feitas.set(u.chave, { suite: u.suite.nome, ficheiro: u.ficheiro, bloco: u.bloco, estado, pass: cont.pass ?? 0, fail: cont.fail ?? 0, skip: cont.skip ?? 0, todo: cont.todo ?? 0,
      skips: cont.skips, duracoes: cont.duracoes, duracao_s: Math.round((Date.now() - r.inicio) / 100) / 10, concorrentes_max: r.cmax, pid: r.pid, inicio: r.inicio.toISOString(), tap });
    escreve(false);
    if (estado !== 'pass') saida(`${estado.toUpperCase()} ${u.ficheiro}${u.bloco ? ` [${u.bloco}]` : ''} (${cont.pass ?? 0} pass, ${cont.fail ?? 0} fail) → ${tap}`);
  };

  // o agendador: lança o que cabe nas vagas e nas faixas (o limite_s não entra); a carga global de cada unidade que corre é medida a cada passo
  const porLancar = () => fila.filter((u) => !feitas.has(u.chave) && ![...correm].some((r) => r.u === u));
  while (porLancar().length || correm.size) {
    // o ficheiro do motor desapareceu (a pasta foi apagada): sai e mata a sua árvore; os primeiros 5 s dão tempo à chamada que o lançou de o gravar
    if (Date.now() - t0 > 5000 && !existsSync(motorFicheiro)) process.exit(1);
    for (const u of porLancar()) {
      if (correm.size >= paralelo) break;
      let vaga = null;
      try { vaga = vagas.tenta(u); } catch { /* o sistema de ficheiros das vagas falhou neste passo: um erro a meio da corrida não deita abaixo as unidades que correm */ }
      if (vaga) lanca(u, vaga);
      else if (u.suite.exclusiva) break;
    }
    if (correm.size) { const { carga } = vagas.estado(); for (const r of correm) r.cmax = Math.max(r.cmax, carga); }
    await dorme(PASSO_MS + Math.floor(Math.random() * PASSO_MS));
  }

  escreve(plano.every((u) => feitas.has(u.chave)));
  saida(`motor ${process.pid}: ${plano.length} unidades em ${Math.round((Date.now() - t0) / 1000)} s`);
  return 0;
}

export async function executa(argv, { saida = (l) => console.log(l) } = {}) {
  return argv.includes('--motor-interno') ? motorCorre(argv, saida) : chamada(argv, saida);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  executa(process.argv.slice(2)).then((c) => process.exit(c), (e) => {
    console.error(e instanceof Uso ? `executor: ${e.message}` : e);
    process.exit(e instanceof Uso ? 2 : 1);
  });
}
