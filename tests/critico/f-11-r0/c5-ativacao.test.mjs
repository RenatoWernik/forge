// Critério 5: sem .claude/forge.json na raiz do projeto aberto, o mod não abre o painel nem lê ficheiros; com ele, lê o
// .checkpoints/painel.json dessa raiz. Oráculo: o runtime falso, com e sem o ficheiro, e a contagem de leituras de ficheiro.
// Respostas do orquestrador (#12): 3 = «não lê» inclui não correr processos nem ler transcrições; 6 = a raiz é session.root(),
// e session.cwd() se root() vier undefined; 8 = o arranque só regista o comando (nunca abre o painel sozinho), também sem
// forge.json, e o comando, sem forge.json, mostra «este projeto não é um projeto forge» sem ler nada.
// Também (pedido da Ronda −1): nunca um caminho fixo; duas raízes diferentes dão dois modelos diferentes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { api, projeto, runtime, esperado, projetar, CORPUS, AGORA, norm, buildProject, corpusAnswers, tmp } from './helpers.mjs';

const ehForgeJson = (raiz) => (f) => norm(f) === norm(join(raiz, '.claude/forge.json'));
// Leituras de ficheiro: read, list e stat; o forge.json conta como verificação de ativação, não como leitura
const leituras = (log, raiz) => log.fs.filter(([op, f]) => op !== 'exists' && !ehForgeJson(raiz)(f));
const NAO_FORGE = /este projeto não é um projeto forge/i;

test('C5 (resposta 3): sem .claude/forge.json, iniciar(), dados() e abrir() não leem ficheiros, não correm processos, não leem transcrições nem escrevem', async () => {
  const u = await api();
  const p = projeto({ ...CORPUS().completo, forge: false });
  const { $, log } = runtime({ raiz: p.raiz, saidas: { netstat: 'x', lsof: 'x', ss: 'x', node: '{}' } });
  await u.iniciar($);
  const m = await u.dados($, AGORA);
  await u.abrir($);
  assert.deepEqual(leituras(log, p.raiz), [], 'leu ficheiros');
  assert.deepEqual(log.processos, [], 'correu processos');
  assert.deepEqual(log.sessao.filter((s) => s === 'messages' || s === 'agent.list'), [], 'leu transcrições');
  assert.deepEqual(log.escritas, [], 'escreveu ficheiros');
  assert.ok(!(m && Array.isArray(m.contagens)), 'mostrou o painel de um projeto que não é do forge');
});

test('C5 (resposta 8): sem .claude/forge.json, o arranque regista o comando e não abre o painel; o comando mostra «este projeto não é um projeto forge»', async () => {
  const u = await api();
  const p = projeto({ ...CORPUS().completo, forge: false });
  const { $, log } = runtime({ raiz: p.raiz });
  await u.iniciar($);
  assert.ok(log.comandos.length >= 1, 'o comando não foi registado sem forge.json');
  assert.deepEqual(log.abertos, [], 'o arranque abriu o painel');
  const r = await u.abrir($);
  assert.match(String(r?.text), NAO_FORGE);
  assert.deepEqual(leituras(log, p.raiz), [], 'leu ficheiros');
});

test('C5 (resposta 8): com .claude/forge.json, o arranque regista o comando e não abre o painel sozinho; o comando abre-o', async () => {
  const u = await api();
  const p = projeto(CORPUS().completo);
  const { $, log } = runtime({ raiz: p.raiz });
  await u.iniciar($);
  assert.ok(log.comandos.length >= 1, 'nenhum comando registado');
  assert.deepEqual(log.abertos, [], 'o arranque abriu o painel sozinho');
  const r = await u.abrir($);
  assert.ok(log.abertos.length >= 1, 'o comando não abriu o painel');
  assert.doesNotMatch(String(r?.text ?? ''), NAO_FORGE, 'disse que não é um projeto forge');
  assert.deepEqual(log.escritas.filter((f) => norm(f).includes('/.checkpoints/')), []);
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

test('C5 (resposta 6): com root() e cwd() em projetos diferentes, o mod usa o de root()', async () => {
  const u = await api();
  const c = CORPUS();
  const a = projeto({ ...c.completo, nome: 'raiz A' });
  const b = projeto({ ...c['tickets em todos os estados'], nome: 'cwd B' });
  const { $, log } = runtime({ raiz: a.raiz, cwd: b.raiz });
  const m = await u.dados($, AGORA);
  assert.deepEqual(projetar(m, await esperado(a)), await esperado(a));
  assert.deepEqual(log.fs.filter(([, f]) => norm(f).startsWith(norm(b.raiz) + '/')), [], 'tocou na pasta de cwd()');
});

test('C5 (resposta 6): com root() undefined, o mod usa cwd(); sem forge.json em cwd(), não lê', async () => {
  const u = await api();
  const c = CORPUS();
  const b = projeto({ ...c['agente sem sinal e parado?'], nome: 'só cwd' });
  const r1 = runtime({ raiz: undefined, cwd: b.raiz });
  const m = await u.dados(r1.$, AGORA);
  assert.deepEqual(projetar(m, await esperado(b)), await esperado(b));
  const n = projeto({ ...c.completo, forge: false, nome: 'só cwd sem forge' });
  const r2 = runtime({ raiz: undefined, cwd: n.raiz });
  await u.iniciar(r2.$);
  await u.dados(r2.$, AGORA);
  assert.deepEqual(leituras(r2.log, n.raiz), [], 'leu ficheiros');
  assert.deepEqual(r2.log.processos, [], 'correu processos');
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
