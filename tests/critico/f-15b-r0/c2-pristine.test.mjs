// F-15b critério 2: skills personalizadas — não mexe e avisa. customized ⇔ o conteúdo local, normalizado para LF, não está no
// pristine da componente (gauntlet-loop, sdd e a variante de skill solta do ponytail).
// Oráculo: (1) o pristine real tem os sha256 do upstream nas versões verificadas (calculados pelo crítico, ver helpers), com a
// tag ou o sha e o URL; (2) com o pristine trocado por conteúdos sintéticos (a forma do dev mantém-se), cada versão em LF e em CRLF
// dá um estado ≠ customized; (3) 200 mutações de 1 byte por versão, com semente fixa, dão customized; (4) a cópia personalizada
// anonimizada (189 contra 133 linhas) dá customized, e o --check diz que não lhe toca e como ver a diferença.
// Depende do F-15a: o compat.json; a variante solta do ponytail (detetor de skill solta e o seu comando).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compatReal, comPristine, shasDe, sintetico, personalizada, maquina, instala, estado, upd, skillLocal, crlf, prng, muta, latest, UPSTREAM, ANTIGAS,
  TUDO_VERIFICADO, PONYTAIL_SKILLS, NAO_TOCA, SYN, personalHits, COMPAT, readFileSync,
} from './helpers.mjs';

const N = 200;

