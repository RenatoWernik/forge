// Ronda −1 do V-06 (#130): guardas dos oráculos. Verdes na base: provam que o corpus tem os cenários do ticket, que o gh falso chega pelo
// PATH (e não o gh real), serve o cenário e regista o argv, que o merge falso recusa outro head, que as três formas de ler o pacote dão as
// mesmas 2 livres, que o pós-merge do cenário vermelho falha mesmo (e o verde passa), e que a busca do token e os registos de argv mordem.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  corpus, montaCenario, ambienteDoCenario, procuraToken, refs, gitOk, tmp, limpa, REPO, PR, SPEC, TICKET, LIVRES, TOKEN, NOME_REGRESSAO,
} from './helpers.mjs';

after(limpa);

const CORPUS = corpus();
const cenario = (nome) => CORPUS.find((c) => c.nome === nome);
const gh = (m, ...a) => spawnSync('gh', a, { cwd: m.trab, env: ambienteDoCenario(m), encoding: 'utf8', windowsHide: true, timeout: 60000 });
const chamadas = (m) => readFileSync(join(m.estado, 'chamadas.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const OBRIGATORIOS = ['sem-veredito', 'reprovado', 'aprovado-outro-sha', 'sem-check-ticket', 'check-outro-sha', 'head-mudou', 'tudo-ok',
  'pos-merge-vermelho', 'projeto-base-main'];

test('guarda: o corpus tem ≥ 9 cenários, um por cada cenário do C1, cada um com o código (0, 1 ou 2) e as chamadas esperadas', () => {
  assert.ok(CORPUS.length >= 9, `só ${CORPUS.length} cenários`);
  assert.deepEqual(OBRIGATORIOS.map((k) => CORPUS.filter((c) => c.criterio === k).length), OBRIGATORIOS.map(() => 1));
  for (const c of CORPUS) {
    assert.ok(['forge', 'projeto'].includes(c.modo), c.nome);
    assert.ok(c.modo === 'forge' || c.integracao, `${c.nome}: modo projeto sem integracao`);
    assert.ok(Array.isArray(c.comentarios) && c.descricao, c.nome);
    assert.ok([0, 1, 2].includes(c.esperado.codigo) && 'merges' in c.esperado && ('pr_merge' in c.esperado || 'pr_merge_max' in c.esperado), c.nome);
  }
  const ok = cenario('tudo-ok').esperado;
  assert.deepEqual([ok.codigo, ok.pr_merge, ok.merges, ok.fase], [0, 1, 1, LIVRES]);
  assert.equal(cenario('pos-merge-vermelho').esperado.codigo, 1);
  assert.ok(CORPUS.filter((c) => c.esperado.recusa).length >= 7);
  assert.ok(CORPUS.filter((c) => c.esperado.recusa).every((c) => c.esperado.codigo === 2), 'as recusas saem com 2');
});

test('guarda: o gh do PATH é o falso: serve o PR do cenário em JSON, regista o argv e responde como o gh real a um campo desconhecido', () => {
  const m = montaCenario(cenario('tudo-ok'));
  const r = gh(m, 'pr', 'view', String(PR), '-R', REPO, '--json', 'headRefOid,isDraft,baseRefName,comments');
  assert.equal(r.status, 0, r.stderr);
  const v = JSON.parse(r.stdout);
  assert.equal(v.headRefOid, m.H);
  assert.equal(v.isDraft, true);
  assert.equal(v.baseRefName, 'main');
  assert.ok(v.comments.at(-1).body.startsWith(`CHECK-TICKET: VERDE ${m.H} `));
  assert.ok(v.comments.some((k) => k.body.startsWith(`VEREDITO: APROVADO\nHEAD: ${m.H}\nEXECUTOR: `)));
  assert.deepEqual(chamadas(m).map((c) => c.argv), [['pr', 'view', String(PR), '-R', REPO, '--json', 'headRefOid,isDraft,baseRefName,comments']]);
  const mau = gh(m, 'pr', 'view', String(PR), '--json', 'naoExiste');
  assert.equal(mau.status, 1);
  assert.match(mau.stderr, /Unknown JSON field: "naoExiste"/);
  const auth = gh(m, 'auth', 'status');
  assert.match(auth.stderr, /conta-falsa/, 'respondeu o gh real');
  assert.equal(gh(m, 'pr', 'view', String(PR), '--json', 'number', '--jq', '.number').status, 2, '--jq não é servido');
});

test('guarda: o pr merge falso recusa um --match-head-commit que não é o head real e, com o head, faz 1 squash na base da origem', () => {
  const mudou = montaCenario(cenario('head-mudou'));
  const r1 = gh(mudou, 'pr', 'merge', String(PR), '-R', REPO, '--squash', '--match-head-commit', mudou.H);
  assert.equal(r1.status, 1);
  assert.match(r1.stderr, /Head branch was modified/);
  assert.deepEqual(refs(mudou.origem), mudou.refsAntes);
  const ok = montaCenario(cenario('tudo-ok'));
  assert.equal(gh(ok, 'pr', 'merge', String(PR), '--squash', '--match-head-commit', ok.P1).status, 1);
  assert.deepEqual(refs(ok.origem), ok.refsAntes);
  const r2 = gh(ok, 'pr', 'merge', String(PR), '--squash', '--match-head-commit', ok.H);
  assert.equal(r2.status, 0, r2.stderr);
  const novo = refs(ok.origem)['refs/heads/main'];
  assert.notEqual(novo, ok.refsAntes['refs/heads/main']);
  assert.equal(gitOk(ok.origem, 'rev-parse', `${novo}^`).trim(), ok.refsAntes['refs/heads/main']);
  assert.equal(gitOk(ok.origem, 'rev-parse', `${novo}^{tree}`).trim(), gitOk(ok.origem, 'rev-parse', `${ok.H}^{tree}`).trim());
  const v = JSON.parse(gh(ok, 'pr', 'view', String(PR), '--json', 'state,mergeCommit').stdout);
  assert.deepEqual(v, { state: 'MERGED', mergeCommit: { oid: novo } });
  assert.equal(gh(ok, 'pr', 'merge', String(PR), '--squash', '--match-head-commit', ok.H).status, 1, 'um segundo merge');
  assert.deepEqual(chamadas(ok).map((c) => [c.codigo, c.efeitos.map((e) => e.tipo).join()]), [[1, 'merge-recusado'], [0, 'merge'], [0, ''], [1, '']]);
});

test('guarda: o pacote na forma real («Parte da spec #N» + «**Bloqueado por:**» com #n e ids V-NN) dá as 2 livres depois do merge; um id resolvido fora do pacote dá outra resposta', () => {
  const m = montaCenario(cenario('tudo-ok'));
  const j = (...a) => { const r = gh(m, ...a); assert.equal(r.status, 0, `gh ${a.join(' ')}: ${r.stderr}`); return JSON.parse(r.stdout); };
  assert.equal(gh(m, 'pr', 'merge', String(PR), '--squash', '--match-head-commit', m.H).status, 0);
  const todas = j('issue', 'list', '-R', REPO, '--state', 'all', '--limit', '200', '--json', 'number,title,body,state');
  const pacote = todas.filter((i) => new RegExp(`Parte da spec #${SPEC}(?!\\d)`).test(i.body));
  const estado = new Map(todas.map((i) => [i.number, i.state]));
  const bloqueios = (i, universo) => (i.body.match(/\*\*Bloqueado por:\*\*([^\n]*)/)?.[1] ?? '').replace(/\([^)]*\)/g, '').split(',')
    .map((x) => x.trim().replace(/\.$/, '').trim()).filter((x) => x && x !== '—')
    .map((x) => (x.startsWith('#') ? Number(x.slice(1)) : universo.find((y) => y.title.startsWith(`${x}:`))?.number));
  const livres = (universo) => pacote.filter((i) => i.state === 'OPEN' && bloqueios(i, universo).every((n) => estado.get(n) === 'CLOSED')).map((i) => i.number).toSorted();
  assert.equal(estado.get(TICKET), 'CLOSED', 'o merge na branch por omissão fecha o ticket (Closes #9130)');
  assert.deepEqual(pacote.filter((i) => i.state === 'OPEN').map((i) => i.number).toSorted(), [9101, 9102, 9103, 9104, 9105]);
  assert.deepEqual(livres(pacote), LIVRES);
  assert.notDeepEqual(livres(todas), LIVRES, 'o V-01 de outro pacote (#9120) tem de morder um id resolvido fora do pacote');
  assert.deepEqual(j('api', `repos/${REPO}/issues/${SPEC}/sub_issues`), [], 'sem sub-issues, como nas issues reais');
  assert.deepEqual(j('api', `repos/${REPO}/issues/9103/dependencies/blocked_by`), [], 'sem bloqueios nativos, como nas issues reais');
});
test('guarda: o pós-merge dos cenários é real: o executor no clone da main depois do squash falha no vermelho (com o teste do PR) e passa no verde', () => {
  for (const [nome, codigo] of [['pos-merge-vermelho', 1], ['tudo-ok', 0]]) {
    const m = montaCenario(cenario(nome));
    assert.equal(gh(m, 'pr', 'merge', String(PR), '--squash', '--match-head-commit', m.H).status, 0);
    const clone = join(tmp('v06-clone-'), 'c');
    gitOk(m.D, 'clone', '-q', m.origem, clone);
    const r = spawnSync(process.execPath, ['scripts/executor.mjs', '--todas', '--raiz', clone], { cwd: clone, env: ambienteDoCenario(m), encoding: 'utf8', timeout: 240000 });
    assert.equal(r.status, codigo, `${nome}: ${r.stdout}\n${r.stderr}`);
    const logs = join(clone, '.forge/resultados/logs');
    const tap = readdirSync(logs).map((n) => readFileSync(join(logs, n), 'utf8')).join('\n');
    assert.equal(tap.includes(`not ok 1 - ${NOME_REGRESSAO}`), codigo === 1, `${nome}: TAP\n${tap}`);
  }
});

