// V-02 (#126) C2 (M3): numa cópia temporária, acrescentar a uma suíte um teste que lê scripts/corpus/answers/ sem pôr essa suíte na regra
// faz o lint FALHAR com «consumidor não declarado: <suite> lê scripts/corpus/answers/». A suíte escolhida é uma cujo afetadas() de um
// ficheiro de scripts/corpus/answers/ não a inclui; a regra dessas respostas não pode ser "*" (com "*" não haveria «sem pôr na regra»).
// O prefixo é montado por pedaços: um literal aqui faria o M3 ver a v-02-r0 como consumidora das respostas.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { lerMapa, nomesManifesto, rastreados, regrasDe, nomes, afetadasEm, PASTA_CRITICO, copiaRepo, commitaTudo, escreve, lintEm, resumo, limpa } from './helpers.mjs';

after(limpa);

const RESPOSTAS = ['scripts', 'corpus', 'answers'].join('/') + '/';

test('C2 (M3): um teste novo que lê scripts/corpus/answers/ numa suíte fora da regra faz o lint falhar com «consumidor não declarado»', () => {
  const d = copiaRepo();
  const respostas = rastreados(d).filter((f) => f.startsWith(RESPOSTAS));
  assert.ok(respostas.length >= 3, `controlo: só ${respostas.length} ficheiros em ${RESPOSTAS}`);
  const mapa = lerMapa(d), todas = nomesManifesto(d);
  const regras = [...new Set(respostas.flatMap((f) => regrasDe(mapa, f)))];
  assert.ok(regras.length > 0, `nenhuma regra casa com ${RESPOSTAS}`);
  assert.deepEqual(regras.filter((r) => r.suites.includes('*')).map((r) => r.caminhos), [], `a regra de ${RESPOSTAS} não pode ser "*"`);
  const cobertas = new Set(respostas.flatMap((f) => [...nomes(afetadasEm(d, [f]), todas)]));
  const alvo = todas.filter((s) => s !== 'scripts' && !cobertas.has(s) && existsSync(join(d, PASTA_CRITICO, s))).sort().at(-1);
  assert.ok(alvo, 'todas as suítes já estão nas afetadas das respostas: não há suíte para o ataque');
  const rel = `${PASTA_CRITICO}${alvo}/zz-v02-le-respostas.test.mjs`;
  escreve(d, rel, [
    "import { test } from 'node:test';",
    "import { existsSync } from 'node:fs';",
    `test('lê as respostas do corpus', () => { existsSync('${RESPOSTAS}'); });`,
    '',
  ].join('\n'));
  commitaTudo(d, 'consumidor novo');
  const r = lintEm(d);
  assert.notEqual(r.status, 0, `o lint passou com ${alvo} a ler ${RESPOSTAS} fora da regra:\n` + resumo(r));
  const msg = `consumidor não declarado: ${alvo} lê ${RESPOSTAS}`;
  assert.ok(r.out.includes(msg), `a falha não diz «${msg}»:\n` + resumo(r));
});