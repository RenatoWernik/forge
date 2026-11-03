// Ronda −1 do V-11 (#135): a prova negativa por pasta convertida e o skip fora do ramo, num clone com a história (as BASE fixas existem lá).
// Mutações, todas no mesmo clone, fora do repo:
//   MA: um ficheiro novo fora de tests/ com um caminho da máquina e um import de fora da biblioteca padrão;
//   MB: scripts/scaffold.test.mjs perde um test( (e uma linha da base);
//   MC: tests/critico/f-01-r0/c3-check-env.test.mjs perde um test( (e muda um byte);
//   MD: apaga-se a primeira mutação do corpus da BASE do f-08 que também está na BASE do f-14.
// Oráculos (de âmbito: provam as conversões deste ticket; fora dos ramos v-11* fazem skip):
// - cada teste da TABELA que está convertido (título «ÂMBITO:» e soNoTicket(t, '<id da pasta>')), corrido no ramo <id>-x (GITHUB_HEAD_REF e
//   o HEAD do clone), FALHA e nomeia a sua mutação;
// - cada teste convertido das pastas de legado, corrido no ramo zz-v11-outro, faz skip com «âmbito do <id>: fora da branch <id>*»;
// - cada teste que o ticket converte (não tinha soNoTicket no merge-base) está na TABELA. Os outros usos de BASE vão para referencia
//   (RESPOSTA 6562861661); converter um teste fora da TABELA pede uma PERGUNTA na #135.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { soNoTicket } from '../_comum/ambito.mjs';
import { ROOT, LEGADO, DECL, idDaPasta, pastaDe, arvore, ler, testes, semPrefixo, deAmbito, naRevisao, listaNaBase, base, gitRaiz, clona,
  ramo, nodeTest, cauda, escreve, limpa } from './helpers.mjs';

after(limpa);
const MA = 'scripts/v11-mutacao.mjs', MB = 'scripts/scaffold.test.mjs', MC = 'tests/critico/f-01-r0/c3-check-env.test.mjs';
const T = (ficheiro, frag, nomeia, estatico = frag) => ({ ficheiro: 'tests/critico/' + ficheiro, frag, nomeia, estatico });
const PACOTE = (f) => [T(f, 'o que o ticket acrescenta ao pacote', 'v11-mutacao.mjs'), T(f, 'só biblioteca padrão', 'v11-mutacao.mjs')];
const C4 = (f) => [T(f, 'nenhum scripts/**', 'scaffold.test.mjs', 'C4 regressão estática: nenhum '),
  T(f, 'nenhum tests/critico/**', 'f-01-r0/c3-check-env.test.mjs', 'C4 regressão estática: nenhum ')];
