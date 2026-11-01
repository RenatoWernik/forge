// F-21b, C3: prova de uso (decisão B4). Oráculos do corpo da #74:
// - o schema BUILD do gauntlet-build.js exige `graphNodes` (array de strings, os nós que o dev consultou);
// - cada resultado de peça traz `graphNodes`: a união das rondas, sem repetidos; um `graphNodes` ausente (os runtimes falsos dos ataques
//   antigos) conta como [] e nunca lança erro;
// - com `args.graph` e `graphNodes` vazio numa ronda, o log() regista `WARNING <id> r<N>: the developer consulted no graph node`; sem
//   `args.graph`, nenhum WARNING desses;
// - a invariante 7 do CLAUDE.md e do AGENTS.md (idênticas) passa a citar no `Verifies:` o nome da linha nova da simulação.
// Regra que reprova sempre (corpo da #74, «O que reprova»): o crítico nunca recebe texto do dev, logo nunca os graphNodes que o dev declarou.
// Leitura: «cada resultado de peça» inclui a peça barrada pela Ronda −1 (rounds 0), que também traz graphNodes [].
// Leitura da invariante 7: um trecho entre crases do `Verifies:` que (a) é parte do nome de uma linha `ok` do check.cjs que fala do grafo,
// num projeto gerado, e (b) não existe no check.cjs da BASE (linha nova). (b) é de âmbito do ticket: faz skip depois do merge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { srcNow, runWf, fake, why, labeled, buildArgs, piece, aff, r0, resultOf, ROLE_RE, GRAPHS, LOG_NO_NODE, read, baseFile, generate, corpusAnswers, check, linesOf, fails, SCOPE_SKIP } from './helpers.mjs';

test('C3 [ataque]: o schema BUILD exige graphNodes, um array de strings', async () => {
  const run = await runWf(srcNow('build'), buildArgs([piece('pa')]), fake());
  const [d] = labeled(run, ROLE_RE.dev);
  assert.ok(d && d.opts.schema, 'o dev não recebeu schema: ' + why(run));
  const s = d.opts.schema;
  assert.ok(Array.isArray(s.required) && s.required.includes('graphNodes'), 'graphNodes não está no required: ' + JSON.stringify(s.required));
  assert.equal(s.properties?.graphNodes?.type, 'array', 'graphNodes não é um array');
  assert.equal(s.properties.graphNodes.items?.type, 'string', 'os itens de graphNodes não são strings');
});

const NODES = { 1: ['n-a', 'n-b'], 2: ['n-b', 'n-c', 'n-b'], 3: ['n-a', 'n-d'] };
for (const o of [{}, { graph: GRAPHS[0] }]) {
  const tag = o.graph ? 'com args.graph' : 'sem args.graph';
  const mk = (ps) => buildArgs(ps.map((p) => (o.graph ? { ...p, affected: aff(p.id) } : p)), o);

  test(`C3 [ataque] (${tag}): o resultado traz graphNodes, a união das rondas 1 a 3 sem repetidos`, async () => {
    for (const mode of ['rigorous']) {
      const run = await runWf(srcNow('build'), mk([piece('pa')]), fake({ winAt: 3, nodes: (id, r) => NODES[r] }));
      assert.equal(run.err, undefined, why(run));
      const x = resultOf(run, 'pa');
      assert.ok(x && x.won && x.rounds === 3, `${mode}: o cenário não deu 3 rondas: ` + why(run));
      assert.ok(Array.isArray(x.graphNodes), 'sem graphNodes no resultado: ' + JSON.stringify(x).slice(0, 300));
      assert.deepEqual([...x.graphNodes].sort(), ['n-a', 'n-b', 'n-c', 'n-d'], 'graphNodes não é a união sem repetidos: ' + JSON.stringify(x.graphNodes));
    }
  });

  test(`C3 [ataque] (${tag}): um graphNodes ausente conta como [] e nunca lança erro (uma e várias rondas, várias peças, em paralelo)`, async () => {
    for (const [ps, f, par] of [[[piece('pa')], { winAt: 1 }, false], [[piece('pa'), piece('pb')], { winAt: 3 }, true]]) {
      const run = await runWf(srcNow('build'), { ...mk(ps), parallel: par }, fake(f));
      assert.equal(run.err, undefined, why(run));
      for (const p of ps) {
        const x = resultOf(run, p.id);
        assert.ok(x && x.won, `${p.id}: ` + why(run));
        assert.deepEqual(x.graphNodes, [], `${p.id}: graphNodes ausente não deu []: ` + JSON.stringify(x.graphNodes));
      }
    }
  });

  test(`C3 [ataque] (${tag}): a peça barrada pela Ronda −1 também traz graphNodes []`, async () => {
    const args = mk([piece('pa'), piece('pb')]);
    args.attacks = [r0('pa'), { ...r0('pb'), gaps: ['GAP-RONDA-1'] }];
    const run = await runWf(srcNow('build'), args, fake());
    const x = resultOf(run, 'pb');
    assert.ok(x && x.blocked && x.rounds === 0, 'o cenário não barrou pb: ' + why(run));
    assert.deepEqual(x.graphNodes, [], 'a peça barrada não traz graphNodes []: ' + JSON.stringify(x));
  });

  test(`C3 [guarda] (${tag}): o crítico nunca recebe os graphNodes que o dev declarou (é texto do dev)`, async () => {
    const run = await runWf(srcNow('build'), mk([piece('pa')]), fake({ winAt: 3, nodes: (id, r) => [`DEVNODE-${id}-r${r}-SEGREDO`] }));
    const crits = labeled(run, ROLE_RE.critic);
    assert.equal(crits.length, 3, why(run));
    for (const c of crits) assert.doesNotMatch(c.prompt, /DEVNODE/, `${c.opts.label}: o crítico recebeu os graphNodes do dev`);
  });
}

