// V-05 (#129) C2, ponta real: na base (o HEAD deste repo), com um diff fictício que só toca num ficheiro de tests/critico/f-27-r0/, o check-ticket
// dá 0 em ≤ 5 min de relógio, mediana de 3 corridas. Cada corrida é um clone novo do HEAD (nada reaproveitado de outra corrida), com
// origin/main = HEAD e um commit que acrescenta uma linha de comentário ao c1-limite.test.mjs; o relógio soma as chamadas (as `--continuar`
// depois de um código 3) e para aos 300 s. Corre com o TEMP real da máquina (as vagas globais reais).
// Só corre com FORGE_V05_PONTA=<pasta>: as 3 corridas passam dos 540 s de uma chamada de ferramenta. As medições ficam em
// <pasta>/c2/medicoes.json, ligadas ao sha do HEAD; cada chamada faz as corridas que cabem em 480 s e, se faltarem, o teste falha a dizer
// quantas: corre-se de novo com a mesma pasta. Lido como PERGUNTA na #129.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, tmp, gitOk, shaDe, correr, linhas, saida, exigeCheck, PASSOS, limpa } from './helpers.mjs';

after(limpa);

const PONTA = process.env.FORGE_V05_PONTA;
const LIMITE_MS = 300000;
const ALVO = 'tests/critico/f-27-r0/c1-limite.test.mjs';

async function umaCorrida(sha) {
  const d = join(tmp('v05-c2-'), 'repo');
  gitOk(ROOT, 'clone', '-q', '--no-checkout', ROOT, d);
  gitOk(d, 'checkout', '-q', '-b', 'v-05-c2-ponta', sha);
  gitOk(d, 'update-ref', 'refs/remotes/origin/main', sha);
  appendFileSync(join(d, ALVO), '// diff fictício do C2 do V-05\n');
  gitOk(d, 'commit', '-q', '-am', 'diff fictício do C2 (V-05)');
  const t0 = Date.now(), chamadas = [];
  let r;
  for (;;) {
    const resta = LIMITE_MS - (Date.now() - t0);
    if (resta <= 0) break;
    r = await correr(d, ['--ambito', 'tests/critico/f-27-r0/**', '--base', 'origin/main', ...(chamadas.length ? ['--continuar'] : [])], { limite_ms: resta, tempReal: true });
    chamadas.push(r.status);
    if (r.status !== 3) break;
  }
  return { sha, ms: Date.now() - t0, codigo: r?.status ?? null, chamadas, linhas: linhas(r?.out ?? '').map((l) => l.linha), fim: saida(r ?? { status: null, out: '', err: '', ms: 0 }).slice(-1500) };
}

test('C2 (ponta real): um diff que só toca em tests/critico/f-27-r0/ dá 0 em ≤ 5 min de relógio, mediana de 3 corridas', async (t) => {
  if (!PONTA) return t.skip('ponta real: corre só com FORGE_V05_PONTA=<pasta> (crítico da R1 e Ronda 0)');
  exigeCheck();
  const sha = shaDe(ROOT);
  mkdirSync(join(PONTA, 'c2'), { recursive: true });
  const fich = join(PONTA, 'c2', 'medicoes.json');
  const med = existsSync(fich) ? JSON.parse(readFileSync(fich, 'utf8')).filter((m) => m.sha === sha) : [];
  const t0 = Date.now();
  while (med.length < 3 && Date.now() - t0 + LIMITE_MS <= 480000) {
    med.push(await umaCorrida(sha));
    writeFileSync(fich, JSON.stringify(med, null, 2));
  }
  assert.equal(med.length, 3, `faltam ${3 - med.length} medições: corra de novo com o mesmo FORGE_V05_PONTA (${fich})`);
  for (const m of med) {
    assert.equal(m.codigo, 0, `uma corrida não deu 0 (chamadas ${m.chamadas.join(',')}, ${Math.round(m.ms / 1000)} s):\n${m.fim}`);
    assert.deepEqual(m.linhas.map((l) => l.replace(/ \(.*$/, '')), PASSOS.map((p) => `ok ${p}`));
  }
  const mediana = med.map((m) => m.ms).sort((a, b) => a - b)[1];
  assert.ok(mediana <= LIMITE_MS, `mediana ${Math.round(mediana / 1000)} s > 300 s (${med.map((m) => Math.round(m.ms / 1000)).join(', ')} s)`);
});