test('guarda: a busca do token morde (ficheiro, histórico git e saída) e os registos de argv do node e do git existem', () => {
  const m = montaCenario(cenario('sem-veredito'));
  assert.deepEqual(procuraToken(m, { out: '' }), []);
  const env = ambienteDoCenario(m);
  spawnSync(process.execPath, ['-e', '0', 'marcador-node-v06'], { env, encoding: 'utf8' });
  spawnSync('git', ['-C', m.trab, 'rev-parse', '--verify', 'marcador-git-v06'], { env, encoding: 'utf8' });
  assert.match(readFileSync(join(m.estado, 'node-argv.jsonl'), 'utf8'), /marcador-node-v06/);
  assert.match(readFileSync(join(m.estado, 'git-trace.log'), 'utf8'), /marcador-git-v06/);
  const r = spawnSync('git', ['ls-remote', 'https://github.com/critico-falso/v06-alvo.git'], { env, encoding: 'utf8', timeout: 30000 });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /not allowed/i, 'o git do cenário não pode sair para a rede');
  writeFileSync(join(m.temp, 'fuga.txt'), `x${TOKEN}y`);
  gitOk(m.trab, 'commit', '-q', '--allow-empty', '-m', `fuga ${TOKEN}`);
  const achados = procuraToken(m, { out: `... ${TOKEN}` });
  assert.ok(achados.includes('stdout/stderr do avancar'), achados.join('\n'));
  assert.ok(achados.some((a) => a.endsWith('fuga.txt')), achados.join('\n'));
  assert.ok(achados.some((a) => a.endsWith('histórico')), achados.join('\n'));
});