test('C2 pristine real: gauntlet-loop, sdd e ponytail têm sha256, a tag ou o sha e o URL; incluem os ficheiros do upstream na versão verificada', () => {
  const c = compatReal().components;
  const falhas = [];
  for (const [id, { ref, files }] of Object.entries(UPSTREAM)) {
    const p = c[id]?.pristine;
    if (p === undefined) { falhas.push(`${id}: sem pristine`); continue; }
    const txt = JSON.stringify(p);
    const shas = shasDe(p);
    if (!/https:\/\//.test(txt)) falhas.push(`${id}: pristine sem URL`);
    if (!txt.includes(ref)) falhas.push(`${id}: pristine sem a tag ou o sha verificados (${ref})`);
    for (const [f, aceites] of Object.entries(files)) if (!aceites.some((h) => shas.includes(h))) falhas.push(`${id}: falta o sha256 de ${f} em ${ref} (LF): ${aceites[0]}`);
  }
  assert.deepEqual(falhas, []);
});

test('C2 pristine real: «cada versão publicada» inclui as anteriores — o ponytail v4.10.0 (a referência de 2026-09-30) e a sdd 2.0.0 (PERGUNTA P9)', () => {
  const c = compatReal().components;
  const falhas = [];
  for (const [id, { ref, files }] of Object.entries(ANTIGAS)) {
    const shas = shasDe(c[id]?.pristine);
    for (const [f, aceites] of Object.entries(files)) if (!aceites.some((h) => shas.includes(h))) falhas.push(`${id}: falta o sha256 de ${f} em ${ref} (LF): ${aceites[0]} — uma cópia intacta dessa versão daria um customized falso`);
  }
  assert.deepEqual(falhas, []);
});

test('C2 pristine real: nenhum caminho da máquina nem dado pessoal no compat.json', () => {
  assert.deepEqual(personalHits(readFileSync(COMPAT, 'utf8')), []);
});

// Uma máquina com só a skill `id` instalada, e o compat com o pristine dessa skill trocado por `versoes` (uma por sha distinto)
const maqSkill = (id, versoes) => {
  const compat = comPristine(compatReal(), { [id]: versoes });
  const m = maquina({ compat, fontes: latest({ gauntlet: versoes[0], sdd: id === 'sdd' ? versoes[0] : SYN.sdd }) });
  return m;
};

for (const id of ['gauntlet-loop', 'sdd']) {
  test(`C2 ${id}: cada versão do pristine, em LF e em CRLF, dá um estado ≠ customized (sem alarme falso)`, async () => {
    const n = shasDe(compatReal().components[id]?.pristine).length;
    assert.ok(n > 0, `${id}: pristine sem sha`);
    const versoes = Array.from({ length: n }, (_, v) => sintetico(id, v));
    const m = maqSkill(id, versoes);
    for (const [v, txt] of versoes.entries()) {
      for (const [fim, conteudo] of [['LF', txt], ['CRLF', crlf(txt)]]) {
        skillLocal(m, id, conteudo);
        const s = (await estado(m)).by[id].status;
        assert.notEqual(s, 'customized', `${id} versão ${v} em ${fim}: customized falso`);
        assert.ok(['ok', 'outdated', 'unverified'].includes(s), `${id} versão ${v} em ${fim}: estado ${s}`);
      }
    }
  });

  test(`C2 ${id}: ${N} mutações de 1 byte por versão (semente fixa, fora dos fins de linha) dão sempre customized`, async () => {
    const n = shasDe(compatReal().components[id]?.pristine).length;
    const versoes = Array.from({ length: n }, (_, v) => sintetico(id, v));
    const m = maqSkill(id, versoes);
    const rnd = prng(0xf15b + id.length);
    const escapam = [];
    for (const txt of versoes) {
      for (let i = 0; i < N; i++) {
        const mut = muta(txt, rnd);
        skillLocal(m, id, i % 2 ? crlf(mut) : mut);
        const s = (await estado(m)).by[id].status;
        if (s !== 'customized') escapam.push(`#${i} → ${s}`);
      }
    }
    assert.deepEqual(escapam.slice(0, 10), [], `${escapam.length} mutações não deram customized`);
  });
}

test('C2 gauntlet-loop: a cópia personalizada anonimizada (189 contra 133 linhas) dá customized; o --check diz que não lhe toca e como ver a diferença', async () => {
  const m = instala(maquina(), { ...TUDO_VERIFICADO, 'gauntlet-loop': personalizada() });
  const r = await estado(m);
  assert.equal(r.by['gauntlet-loop'].status, 'customized');
  const t = await upd(m, ['--check']);
  const linhas = t.out.split('\n');
  const i = linhas.findIndex((l) => /gauntlet/i.test(l) && /customized/i.test(l));
  assert.ok(i >= 0, 'nenhuma linha do --check diz que a gauntlet-loop está customized:\n' + t.out);
  const bloco = linhas.slice(Math.max(0, i - 3), i + 8).join('\n');
  assert.match(bloco, NAO_TOCA, 'o --check não diz que a skill personalizada não vai ser tocada:\n' + bloco);
  assert.match(bloco, /\bdiff\b/i, 'o --check não dá o comando para ver a diferença:\n' + bloco);
  assert.deepEqual(t.execs, []);
});

test('C2 gauntlet-loop: o comando do doctor que apagaria a personalização nunca aparece como algo a correr no --check de uma skill customized', async () => {
  const m = instala(maquina(), { ...TUDO_VERIFICADO, 'gauntlet-loop': personalizada() });
  const t = await upd(m, ['--check']);
  assert.doesNotMatch(t.out, /Copy-Item -Force[^\n]*gauntlet-loop[^\n]*SKILL\.md|cp "\$src\/\.claude\/skills\/gauntlet-loop\/SKILL\.md"/, 'o --check oferece o comando que sobrescreve a skill personalizada');
});

test('C2 ponytail solto [F-15a: skill solta]: as 6 skills no pristine (LF e CRLF) não dão customized; 1 byte mudado numa delas dá customized', async () => {
  const compat = comPristine(compatReal(), { ponytail: SYN.ponytail });
  const m = maquina({ compat });
  instala(m, { ponytailSolto: SYN.ponytail });
  assert.notEqual((await estado(m)).by.ponytail.status, 'customized', 'LF: customized falso');
  for (const n of PONYTAIL_SKILLS) skillLocal(m, n, crlf(SYN.ponytail));
  assert.notEqual((await estado(m)).by.ponytail.status, 'customized', 'CRLF: customized falso');
  const rnd = prng(0x5011);
  const escapam = [];
  for (let i = 0; i < N; i++) {
    const alvo = PONYTAIL_SKILLS[i % PONYTAIL_SKILLS.length];
    for (const n of PONYTAIL_SKILLS) skillLocal(m, n, SYN.ponytail);
    skillLocal(m, alvo, muta(SYN.ponytail, rnd));
    const s = (await estado(m)).by.ponytail.status;
    if (s !== 'customized') escapam.push(`#${i} ${alvo} → ${s}`);
  }
  assert.deepEqual(escapam.slice(0, 10), [], `${escapam.length} mutações não deram customized`);
});

test('C2: uma skill instalada como plugin (ponytail@ponytail) nunca é customized, mesmo com pastas soltas ausentes', async () => {
  const m = instala(maquina(), { ...TUDO_VERIFICADO });
  assert.equal((await estado(m)).by.ponytail.status, 'ok');
});

test('C2: o pristine sintético preserva a forma do dev (sanidade do próprio ataque)', () => {
  const real = compatReal();
  const s = comPristine(real, { 'gauntlet-loop': SYN['gauntlet-loop'] });
  assert.equal(shasDe(s.components['gauntlet-loop'].pristine).length, 1);
  assert.deepEqual(Object.keys(s.components['gauntlet-loop']), Object.keys(real.components['gauntlet-loop']));
});