test('C3 [ataque]: com args.graph, uma ronda com graphNodes vazio (ou ausente) dá o WARNING literal, e uma com nós não', async () => {
  const run = await runWf(srcNow('build'), buildArgs([piece('pa', { affected: aff('pa') })], { graph: GRAPHS[1] }), fake({ winAt: 3, nodes: (id, r) => ({ 1: [], 2: undefined, 3: ['n-x'] })[r] }));
  assert.equal(run.err, undefined, why(run));
  assert.ok(run.logs.includes(LOG_NO_NODE('pa', 1)), 'falta o WARNING da r1 (graphNodes []): ' + JSON.stringify(run.logs));
  assert.ok(run.logs.includes(LOG_NO_NODE('pa', 2)), 'falta o WARNING da r2 (graphNodes ausente): ' + JSON.stringify(run.logs));
  assert.ok(!run.logs.includes(LOG_NO_NODE('pa', 3)), 'WARNING na r3, que consultou um nó');
});

test('C3 [guarda]: sem args.graph, nenhuma ronda dá o WARNING de nenhum nó consultado (graphNodes vazio, ausente ou com nós)', async () => {
  const run = await runWf(srcNow('build'), buildArgs([piece('pa'), piece('pb')]), fake({ winAt: 3, nodes: (id, r) => ({ 1: [], 2: undefined, 3: ['n-x'] })[r] }));
  assert.equal(run.err, undefined, why(run));
  assert.ok(!run.logs.some((l) => /consulted no graph node/.test(l)), JSON.stringify(run.logs));
});

// A invariante 7 nos dois documentos: o item «7. **Consult before touching.**»
const inv7 = (text) => text.split(/\r?\n/).find((l) => /^7\. \*\*/.test(l)) || '';
const verifies = (l) => (l.split('Verifies:')[1] || '').match(/`[^`]+`/g)?.map((s) => s.slice(1, -1)) || [];
test('C3 [ataque]: a invariante 7 do CLAUDE.md e do AGENTS.md é a mesma e cita no Verifies: uma linha nova do check.cjs sobre o grafo, ok num projeto gerado', { skip: SCOPE_SKIP }, async () => {
  const [c, a] = ['templates/CLAUDE.md', 'templates/AGENTS.md'].map((f) => inv7(read(f)));
  assert.ok(c.includes('Verifies:'), 'CLAUDE.md sem a invariante 7 com Verifies:');
  assert.equal(a, c, 'a invariante 7 do AGENTS.md não é idêntica à do CLAUDE.md');
  const baseCheck = baseFile('templates/.claude/check.cjs').replace(/\\'/g, "'");
  const fresh = verifies(c).filter((s) => s.length >= 10 && !baseCheck.includes(s));
  assert.ok(fresh.length >= 1, 'o Verifies: da invariante 7 não cita nenhum nome novo (que o check.cjs da BASE não tenha): ' + JSON.stringify(verifies(c)));
  const r = check(await generate(corpusAnswers('en-plain-published')));
  assert.equal(r.status, 0, fails(r.out));
  const hit = linesOf(r.out).filter((l) => l.state === 'ok' && /graph/i.test(l.text) && fresh.some((s) => l.text.includes(s)));
  assert.ok(hit.length >= 1, 'nenhuma linha ok do check.cjs sobre o grafo tem o nome citado: ' + JSON.stringify(fresh));
});