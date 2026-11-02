// Crítico R1 do V-01 (#125, PR #148): arnês comum dos 3 ataques. Usa os helpers da Ronda −1 da worktree indicada por FORGE_ROOT
// (por omissão E:\forge-wt\critico-v01), por isso corre o scripts/executor.mjs dessa worktree. Só biblioteca padrão.
//   node --test --test-concurrency=1 <este dir>/a1-tres-executores.test.mjs   (FORGE_ROOT=<worktree> opcional)
import { copyFileSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import * as H from './helpers.mjs';
export { H };

// a unidade dorme `seg` s e regista início/fim em .sonda/ com o sha256 do seu próprio ficheiro (o conteúdo que de facto correu)
export const UNIDADE = (seg) => `import { test } from 'node:test';\nimport { createHash } from 'node:crypto';\nimport { readFileSync } from 'node:fs';\n`
  + `import { fileURLToPath } from 'node:url';\nimport { marca, dorme } from '../sonda.mjs';\n`
  + `const h = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');\n`
  + `test('dorme', async () => { marca(import.meta.url, 'inicio', { h }); await dorme(${seg}); marca(import.meta.url, 'fim', { h }); });\n`;

// repo git temporário: scripts/suites.json com as suítes dadas (ficheiros s/<nome>*.fx.mjs) e as unidades {nome: segundos}
export function montar(nome, manifesto, unidades) {
  const d = H.tmp(`crit-${nome}-`);
  mkdirSync(join(d, 'scripts')); mkdirSync(join(d, 's'));
  copyFileSync(join(H.FIXTURES, 'sonda.mjs'), join(d, 'sonda.mjs'));
  copyFileSync(join(H.FIXTURES, 'gitignore'), join(d, '.gitignore'));
  for (const [n, seg] of Object.entries(unidades)) writeFileSync(join(d, 's', `${n}.fx.mjs`), UNIDADE(seg));
  const suites = manifesto.suites.map((s) => ({ tipo: 'node-test', ficheiros: [`s/${s.nome}*.fx.mjs`], ...s }));
  writeFileSync(join(d, 'scripts', 'suites.json'), JSON.stringify({ versao: 1, vagas_globais: 4, carga_sensivel: 4, ...manifesto, suites }));
  H.gitOk(d, 'init', '-q', '-b', 'main'); H.gitOk(d, 'config', 'core.autocrlf', 'false'); H.gitOk(d, 'add', '-A'); H.gitOk(d, 'commit', '-q', '-m', 'fixture');
  return d;
}
// os ficheiros .forge/motor/*.json do repo; regista os PIDs para o limpa() os matar pela árvore (só os deste teste)
export function motores(d) {
  const p = join(d, '.forge', 'motor');
  const js = existsSync(p) ? readdirSync(p).filter((n) => n.endsWith('.json')).map((n) => ({ nome: n, ...H.lerJson(join(p, n)) })) : [];
  for (const j of js) H.registaPid(j.pid, { cmd: ['--motor-interno', j.nonce] }); // o PID gravado pode já ser de outro processo
  return js;
}
// encadeia --continuar até sair de 3 (no máximo n chamadas); devolve os códigos
export async function cadeia(d, env, n = 8, limite_ms = 120000) {
  const cod = [];
  for (let i = 0; i < n; i++) { const r = await H.correr(d, ['--todas', '--continuar'], { env, limite_ms }); motores(d); cod.push(r.status); if (r.status !== 3) break; }
  return cod;
}