export const TABELA = [
  T('f-04-r0/regressao.test.mjs', 'o que o ticket acrescenta ao pacote', 'v11-mutacao.mjs'),
  ...PACOTE('f-07-r0/regressao.test.mjs'),
  T('f-08-r0/regressao.test.mjs', 'o corpus de mutações não perde nenhuma', '@MD'), ...PACOTE('f-08-r0/regressao.test.mjs'),
  ...PACOTE('f-09-r0/regressao.test.mjs'), ...PACOTE('f-10-r0/regressao.test.mjs'),
  T('f-11-r0/regressao.test.mjs', 'só biblioteca padrão', 'v11-mutacao.mjs'),
  T('f-11-r0/c2-sem-caminhos.test.mjs', 'o que o ticket acrescenta ao pacote não têm caminhos', 'v11-mutacao.mjs'),
  ...PACOTE('f-12-r0/regressao.test.mjs'), ...PACOTE('f-13-r0/regressao.test.mjs'),
  T('f-14-r0/regressao-higiene.test.mjs', 'nenhum ataque da Ronda −1 já fundido', 'f-01-r0/c3-check-env.test.mjs'), ...PACOTE('f-14-r0/regressao-higiene.test.mjs'),
  T('f-14-r0/regressao-pacote.test.mjs', 'nenhum scripts/*.test.mjs da base desaparece', 'scaffold.test.mjs'),
  T('f-14-r0/c8-corpus.test.mjs', 'as mutações do corpus da base continuam lá', '@MD'),
  ...PACOTE('f-15a-r0/regressao.test.mjs'),
  ...C4('f-16-r0/c4-corpus-e-regressao.test.mjs'), ...C4('f-17-r0/c4-regressao.test.mjs'),
  T('f-20a-r0/c4-projeto.test.mjs', 'scripts/scaffold.test.mjs mantém todas as linhas da base', 'em scripts/scaffold.test.mjs'),
  T('f-20a-r0/c4-projeto.test.mjs', 'os ataques de tests/critico/ que existiam na base ficam byte a byte', MC),
  // RESPOSTA da Ronda 2 (#135): as guardas separadas do comportamento (f-25, f-20b), o f-23a (a mutação do desfecho do gauntlet-build.js partia-o
  // fora do ramo) e as duas guardas do v-03-r0, cada uma com a sua mutação
  T('f-25-r0/c2-gravar.test.mjs', 'o §6 do FRAMEWORK mantém', 'o §6 perdeu ou mudou esta linha'),
  ...['gauntlet-build.js', 'gauntlet-batch.js', 'gauntlet-ponytail.js'].map((wf) => T('f-25-r0/c2-gravar.test.mjs', `o SAME_DATA de ${wf} mantém`, 'o texto existente do SAME_DATA mudou', 'o SAME_DATA de ${wf} mantém')),
  T('f-20b-r0/c6-manual.test.mjs', 'o verifiedWith não muda e os comandos antigos ficam', '3.2.11'),
  T('f-23a-r0/c1-pre-existente.test.mjs', 'guarda, propriedade', 'rounds'), T('f-23a-r0/regressao.test.mjs', 'regra geral [guarda]', 'rounds'),
  T('v-03-r0/guardas.test.mjs', 'os ficheiros de tests/critico/ da base fora da lista', 'f-01-r0/c3-check-env.test.mjs'),
  T('v-03-r0/guardas.test.mjs', 'nos ficheiros da lista autorizada, os asserts', 'f-01-r0/regressao.test.mjs'),
];

// os testes de âmbito (título «ÂMBITO:» e soNoTicket com o id da pasta) dos ficheiros das pastas de legado e das guardas do v-03-r0: {ficheiro, id, te}
const V03_GUARDAS = 'tests/critico/v-03-r0/guardas.test.mjs';
const convertidos = () => arvore().filter((f) => (LEGADO.includes(pastaDe(f)) && f.endsWith('.test.mjs')) || f === V03_GUARDAS)
  .flatMap((f) => testes(ler(f)).filter((te) => deAmbito(te, idDaPasta(pastaDe(f)))).map((te) => ({ ficheiro: f, id: idDaPasta(pastaDe(f)), te })));
const naTabela = (c) => TABELA.some((e) => e.ficheiro === c.ficheiro && c.te.titulo.includes(e.estatico));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SO_AMBITO = '^.MBITO: .*'; // o --test-name-pattern só deixa correr os testes de âmbito (os outros dos regressao correm suítes inteiras)
const trechoLiteral = (titulo) => titulo.split(/\$\{[^}]*\}/).sort((a, b) => b.length - a.length)[0];

