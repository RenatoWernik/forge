// Ronda −1 do F-26 (#101), C2: o lint contra um corpus fechado de casos, plantados como pastas novas numa cópia do repo.
// Oráculo: os casos em casos/ (7 maus, 4 limpos), cada um com a regra esperada, e o esperado.json de cada caso do corpus do dev. Um caso mau tem de dar FAIL, com a regra e o ficheiro nos blocos
// «not ok»; um caso limpo tem de dar 0 falhas. O caso real é o f-22a-r0 antes da correção do merge-base (o c6 e o helpers do commit
// «F-22a Ronda -1: ataques do C3 ... (#75)» do ramo f-22a-registo-learnings): o sha está no helpers.mjs, que é onde o L1 tem de apontar.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { ROOT, CORPUS, LEGADO, EM_CURSO, SHA_F22A, temLint, copia, repoe, planta, corre, resumo, caso, apaga } from './helpers.mjs';

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

// O corpus do dev (formato da RESPOSTA na #101): scripts/corpus/guardas/<caso>/ com os .mjs e um esperado.json, {regra, ficheiro} ou {ok: true}.
const casosDev = () => { const p = join(ROOT, CORPUS); return existsSync(p) ? readdirSync(p).filter((e) => statSync(join(p, e)).isDirectory()) : []; };
const lerCaso = (c) => {
  const dir = join(ROOT, CORPUS, c);
  const fs_ = [];
  const anda = (a, rel) => { for (const e of readdirSync(a)) { const f = join(a, e), r = rel ? rel + '/' + e : e; if (statSync(f).isDirectory()) anda(f, r); else fs_.push(r); } };
  anda(dir, '');
  const esp = existsSync(join(dir, 'esperado.json')) ? JSON.parse(readFileSync(join(dir, 'esperado.json'), 'utf8')) : null;
  return { dir, ficheiros: fs_.filter((r) => r !== 'esperado.json'), esp };
};

test('C2 o corpus do dev: cada caso tem esperado.json válido; ≥5 maus (com L1, L2 e L3), ≥4 limpos; o caso real do f-22a é um mau L1', () => {
  assert.ok(existsSync(join(ROOT, CORPUS)), 'falta ' + CORPUS);
  const maus = [], limpos = [];
  for (const c of casosDev()) {
    const { dir, ficheiros: fs_, esp } = lerCaso(c);
    assert.ok(esp, c + ': falta esperado.json');
    assert.ok(fs_.some((r) => r.endsWith('.mjs')), c + ': sem ficheiros .mjs');
    assert.ok(!LEGADO.includes(c) && !EM_CURSO.includes(c), c + ': o nome do caso colide com a lista congelada');
    if (esp.ok === true) { assert.deepEqual(Object.keys(esp), ['ok'], c + ': esperado.json limpo só com {ok: true}'); limpos.push(c); continue; }
    assert.ok(['L1', 'L2', 'L3'].includes(esp.regra), c + ': regra inválida ' + esp.regra);
    assert.ok(typeof esp.ficheiro === 'string' && fs_.includes(esp.ficheiro), c + ': o ficheiro do esperado.json não está no caso: ' + esp.ficheiro);
    maus.push({ c, esp, real: fs_.some((r) => readFileSync(join(dir, r), 'utf8').includes(SHA_F22A)) });
  }
  assert.ok(maus.length >= 5, maus.length + ' casos maus');
  assert.ok(limpos.length >= 4, limpos.length + ' casos limpos');
  for (const r of ['L1', 'L2', 'L3']) assert.ok(maus.some((m) => m.esp.regra === r), 'nenhum caso mau de ' + r);
  assert.ok(maus.some((m) => m.real && m.esp.regra === 'L1'), 'nenhum caso mau L1 traz ' + SHA_F22A + ' (o f-22a-r0 antigo real)');
});

// cada caso do dev, plantado como tests/critico/<caso>/ na cópia, dá o que o esperado.json diz
for (const c of casosDev()) {
  test(`C2 corpus do dev › ${c}: plantado na cópia, o lint dá o que o esperado.json diz`, () => {
    assert.ok(temLint(), 'falta scripts/guardas-critico.test.mjs');
    const { dir, ficheiros: fs_, esp } = lerCaso(c);
    assert.ok(esp, c + ': falta esperado.json');
    planta(d, c, Object.fromEntries(fs_.map((r) => [r, readFileSync(join(dir, r), 'utf8')])));
    try {
      const r = corre(d);
      if (esp.ok === true) { assert.equal(r.falhas, '', 'falso positivo:\n' + r.falhas.slice(0, 3000)); assert.equal(r.code, 0, resumo(r)); return; }
      assert.notEqual(r.code, 0, 'o lint passou com o caso mau:\n' + resumo(r));
      assert.match(r.falhas, new RegExp('\\b' + esp.regra + '\\b'), 'as falhas não nomeiam ' + esp.regra + ':\n' + r.falhas.slice(0, 3000));
      assert.ok(r.falhas.includes(esp.ficheiro.split('/').pop()), 'as falhas não nomeiam ' + esp.ficheiro + ':\n' + r.falhas.slice(0, 3000));
    } finally { repoe(d); }
  });
}
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