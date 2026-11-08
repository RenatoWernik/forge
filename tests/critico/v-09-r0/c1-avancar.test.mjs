// V-09 C1 (#133, RESPOSTA 4): o comando que o FRAMEWORK.md ensina corre contra os argumentos reais do .claude/avancar.mjs do projeto gerado. Sem gh no
// PATH: os argumentos passam a validação e o avancar só para ao chamar o gh; sem o --integracao, a mesma linha é recusada. Nada chega à rede.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { EN, PT, AVANCAR, ambiente, gerar, conjunto } from './helpers.mjs';

const ARGUMENTOS = /argumento desconhecido|--pr: número|--repo: owner|--modo: forge|--modo projeto exige|--integracao só/;
const NOMES = process.platform === 'win32' ? ['gh.exe', 'gh.cmd', 'gh.bat', 'gh.com'] : ['gh'];
const PATH = (process.env.PATH ?? '').split(delimiter).filter((p) => p && !NOMES.some((n) => existsSync(join(p, n)))).join(delimiter);
const corre = (P, linha) => {
  const argv = linha.replace('<n>', '7').replace('<owner/repo>', 'o/r').replace('<branch>', 'integracao').split(' ').slice(1);
  const r = spawnSync(process.execPath, argv, { cwd: P, encoding: 'utf8', env: { ...ambiente(), PATH }, timeout: 60000, windowsHide: true });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

for (const [nome, lingua] of [[EN, 'EN'], [PT, 'PT']]) {
  test(`C1 (${lingua}): o comando do avancar no FRAMEWORK.md passa a validação dos argumentos do módulo do projeto; sem --integracao é recusado`, async () => {
    const P = await gerar(await conjunto(nome));
    assert.ok(readFileSync(join(P, 'FRAMEWORK.md'), 'utf8').includes('`' + AVANCAR + '`'), `o FRAMEWORK.md não tem \`${AVANCAR}\` num code span`);
    assert.ok(existsSync(join(P, '.claude/avancar.mjs')), 'o projeto gerado não tem .claude/avancar.mjs');
    const r = corre(P, AVANCAR);
    assert.equal(r.status, 2, r.out);
    assert.doesNotMatch(r.out, ARGUMENTOS, 'o avancar recusou os argumentos do comando do FRAMEWORK');
    assert.match(r.out, /\bgh\b/, 'o avancar não chegou a chamar o gh: ' + r.out);
    assert.match(corre(P, AVANCAR.replace(' --integracao <branch>', '')).out, /--modo projeto exige --integracao/, 'o controlo sem --integracao não foi recusado');
  });
}