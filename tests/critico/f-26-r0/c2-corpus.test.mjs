// Ronda −1 do F-26 (#101), C2: o lint contra um corpus fechado de casos, plantados como pastas novas numa cópia do repo.
// Oráculo: os casos em casos/ (7 maus, 4 limpos), cada um com a regra esperada. Um caso mau tem de dar FAIL, com a regra e o ficheiro nos blocos
// «not ok»; um caso limpo tem de dar 0 falhas. O caso real é o f-22a-r0 antes da correção do merge-base (o c6 e o helpers do commit
// «F-22a Ronda -1: ataques do C3 ... (#75)» do ramo f-22a-registo-learnings): o sha está no helpers.mjs, que é onde o L1 tem de apontar.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { ROOT, CORPUS, SHA_F22A, temLint, copia, repoe, planta, corre, resumo, caso, apaga } from './helpers.mjs';

const PASTA = 'f-97-r0'; // uma pasta nova, fora da lista congelada
const MAUS = [
  ['L1', 'BASE fixo usado em git diff', { 'c9-base-fixo.test.mjs': 'mau-l1-base.txt' }, 'c9-base-fixo.test.mjs'],
  ['L1', 'sha no array de spawnSync(\'git\', [...])', { 'c9-array.test.mjs': 'mau-l1-array.txt' }, 'c9-array.test.mjs'],
  ['L1', 'sha num template literal de git show', { 'c9-template.test.mjs': 'mau-l1-template.txt' }, 'c9-template.test.mjs'],
  ['L2', 'teste de âmbito sem soNoTicket', { 'c9-ambito-sem.test.mjs': 'mau-l2.txt' }, 'c9-ambito-sem.test.mjs'],
  ['L2', 'dois testes de âmbito, só um com soNoTicket', { 'c9-ambito-dois.test.mjs': 'mau-l2-dois.txt' }, 'c9-ambito-dois.test.mjs'],
  ['L3', 'git diff de nomes fora de âmbito e sem base()', { 'c9-so-mudou.test.mjs': 'mau-l3.txt' }, 'c9-so-mudou.test.mjs'],
  ['L1', 'o f-22a-r0 antigo real (c6 + helpers com o sha)', { 'c6-manual-projeto.test.mjs': 'f22a-antigo/c6-manual-projeto.test.mjs.txt', 'helpers.mjs': 'f22a-antigo/helpers.mjs.txt' }, 'helpers.mjs'],
];
const LIMPOS = [
  ['guarda com base()', { 'c9-com-base.test.mjs': 'limpo-base.txt' }],
  ['teste de âmbito com soNoTicket', { 'c9-ambito-com.test.mjs': 'limpo-ambito.txt' }],
  ['sha num ref de fixture (estilo f-15a)', { 'c9-fixture.test.mjs': 'limpo-fixture.txt' }],
  ['sha só em comentários', { 'c9-comentario.test.mjs': 'limpo-comentario.txt' }],
];
const ficheiros = (m) => Object.fromEntries(Object.entries(m).map(([destino, fonte]) => [destino, caso(fonte)]));

let d = null;
before(() => { if (temLint()) d = copia(); });
after(() => { if (d) apaga(d); });

test('C2 o corpus do dev existe em scripts/corpus/guardas/ e traz o caso real do f-22a (o sha da base antiga)', () => {
  const p = join(ROOT, CORPUS);
  assert.ok(existsSync(p), 'falta ' + CORPUS);
  const textos = [];
  const anda = (a) => { for (const e of readdirSync(a)) { const f = join(a, e); if (statSync(f).isDirectory()) anda(f); else textos.push(readFileSync(f, 'utf8')); } };
  anda(p);
  assert.ok(textos.some((x) => x.includes(SHA_F22A)), 'nenhum ficheiro do corpus traz ' + SHA_F22A);
});

for (const [regra, nome, m, alvo] of MAUS) {
  test(`C2 caso mau (${regra}): ${nome} dá FAIL com ${regra} e ${alvo}`, () => {
    assert.ok(temLint(), 'falta scripts/guardas-critico.test.mjs');
    planta(d, PASTA, ficheiros(m));
    try {
      const r = corre(d);
      assert.notEqual(r.code, 0, 'o lint passou com o caso mau:\n' + resumo(r));
      assert.match(r.falhas, new RegExp('\\b' + regra + '\\b'), `as falhas não nomeiam ${regra}:\n` + r.falhas.slice(0, 3000));
      assert.ok(r.falhas.includes(alvo), `as falhas não nomeiam o ficheiro ${alvo}:\n` + r.falhas.slice(0, 3000));
    } finally { repoe(d); }
  });
}

for (const [nome, m] of LIMPOS) {
  test(`C2 caso limpo: ${nome} dá 0 falhas`, () => {
    assert.ok(temLint(), 'falta scripts/guardas-critico.test.mjs');
    planta(d, PASTA, ficheiros(m));
    try {
      const r = corre(d);
      assert.equal(r.falhas, '', 'falso positivo:\n' + r.falhas.slice(0, 3000));
      assert.equal(r.code, 0, 'o lint falhou com o caso limpo:\n' + resumo(r));
    } finally { repoe(d); }
  });
}