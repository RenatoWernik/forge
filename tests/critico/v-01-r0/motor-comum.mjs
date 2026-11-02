// Arnês do motor destacado (V-01, #125): repos gerados com unidades que dormem N s e registam o início e o fim em .sonda/. Partilhado por motor.test.mjs e c9b-morte-12x.test.mjs.
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURES, gitOk, lerJson, registaPid, tmp, umResultado } from './helpers.mjs';

export const UNIDADE = (seg) => `import { test } from 'node:test';\nimport { marca, dorme } from '../sonda.mjs';\n`
  + `test('dorme', async () => { marca(import.meta.url, 'inicio'); await dorme(${seg}); marca(import.meta.url, 'fim'); });\n`;
// um repo git temporário: scripts/suites.json (as suites vêm como [{nome, limite_s, ...}] sobre os ficheiros s/<nome>.*.fx.mjs) e uma unidade por nome
export function montar(nome, manifesto, unidades) {
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
export const motores = (d) => {
  const pasta = join(d, '.forge', 'motor');
  const js = existsSync(pasta) ? readdirSync(pasta).filter((n) => n.endsWith('.json')).map((n) => lerJson(join(pasta, n))) : [];
  for (const j of js) registaPid(j.pid);
  return js;
};
export const feitas = (d) => umResultado(d).dados.unidades;
