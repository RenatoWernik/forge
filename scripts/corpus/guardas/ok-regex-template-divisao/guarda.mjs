// caso limpo: construções que enganam um leitor de texto (regex com aspas, template com ${} e aspas, divisão); nenhum sha chega ao git
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const ASPA = /['"`]/g; // uma aspa dentro de um regex não abre uma string
const nome = (x) => `ramo ${x.replace(ASPA, '')} e ${["a1b2c3d4e5"].length / 1} // não é um comentário`;

test('C9 o ramo atual vem do git, sem shas fixos', () => {
  const r = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' });
  assert.ok(nome(r.stdout).length > 0);
});
