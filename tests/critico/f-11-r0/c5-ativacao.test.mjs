// Critério 5: sem .claude/forge.json na raiz do projeto aberto, o mod não abre o painel nem lê ficheiros; com ele, lê o
// .checkpoints/painel.json dessa raiz. Oráculo: o runtime falso, com e sem o ficheiro, e a contagem de leituras de ficheiro.
// Também (pedido da Ronda −1): a raiz vem da sessão, nunca de um caminho fixo; duas raízes diferentes dão dois modelos diferentes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { api, projeto, runtime, esperado, projetar, CORPUS, AGORA, norm, buildProject, corpusAnswers, tmp } from './helpers.mjs';

const ehForgeJson = (raiz) => (f) => norm(f) === norm(join(raiz, '.claude/forge.json'));
// Leituras de ficheiro: read, list e stat; o forge.json conta como verificação de ativação, não como leitura
const leituras = (log, raiz) => log.fs.filter(([op, f]) => op !== 'exists' && !ehForgeJson(raiz)(f));

test('C5: sem .claude/forge.json, iniciar() não abre o painel e não lê ficheiros (com um painel.json válido na raiz)', async () => {
  const u = await api();
  const p = projeto({ ...CORPUS().completo, forge: false });
  const { $, log } = runtime({ raiz: p.raiz });
  await u.iniciar($);
  assert.deepEqual(log.abertos, [], 'abriu o painel');
  assert.deepEqual(leituras(log, p.raiz), [], 'leu ficheiros');
  assert.deepEqual(log.escritas, [], 'escreveu ficheiros');
});

test('C5: sem .claude/forge.json, dados() não lê ficheiros nem devolve um modelo do painel', async () => {
  const u = await api();
  const p = projeto({ ...CORPUS().completo, forge: false });
  const { $, log } = runtime({ raiz: p.raiz });
  const m = await u.dados($, AGORA);
  assert.deepEqual(leituras(log, p.raiz), [], 'leu ficheiros');
  assert.ok(!(m && Array.isArray(m.contagens)), 'mostrou o painel de um projeto que não é do forge');
});

test('C5: com .claude/forge.json, dados() lê o .checkpoints/painel.json da raiz da sessão e nenhum outro painel.json', async () => {
  const u = await api();
  const p = projeto(CORPUS().completo);
  const { $, log } = runtime({ raiz: p.raiz });
  const m = await u.dados($, AGORA);
  const lidos = log.fs.filter(([op, f]) => op === 'read' && norm(f).endsWith('/painel.json')).map(([, f]) => norm(f));
  assert.ok(lidos.length >= 1, 'não leu o painel.json');
  assert.deepEqual([...new Set(lidos)], [norm(p.file)]);
  assert.deepEqual(projetar(m, await esperado(p)), await esperado(p));
});

// Âmbito do contrato: «um comando para abrir o painel»
test('C5: com .claude/forge.json, iniciar() regista o comando que abre o painel e não escreve nos checkpoints', async () => {
  const u = await api();
  const p = projeto(CORPUS().completo);
  const { $, log } = runtime({ raiz: p.raiz });
  await u.iniciar($);
  assert.ok(log.comandos.length >= 1, 'nenhum comando registado');
  assert.deepEqual(log.escritas.filter((f) => norm(f).includes('/.checkpoints/')), []);
});

test('C5: nunca um caminho fixo: duas raízes (espaços, acentos) com painéis diferentes dão os modelos de cada uma', async () => {
  const u = await api();
  const c = CORPUS();
  const a = projeto({ ...c.completo, nome: 'um projeto com espaços' });
  const b = projeto({ ...c['tickets em todos os estados'], nome: 'Ação Ñandú' });
  for (const p of [a, b, a]) {
    const { $, log } = runtime({ raiz: p.raiz });
    const m = await u.dados($, AGORA);
    assert.deepEqual(projetar(m, await esperado(p)), await esperado(p), p.raiz);
    assert.deepEqual(log.fs.filter(([op, f]) => op === 'read' && norm(f).endsWith('/painel.json') && norm(f) !== norm(p.file)), [], 'leu outro painel');
  }
});

test('C5: um projeto gerado pelo scaffold (corpus do F-02) ativa o mod e mostra o painel que o scaffold escreveu', async () => {
  const u = await api();
  const [first] = corpusAnswers();
  const raiz = await buildProject(first.value, join(tmp(), 'gerado'));
  const p = { raiz, dir: join(raiz, '.checkpoints'), file: join(raiz, '.checkpoints/painel.json') };
  const { $ } = runtime({ raiz });
  const m = await u.dados($, AGORA);
  const exp = await esperado(p);
  assert.ok(Array.isArray(exp.contagens), 'o painel gerado é inválido para o leitor: ' + exp.erro);
  assert.deepEqual(projetar(m, exp), exp);
});

// PERGUNTA 3 da Ronda −1: «não lê ficheiros» inclui correr processos (portas, tokens) e ler as transcrições da sessão?
test('C5 (PERGUNTA 3): sem .claude/forge.json, o mod não corre processos nem lê as transcrições', { todo: 'PERGUNTA 3 da Ronda −1, por responder' }, async () => {
  const u = await api();
  const p = projeto({ ...CORPUS().completo, forge: false });
  const { $, log } = runtime({ raiz: p.raiz });
  await u.iniciar($);
  await u.dados($, AGORA);
  assert.deepEqual(log.processos, []);
  assert.deepEqual(log.sessao.filter((s) => s === 'messages' || s === 'agent.list'), []);
});
