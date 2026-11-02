// Ronda −1 do F-04 (#5): utilitários partilhados pelos ataques. Só biblioteca padrão.
// Nunca toca na config real nem deixa lixo: no import cria UMA pasta temporária; HOME, USERPROFILE e CLAUDE_CONFIG_DIR apontam
// para <pasta>/home e TMP, TEMP e TMPDIR para <pasta>/tmp (também nos processos filhos). Tudo o que os ataques criam fica dentro
// dela, e ela é apagada no after() e, de reserva, no exit. Nenhum ataque invoca um modelo.
//
// Leitura do contrato que estes ataques assumem, com as respostas do orquestrador às 4 PERGUNTAS (comentário 6499894197 na #5,
// citadas como «resposta N»):
//   - a skill é skills/new-project/SKILL.md, em inglês; os passos são os títulos `## N. <título>` fora dos blocos de código;
//   - resposta 1: a nota `notes/n0001` sai de um produtor determinístico do pacote (a partir do forge.json do projeto), e o
//     dev escreve na Ronda 0 a ponte tests/ponte/f-04.mjs, que só reexporta (ver PONTE abaixo);
//   - respostas 2, 3 e 4: a frase de proibição, a frase da certeza, a regra de paragem e os 7 títulos são literais em inglês.
import { after } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename, extname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const BASE = 'e083b6a'; // a main com F-01, F-02, F-03 e F-10, ponto de partida do ticket
export const SKILL = join(ROOT, 'skills/new-project/SKILL.md');

const WORK = mkdtempSync(join(tmpdir(), 'critico-f04-'));
const HOME = join(WORK, 'home'), TMP = join(WORK, 'tmp');
mkdirSync(HOME); mkdirSync(TMP);
for (const k of ['HOME', 'USERPROFILE', 'CLAUDE_CONFIG_DIR']) process.env[k] = HOME;
for (const k of ['TMP', 'TEMP', 'TMPDIR']) process.env[k] = TMP;
const cleanup = () => { try { rmSync(WORK, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* o exit volta a tentar */ } };
after(cleanup);
process.on('exit', cleanup);

let n = 0;
export const tmp = (prefix = 'd') => { const d = join(WORK, `${prefix}${++n}`); mkdirSync(d); return d; };

// Sem NODE_TEST_CONTEXT: herdado, um `node --test` filho fala o protocolo interno do runner e sai com 0 mesmo a falhar
export const sandboxEnv = () => { const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; return env; };
export const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });
export const runTests = (globs, timeout = 480000) => {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...globs], { cwd: ROOT, encoding: 'utf8', env: sandboxEnv(), timeout });
  const out = (r.stdout || '') + (r.stderr || '');
  return { status: r.status, out, pass: +(out.match(/^# pass (\d+)/m) || [])[1], fail: +(out.match(/^# fail (\d+)/m) || [])[1] };
};
export const failures = (out) => out.split(/\r?\n/).filter((l) => /^\s*not ok/.test(l)).join('\n') + '\n' + out.slice(-2500);
