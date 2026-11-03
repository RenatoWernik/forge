// V-05 (#129) C2, ponta real, contrato revisto («RESPOSTA do orquestrador» de 2026-11-03, opção A, aprovada pelo utilizador): na base (o HEAD deste repo),
// com um diff fictício que só toca num ficheiro de tests/critico/f-27-r0/, numa só corrida e com a máquina livre (CPU < 50 % antes de começar e sem
// outro executor), o check-ticket dá 0 em ≤ 30 min de relógio, somando as chamadas `--continuar`. O passo não pode ter esperas vazias: uma paragem de
// mais de 5 min com CPU < 10 % e unidades por acabar é falha. O tempo medido fica em <pasta>/c2/estado.json, para o crítico o registar.
// A corrida é um clone novo do HEAD (origin/main = HEAD, mais um commit que acrescenta uma linha de comentário ao c1-limite.test.mjs) e corre com o
// TEMP real da máquina (as vagas globais reais). Só corre com FORGE_V05_PONTA=<pasta>; é retomável, como o C3: cada chamada faz UMA chamada ao
// check-ticket (≤ ~8 min) e, se der 3, o teste falha a dizer que falta (corre-se de novo com a mesma pasta; o estado, o clone e o relógio ficam lá).
// O relógio é o de parede desde o início da corrida (os motores continuam entre as chamadas), não só a soma das chamadas.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { ROOT, gitOk, shaDe, correr, linhas, saida, exigeCheck, PASSOS, limpa } from './helpers.mjs';

after(limpa);

const PONTA = process.env.FORGE_V05_PONTA;
const LIMITE_MS = 30 * 60 * 1000;      // o teto do C2 revisto
const CHAMADA_MS = 520000;              // uma chamada de ferramenta aguenta 540 s; o orcamento_s do executor é 500 s
const AMOSTRA_MS = 10000;
const VAZIA_MS = 5 * 60 * 1000;         // paragem com CPU < 10 % e unidades por acabar
const CPU_VAZIA = 10, CPU_LIVRE = 50;
const ALVO = 'tests/critico/f-27-r0/c1-limite.test.mjs';

const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const tempos = () => cpus().map((c) => ({ ...c.times }));
// % de CPU usada entre duas fotografias de os.cpus()
const usoCpu = (a, b) => { let tot = 0, ocioso = 0; b.forEach((c, i) => { for (const k of Object.keys(c)) tot += c[k] - a[i][k]; ocioso += c.idle - a[i].idle; }); return tot ? Math.round(100 * (1 - ocioso / tot)) : 0; };
// os executores de qualquer worktree (a linha de comando tem scripts/executor.mjs): numa máquina livre não há nenhum antes de começar
function executoresAlheios() {
  if (process.platform !== 'win32') return spawnSync('pgrep', ['-f', 'scripts/executor\\.mjs'], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean).map(Number);
  const r = spawnSync('powershell', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
    "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'scripts[\\\\/]executor\\.mjs' } | ForEach-Object { $_.ProcessId }"], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
  return r.stdout.split(/\r?\n/).filter(Boolean).map(Number);
}

test('C2 (ponta real): um diff que só toca em tests/critico/f-27-r0/ dá 0 em ≤ 30 min de relógio, numa só corrida, sem esperas vazias', async (t) => {
  if (!PONTA) return t.skip('ponta real: corre só com FORGE_V05_PONTA=<pasta> (crítico da R1 e Ronda 0), com a máquina livre');
  exigeCheck();
  const sha = shaDe(ROOT);
  const pasta = join(PONTA, 'c2'), fich = join(pasta, 'estado.json'), repo = join(pasta, 'repo');
  mkdirSync(pasta, { recursive: true });
  let est = existsSync(fich) ? JSON.parse(readFileSync(fich, 'utf8')) : null;
  const grava = () => writeFileSync(fich, JSON.stringify(est, null, 2));

  if (!est || est.sha !== sha) { // corrida nova: a máquina tem de estar livre antes de começar
    const antes = tempos();
    await dorme(5000);
    const cpu = usoCpu(antes, tempos()), alheios = executoresAlheios();
    assert.ok(cpu < CPU_LIVRE && alheios.length === 0, `a máquina não está livre: CPU ${cpu} % (limite ${CPU_LIVRE} %), executores de outros: ${alheios.join(', ') || 'nenhum'}`);
    rmSync(repo, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    gitOk(ROOT, 'clone', '-q', '--no-checkout', ROOT, repo);
    gitOk(repo, 'checkout', '-q', '-b', 'v-05-c2-ponta', sha);
    gitOk(repo, 'update-ref', 'refs/remotes/origin/main', sha);
    appendFileSync(join(repo, ALVO), '// diff fictício do C2 do V-05\n');
    gitOk(repo, 'commit', '-q', '-am', 'diff fictício do C2 (V-05)');
    est = { sha, inicio: Date.now(), cpuAntes: cpu, chamadas: [], baixoDesde: null, maiorVaziaMs: 0 };
    grava();
  }

  // uma chamada ao check-ticket, com a amostragem de CPU do passo (a espera vazia é uma paragem de mais de 5 min com CPU < 10 %)
  let fotografia = tempos();
  const amostrador = setInterval(() => {
    const agora = tempos(), cpu = usoCpu(fotografia, agora);
    fotografia = agora;
    if (cpu < CPU_VAZIA) { est.baixoDesde ??= Date.now(); est.maiorVaziaMs = Math.max(est.maiorVaziaMs, Date.now() - est.baixoDesde); }
    else est.baixoDesde = null;
  }, AMOSTRA_MS);
  const t0 = Date.now();
  let r;
  try { r = await correr(repo, ['--ambito', 'tests/critico/f-27-r0/**', '--base', 'origin/main', ...(est.chamadas.length ? ['--continuar'] : [])], { limite_ms: CHAMADA_MS, tempReal: true }); }
  finally { clearInterval(amostrador); }
  est.chamadas.push({ status: r.status, ms: Date.now() - t0 });
  est.decorrido_ms = Date.now() - est.inicio;
  est.somaChamadas_ms = est.chamadas.reduce((s, c) => s + c.ms, 0);
  est.baixoDesde = null; // o intervalo entre chamadas não conta como paragem
  grava();

  assert.notEqual(r.status, 3, `incompleto (chamada ${est.chamadas.length}, ${Math.round(est.decorrido_ms / 1000)} s desde o início): corra de novo com o mesmo FORGE_V05_PONTA (${fich})`);
  assert.equal(r.status, 0, `a corrida não deu 0 (chamadas ${est.chamadas.map((c) => c.status).join(',')}, ${Math.round(est.decorrido_ms / 1000)} s):\n${saida(r)}`);
  assert.deepEqual(linhas(r.out).map((l) => l.linha.replace(/ \(.*$/, '')), PASSOS.map((p) => `ok ${p}`));
  assert.ok(est.maiorVaziaMs <= VAZIA_MS, `espera vazia: ${Math.round(est.maiorVaziaMs / 1000)} s seguidos com CPU < ${CPU_VAZIA} % e unidades por acabar (limite ${VAZIA_MS / 1000} s)`);
  assert.ok(est.decorrido_ms <= LIMITE_MS, `${Math.round(est.decorrido_ms / 1000)} s > ${LIMITE_MS / 1000} s (soma das chamadas ${Math.round(est.somaChamadas_ms / 1000)} s)`);
});
