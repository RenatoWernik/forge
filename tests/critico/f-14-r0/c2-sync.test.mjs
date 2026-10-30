// F-14 critério 2: o /forge:sync devolve os ficheiros novos (AGENTS.md, briefs, hooks, painel, .checkpoints/README.md) como
// marcadores ({{PROJECT_NAME}}, {{MEM_WORKSPACE}}, {{REPO}}, ...), sem dados do projeto, e sai com 3 quando o patch tem dados pessoais.
// Oráculo (o do contrato): um projeto do corpus com um brief e um hook alterados (o patch só tem as linhas alteradas e os marcadores),
// mais um caso com um e-mail e um caminho absoluto (código 3).
// Resposta 5 do orquestrador na #15: o patch aplica-se a partir da raiz do pacote (`git apply --check` na raiz); o nome de cada ficheiro alterado aparece num cabeçalho `diff --git`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, tmp, gerar, corpusAnswers, sandboxEnv, readFileSync, writeFileSync } from './helpers.mjs';

const A = corpusAnswers('en-plain-published'); // hooks todos a true, repo acme/billing, projeto «Acme Billing»
const sync = (proj) => {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/sync.mjs'), '--project', proj, '--package', ROOT], { encoding: 'utf8', env: sandboxEnv(), timeout: 120000, maxBuffer: 1 << 26 });
  return { status: r.status, patch: r.stdout ?? '', err: r.stderr ?? '' };
};
const mais = (patch) => patch.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1));
const menos = (patch) => patch.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---')).map((l) => l.slice(1));
const acrescenta = (proj, rel, linha) => { const f = join(proj, rel), t = readFileSync(f, 'utf8'); writeFileSync(f, t.replace(/\n?$/, '\n') + linha + '\n'); return t; };
const HOOK = '.claude/hooks/forge-matar-por-nome.mjs';
const aplica = (patch) => {
  const f = join(tmp(), 'p.patch');
  writeFileSync(f, patch);
  return spawnSync('git', ['apply', '--check', f], { cwd: ROOT, encoding: 'utf8' }).status === 0;
};

test('C2 guarda: um projeto do corpus (com os 3 hooks) que ninguém editou dá código 0 e um patch vazio', async () => {
  const proj = await gerar(A);
  const r = sync(proj);
  assert.equal(r.status, 0, r.err);
  assert.equal(r.patch.trim(), '', r.patch.slice(0, 600));
});

test('C2: um brief, um hook, o AGENTS.md, o painel e o .checkpoints/README.md editados voltam só com as linhas alteradas, com marcadores e sem dados do projeto', async () => {
  const proj = await gerar(A);
  const ag = join(proj, 'AGENTS.md'), agT = readFileSync(ag, 'utf8');
  const alvo = agT.split('\n').find((l) => l.includes(A.repo));
  assert.ok(alvo, 'o AGENTS.md gerado não tem a linha com o repo');
  writeFileSync(ag, agT.replace(alvo, alvo + ' Also tag each issue with the piece id.'));
  const novas = {
    '.claude/briefs/critic.md': 'Extra rule: run the slowest test last.',
    [HOOK]: '// extra note from the project: keep it short',
    '.claude/dashboard/panel.html': '<!-- extra note from the project -->',
    '.checkpoints/README.md': 'Extra: keep each checkpoint under 40 lines.',
  };
  for (const [rel, l] of Object.entries(novas)) acrescenta(proj, rel, l);
  const r = sync(proj);
  assert.equal(r.status, 0, r.err);
  const tpl = readFileSync(join(ROOT, 'templates/AGENTS.md'), 'utf8').split(/\r?\n/).find((l) => l.includes('{{REPO}}') && alvo.startsWith(l.split('{{REPO}}')[0]));
  assert.ok(tpl, 'o template AGENTS.md não tem a linha do {{REPO}}');
  assert.deepEqual(mais(r.patch).sort(), [...Object.values(novas), tpl + ' Also tag each issue with the piece id.'].sort(), r.patch.slice(0, 3000));
  assert.deepEqual(menos(r.patch), [tpl], 'as linhas retiradas do patch: só a linha do AGENTS.md que mudou');
  for (const rel of ['AGENTS.md', ...Object.keys(novas)]) assert.ok(r.patch.split('\n').some((l) => l.startsWith('diff --git') && l.includes(basename(rel))), 'o patch não traz ' + rel);
  const dados = [A.projectName, A.repo, A.dashboardUrl.split('/').pop(), proj, proj.replace(/\\/g, '/')];
  assert.deepEqual(mais(r.patch).filter((l) => dados.some((d) => l.includes(d))), []);
  assert.ok(aplica(r.patch), 'git apply --check recusa o patch na raiz do pacote');
});

const PESSOAIS = [
  ['um e-mail num brief', '.claude/briefs/dev.md', 'Ask maria.silva@example.org before merging.'],
  ['um caminho absoluto Windows num hook', HOOK, '// cache in C:\\Users\\maria\\work\\billing\\.cache'],
  ['um caminho absoluto POSIX no .checkpoints/README.md', '.checkpoints/README.md', 'Logs go to /home/maria/work/billing/logs.'],
  ['o caminho absoluto do próprio projeto no AGENTS.md', 'AGENTS.md', null],
];
for (const [nome, rel, linha] of PESSOAIS) {
  test(`C2: ${nome} faz o sync sair com o código 3`, async () => {
    const proj = await gerar(A);
    acrescenta(proj, rel, linha ?? `Run the tests from ${proj}.`);
    const r = sync(proj);
    assert.equal(r.status, 3, `código ${r.status}; stderr: ${r.err.slice(0, 600)}`);
  });
}
