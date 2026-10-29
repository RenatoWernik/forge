// Critério 2: o código do mod não tem caminhos absolutos, ids de sessão nem nomes de projeto.
// Oráculo do contrato: varrimento por `[A-Z]:[\\/]`, `/Users/`, `/home/`, UUIDs, `Guilda` e `AgentHomes`, lista de exceções vazia.
// Varre os ficheiros do mod (a ponte nomeia-os) e todos os ficheiros que o ticket acrescenta ou altera fora de tests/
// (menos os *.test.mjs, que não são o mod), incluindo os manifestos e o hooks.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { ROOT, BASE, api, git } from './helpers.mjs';

const PROIBIDO = [/[A-Z]:[\\/]/, /\/Users\//, /\/home\//, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, /guilda/i, /AgentHomes/i];
const EXCECOES = [];

const desde = () => { const m = git('merge-base', 'HEAD', 'origin/main'); return m.status === 0 ? m.stdout.trim() : BASE; };
const doTicket = () => {
  const d = git('diff', '--name-only', '--diff-filter=AM', desde(), '--', '.', ':(exclude)tests');
  const u = git('ls-files', '--others', '--exclude-standard', '--', '.', ':(exclude)tests');
  return [...d.stdout.split('\n'), ...u.stdout.split('\n')].map((s) => s.trim()).filter((s) => s && !s.endsWith('.test.mjs')).map((s) => join(ROOT, s));
};

test('C2: o código do mod e o que o ticket acrescenta ao pacote não têm caminhos absolutos, UUIDs, Guilda nem AgentHomes', async () => {
  const u = await api();
  const ficheiros = [...new Set([...u.modulos, ...doTicket()].map((f) => resolve(f)))].filter(existsSync);
  assert.ok(ficheiros.length >= u.modulos.length);
  const achados = [];
  for (const f of ficheiros) {
    readFileSync(f, 'utf8').split(/\r?\n/).forEach((l, i) => {
      for (const re of PROIBIDO) if (re.test(l)) achados.push(`${relative(ROOT, f)}:${i + 1}: ${re} → ${l.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(achados.filter((a) => !EXCECOES.some((e) => a.startsWith(e))), []);
  assert.deepEqual(EXCECOES, []);
});

// Reprova sempre (dados da máquina no pacote): os tipos que o motor escreve na pasta do mod trazem, em claude-code-mcp,
// as ferramentas MCP ligadas na máquina de quem o carregou. Nem seguidos no git nem por seguir sem .gitignore.
const GERADO = /(^|\/)\.claude-plugin\/types\/|(^|\/)claude-code(-tools|-mcp)?\/index\.d\.ts$/;
test('C2: os tipos que o motor gera na pasta do mod (.claude-plugin/types/, claude-code*/index.d.ts) não entram no pacote', () => {
  const t = git('ls-files').stdout.split('\n').filter((f) => GERADO.test(f));
  const u = git('ls-files', '--others', '--exclude-standard').stdout.split('\n').filter((f) => GERADO.test(f));
  assert.deepEqual([...t, ...u], []);
});
