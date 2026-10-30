// Emenda 6503240709 do F-14 (decisão do F-12): o documento `painel/vida` é escrito por um comando do projeto gerado.
// Hoje o projeto gerado só recebe o leitor (.claude/painel-leitor.mjs) e o FRAMEWORK.md manda o orquestrador calcular à mão.
// Leitura do crítico (PERGUNTA 1 na #15): o comando aparece em código (`node .claude/...`) num parágrafo de um documento gerado
// (CLAUDE.md, AGENTS.md, FRAMEWORK.md, briefs ou .checkpoints/README.md) que fala de `painel/vida`; o ficheiro existe no projeto;
// corrido tal como está escrito, na raiz do projeto, sai 0 e imprime no stdout o JSON
// `{ "painel/vida": { t, agentes } }` (resposta 1 do orquestrador na #15), que o orquestrador grava com «set». Oráculo: o leitor do pacote (docsVida em scripts/painel.mjs)
// com os mesmos mtimes: as vidas iguais, os minutos a ±1 e o `t` a ±2 min do relógio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { utimesSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ROOT, gerar, corpusAnswers, traduzSePt, sandboxEnv, readFileSync, writeFileSync, existsSync } from './helpers.mjs';

const DOCS = (proj) => ['CLAUDE.md', 'AGENTS.md', 'FRAMEWORK.md', '.checkpoints/README.md', ...(existsSync(join(proj, '.claude/briefs')) ? readdirSync(join(proj, '.claude/briefs')).map((f) => '.claude/briefs/' + f) : [])];
const comando = (proj) => {
  for (const rel of DOCS(proj)) {
    if (!existsSync(join(proj, rel))) continue;
    for (const par of readFileSync(join(proj, rel), 'utf8').split(/\r?\n\s*\r?\n/)) {
      if (!par.includes('painel/vida')) continue;
      const c = [...par.matchAll(/`(node \.claude\/[^`]+)`/g)].map((m) => m[1]);
      if (c.length) return { rel, cmd: c[0] };
    }
  }
  return null;
};
const pnl = (proj, ...a) => spawnSync(process.execPath, [join(ROOT, 'scripts/painel.mjs'), ...a.slice(0, 1), join(proj, '.checkpoints/painel.json'), ...a.slice(1)], { encoding: 'utf8', env: sandboxEnv() });
const MIN = 60000;
const AGENTES = [['dev-t-01', 'dev', 'dev-t-01.md', 5], ['critico-t-01', 'critico', 'critico-t-01.md', 40], ['tester-lote', 'tester', 'tester-lote.md', null]];

for (const set of ['en-plain-published', 'pt-plain-published']) {
  test(`emenda (${set}): um comando do projeto gerado, citado junto de painel/vida, imprime o documento painel/vida igual ao do leitor`, async () => {
    const proj = await gerar(corpusAnswers(set));
    traduzSePt(proj);
    const c = comando(proj);
    assert.ok(c, 'nenhum documento gerado cita um comando `node .claude/...` num parágrafo sobre painel/vida');
    const argv = c.cmd.split(/\s+/).slice(1);
    assert.ok(existsSync(join(proj, argv[0])), `${c.rel} cita ${c.cmd}, mas ${argv[0]} não existe no projeto gerado`);
    assert.equal(pnl(proj, 'ticket', '--id=T-01', '--issue=11', '--titulo=Primeiro', '--estado=dev', '--rondas=0').status, 0);
    const agora = Date.now(), mtimes = {};
    for (const [nome, papel, cp, min] of AGENTES) {
      assert.equal(pnl(proj, 'agente', `--nome=${nome}`, `--papel=${papel}`, '--ticket=T-01', '--modelo=m', `--checkpoint=${cp}`).status, 0);
      if (min === null) continue;
      const f = join(proj, '.checkpoints', cp);
      writeFileSync(f, '# checkpoint\n');
      const t = new Date(agora - min * MIN);
      utimesSync(f, t, t);
      mtimes[cp] = t.getTime();
    }
    const r = spawnSync(process.execPath, argv, { cwd: proj, encoding: 'utf8', env: sandboxEnv({ CLAUDE_PROJECT_DIR: proj }), timeout: 60000 });
    assert.equal(r.status, 0, `${c.cmd}: código ${r.status}; ${(r.stderr ?? '').slice(0, 500)}`);
    let o;
    try { o = JSON.parse(r.stdout.trim()); } catch { assert.fail(`${c.cmd} não imprime JSON: ${r.stdout.slice(0, 300)}`); }
    const doc = o['painel/vida'];
    assert.ok(doc && typeof doc === 'object', 'o stdout não é { "painel/vida": { t, agentes } } (resposta 1): ' + r.stdout.slice(0, 200));
    const { docsVida } = await import(pathToFileURL(join(ROOT, 'scripts/painel.mjs')).href);
    const ref = docsVida(readFileSync(join(proj, '.checkpoints/painel.json'), 'utf8'), mtimes, Date.now())['painel/vida'];
    assert.ok(Math.abs(Date.parse(doc.t) - Date.now()) < 2 * MIN, 't fora do relógio: ' + doc.t);
    assert.deepEqual(Object.keys(doc.agentes ?? {}).sort(), Object.keys(ref.agentes).sort(), JSON.stringify(doc));
    for (const [nome, v] of Object.entries(ref.agentes)) {
      assert.equal(doc.agentes[nome].vida, v.vida, nome);
      assert.ok(v.minutos === null ? doc.agentes[nome].minutos === null : Math.abs(doc.agentes[nome].minutos - v.minutos) <= 1, `${nome}: minutos ${doc.agentes[nome].minutos}, o leitor dá ${v.minutos}`);
    }
  });
}