const primeiraLinhaTest = (p) => { const s = readFileSync(p, 'utf8'), n = s.replace(/^test\(/m, 'testV11('); assert.notEqual(n, s, 'controlo: sem test( em ' + p); writeFileSync(p, n); };
function muta(d) {
  escreve(d, MA, "// C:\\Users\\v11\\mutacao\nimport x from 'v11-pacote-de-fora';\nexport default x;\n");
  primeiraLinhaTest(join(d, MB));
  primeiraLinhaTest(join(d, MC));
  const sha = (p) => DECL.exec(ler(`tests/critico/${p}/helpers.mjs`))[1];
  const lista = (s) => gitRaiz('ls-tree', '--name-only', `${s}:scripts/corpus/mutations`).stdout.split('\n').map((x) => x.trim()).filter(Boolean);
  const f14 = new Set(lista(sha('f-14-r0')));
  const md = lista(sha('f-08-r0')).find((n) => f14.has(n) && existsSync(join(d, 'scripts/corpus/mutations', n)));
  assert.ok(md, 'controlo: nenhuma mutação comum às BASE do f-08 e do f-14');
  rmSync(join(d, 'scripts/corpus/mutations', md));
  mutaRonda2(d);
  return md;
}

// RESPOSTA da Ronda 2 (#135): as mutações das guardas separadas, do f-23a e do v-03-r0 (a base de cada uma é o sha do helpers.mjs da pasta)
const CMD = 'node .claude/painel-gravar.mjs';
const naBaseDe = (p, rel) => gitRaiz('show', `${DECL.exec(ler(`tests/critico/${p}/helpers.mjs`))[1]}:${rel}`).stdout.replace(/\r\n/g, '\n');
const edita = (d, rel, f) => { const p = join(d, rel), s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n'), n = f(s); assert.notEqual(n, s, 'controlo: a mutação não mudou ' + rel); writeFileSync(p, n); };
const sec6 = (t) => { const i = t.indexOf('\n## 6.'); const j = t.indexOf('\n## ', i + 1); return t.slice(i, j < 0 ? undefined : j); };
const sameData = (t) => { const m = /const SAME_DATA = (['"`])((?:\\.|(?!\1).)*)\1/s.exec(t); return m ? m[2] : null; };
function mutaRonda2(d) {
  // f-25: uma linha do §6 do FRAMEWORK perde uma letra; o texto da base de cada SAME_DATA perde uma letra
  const l6 = sec6(naBaseDe('f-25-r0', 'templates/FRAMEWORK.md')).split('\n').filter((x) => x.trim() && !x.includes(CMD) && /[a-z]/.test(x)).sort((a, b) => b.length - a.length)[0];
  edita(d, 'templates/FRAMEWORK.md', (s) => s.replaceAll(l6, l6.replace(/[a-z]/, 'Q')));
  for (const wf of ['gauntlet-build.js', 'gauntlet-batch.js', 'gauntlet-ponytail.js']) {
    const rel = `templates/.claude/workflows/${wf}`, velho = sameData(naBaseDe('f-25-r0', rel));
    edita(d, rel, (s) => { const k = s.indexOf(velho) + velho.search(/[a-z]/); return s.slice(0, k) + 'Q' + s.slice(k + 1); });
  }
  // f-20b: o verifiedWith do ai-memory sobe
  edita(d, 'compat.json', (s) => { const j = JSON.parse(s); j.components['ai-memory'].verifiedWith = '3.2.11'; return JSON.stringify(j, null, 2) + '\n'; });
  // f-23a: o desfecho do gauntlet-build.js muda (uma ronda a mais antes de parar, nos dois modos)
  edita(d, 'templates/.claude/workflows/gauntlet-build.js', (s) => s.replace("MODE === 'rigorous' && round >= CAP) stop('contract')", "MODE === 'rigorous' && round >= CAP + 1) stop('contract')")
    .replace("else if (round >= CAP) stop({ reason: 'maxRounds' })", "else if (round >= CAP + 1) stop({ reason: 'maxRounds' })"));
  // v-03: um assert de uma regressao.test.mjs autorizada desaparece
  edita(d, 'tests/critico/f-01-r0/regressao.test.mjs', (s) => s.replace(/\bassert\.\w+\(/, 'void('));
}

test('ÂMBITO: C3 cada teste que o ticket converte nas pastas de legado tem prova negativa na TABELA (os outros usos de BASE ficam em referencia)', (t) => {
  if (soNoTicket(t, 'v-11')) return;
  const mb = base();
  if (!mb) return t.skip('sem origin/main');
  const cs = convertidos(), antes = naRevisao(mb, [...new Set(cs.map((c) => c.ficheiro))]);
  const fora = cs.filter((c) => !testes(antes.get(c.ficheiro) ?? '').some((x) => semPrefixo(x.titulo) === semPrefixo(c.te.titulo) && x.ids.includes(c.id)))
    .filter((c) => !naTabela(c)).map((c) => `${c.ficheiro}:${c.te.linha}: «${c.te.titulo.slice(0, 100)}»`);
  assert.deepEqual(fora, [], 'convertidos sem prova negativa no V-11 (PERGUNTA na #135 antes de converter):\n' + fora.join('\n'));
});

test('ÂMBITO: C3 prova negativa: no ramo <id>-x de cada pasta, cada teste convertido da TABELA falha com a sua mutação e nomeia-a', (t) => {
  if (soNoTicket(t, 'v-11')) return;
  const d = clona();
  if (!d) return t.skip('sem origin/main');
  const md = muta(d);
  const cs = convertidos(), falhas = [];
  const alvo = TABELA.filter((e) => cs.some((c) => c.ficheiro === e.ficheiro && c.te.titulo.includes(e.estatico)));
  assert.ok(alvo.length >= 2, 'controlo: a TABELA tem de apanhar pelo menos as duas guardas do f-20a (F-29)');
  for (const f of [...new Set(alvo.map((e) => e.ficheiro))]) {
    const id = idDaPasta(pastaDe(f)), es = alvo.filter((e) => e.ficheiro === f);
    ramo(d, id + '-x');
    const r = nodeTest(d, ['--test-name-pattern=' + SO_AMBITO + '(?:' + es.map((e) => esc(e.frag)).join('|') + ')', f], { GITHUB_HEAD_REF: id + '-x' });
    for (const e of es) {
      const nomeia = e.nomeia === '@MD' ? md : e.nomeia;
      const rs = r.resultados.filter((x) => x.titulo.includes(e.frag));
      if (!rs.length) falhas.push(`${f} «${e.frag}»: não correu no ramo ${id}-x\n${cauda(r, 1500)}`);
      else if (rs.some((x) => x.ok || !x.bloco.includes(nomeia))) falhas.push(`${f} «${e.frag}»: no ramo ${id}-x não falhou a nomear ${nomeia}\n${rs.map((x) => x.bloco).join('\n').slice(0, 1500)}`);
    }
  }
  assert.deepEqual(falhas, []);
});

test('ÂMBITO: C3 fora do ramo: cada teste convertido das pastas de legado, no ramo zz-v11-outro, faz skip com «âmbito do <id>: fora da branch <id>*»', (t) => {
  if (soNoTicket(t, 'v-11')) return;
  const d = clona();
  if (!d) return t.skip('sem origin/main');
  ramo(d, 'zz-v11-outro');
  const cs = convertidos(), falhas = [];
  assert.ok(cs.length >= 2, 'controlo: pelo menos as duas guardas do f-20a (F-29)');
  for (const f of [...new Set(cs.map((c) => c.ficheiro))]) {
    const es = cs.filter((c) => c.ficheiro === f);
    const r = nodeTest(d, ['--test-name-pattern=' + SO_AMBITO + '(?:' + es.map((c) => esc(trechoLiteral(semPrefixo(c.te.titulo)))).join('|') + ')', f], { GITHUB_HEAD_REF: 'zz-v11-outro' });
    for (const c of es) {
      const rs = r.resultados.filter((x) => x.titulo.includes(trechoLiteral(semPrefixo(c.te.titulo)).replaceAll('#', '\\#')));
      const motivo = `âmbito do ${c.id}: fora da branch ${c.id}`;
      if (!rs.length || rs.some((x) => !x.ok || !x.bloco.includes('# SKIP') || !x.bloco.includes(motivo)))
        falhas.push(`${f}:${c.te.linha} «${c.te.titulo.slice(0, 80)}»: sem skip com «${motivo}*»\n${(rs.map((x) => x.bloco).join('\n') || cauda(r, 1200)).slice(0, 1200)}`);
    }
  }
  assert.deepEqual(falhas, []);
});