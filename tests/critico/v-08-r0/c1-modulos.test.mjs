// V-08 C1 (#132): para cada conjunto de scripts/corpus/answers/, o projeto gerado tem os 4 módulos (executor, afetadas, check-ticket e avancar)
// em .claude/, byte a byte iguais a scripts/. E o mecanismo dos templates (corpo da #132): o .claude/suites.json por omissão tem uma suíte
// `tipo: comando` e `lints: []`, o .claude/mapa-suites.json a regra ["**"] → ["*"] e o .gitignore a linha .forge/ (RESPOSTAS 3 e 4, 6563556283).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, MODULOS, NO_PROJETO, MANIFESTO, MAPA, loadCorpus, gerar, conjunto, lerJson } from './helpers.mjs';

const sets = await loadCorpus('answers');

test('C1 (guarda): o corpus de respostas tem conjuntos', () => {
  assert.ok(sets.length >= 1, 'scripts/corpus/answers/ vazio');
});

for (const { name, value } of sets) {
  test(`C1: ${name}: os 4 módulos estão em .claude/, byte a byte iguais a scripts/`, async () => {
    const P = await gerar(value);
    const faltam = MODULOS.filter((m) => !existsSync(join(P, NO_PROJETO(m))));
    assert.deepEqual(faltam, [], 'o projeto gerado não tem: ' + faltam.map(NO_PROJETO).join(', '));
    for (const m of MODULOS) {
      assert.ok(existsSync(join(ROOT, 'scripts', m)), `scripts/${m} não existe`);
      assert.ok(readFileSync(join(P, NO_PROJETO(m))).equals(readFileSync(join(ROOT, 'scripts', m))), `${NO_PROJETO(m)} não é byte a byte igual a scripts/${m}`);
    }
  });
}

test('C1 (mecanismo): o .claude/suites.json por omissão tem uma só suíte, `tipo: comando` com o comando em lista, e lints []; o .claude/mapa-suites.json só a regra ["**"] → ["*"]; o .gitignore tem .forge/', async () => {
  const P = await gerar(await conjunto('en-plain-published'));
  for (const f of [MANIFESTO, MAPA]) assert.ok(existsSync(join(P, f)), `o projeto gerado não tem ${f}`);
  const m = lerJson(join(P, MANIFESTO));
  assert.equal(m.versao, 1, 'suites.json: versao');
  assert.equal(m.suites?.length, 1, 'suites.json: suítes ' + JSON.stringify(m.suites));
  assert.equal(m.suites[0].tipo, 'comando', 'suites.json: a suíte por omissão não é tipo comando');
  assert.ok(Array.isArray(m.suites[0].comando), 'suites.json: o comando da suíte tem de ser uma lista (argv)');
  assert.deepEqual(m.lints, [], 'suites.json: lints tem de ser [] no template (RESPOSTA 3, #132)');
  const mapa = lerJson(join(P, MAPA));
  assert.equal(mapa.versao, 1, 'mapa-suites.json: versao');
  assert.deepEqual((mapa.regras ?? []).map((r) => [r.caminhos, r.suites]), [[['**'], ['*']]], 'mapa-suites.json: regras ' + JSON.stringify(mapa.regras));
  assert.ok(readFileSync(join(P, '.gitignore'), 'utf8').split(/\r?\n/).includes('.forge/'), 'o .gitignore do projeto gerado não tem a linha .forge/ (RESPOSTA 4, #132)');
});