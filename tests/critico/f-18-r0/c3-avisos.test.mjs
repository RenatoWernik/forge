// F-18 critério 3 (#63).
// Oráculos:
//   - ATAQUE: em skills/update/SKILL.md, «The output can end with warnings» aparece 0 vezes e a frase nova (C3_NOVA) 1 vez; o resto do
//     parágrafo fica igual byte a byte (C3_RESTO, o texto da base 0c1bfae depois de «new commits.»);
//   - GUARDA: a regra literal do F-17 continua a aparecer 1 vez;
//   - GUARDA de comportamento: na saída de texto do --check (formatText) de uma máquina falsa com um aviso de componente (um id de plugin
//     inválido no installed_plugins.json, aviso do doctor) e um aviso global (commits novos no original do gauntlet-loop), a linha
//     `    warning: …` do componente fica entre a linha `[status]` dele e a linha seguinte que começa por `[`, e o aviso global fica depois
//     da última linha que começa por `[`. O formatText não é exportado: corre-se o main(['--check']) do F-15b, que o imprime.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ler, conta, C3_ANTIGA, C3_NOVA, C3_RESTO, REGRA_F17 } from './helpers.mjs';
import { maquina, instala, upd, latest, poe, TUDO_VERIFICADO, NOVO_UPSTREAM, join, readFileSync } from '../f-17-r0/helpers.mjs';

const skill = () => ler('skills/update/SKILL.md');

test('C3 «The output can end with warnings» aparece 0 vezes e a frase nova 1 vez', () => {
  const t = skill();
  assert.equal(conta(t, C3_ANTIGA), 0, `a frase antiga aparece ${conta(t, C3_ANTIGA)} vezes`);
  assert.equal(conta(t, C3_NOVA), 1, `a frase nova aparece ${conta(t, C3_NOVA)} vezes`);
});

test('C3 o parágrafo é a frase nova seguida do resto da base, byte a byte', () => {
  const t = skill();
  const par = t.split(/\n\s*\n/).find((p) => p.includes(C3_NOVA) || p.includes(C3_ANTIGA));
  assert.ok(par, 'o parágrafo dos avisos desapareceu');
  assert.equal(par.trim(), C3_NOVA + ' ' + C3_RESTO);
});

test('C3 GUARDA a regra literal do F-17 continua a aparecer 1 vez', () => {
  assert.equal(conta(skill(), REGRA_F17), 1);
});

const AVISO_COMP = '1 plugin id(s) ignored: not a valid plugin id';
const comAvisos = () => {
  const m = instala(maquina({ fontes: latest({ upstream: NOVO_UPSTREAM }) }), TUDO_VERIFICADO);
  const p = join(m.configDir, 'plugins', 'installed_plugins.json');
  const j = JSON.parse(readFileSync(p, 'utf8'));
  j.plugins['mattpocock-skills@a b'] = [{ scope: 'user', version: '1.0.0' }]; // um id que não é um id de plugin: o doctor ignora-o e avisa
  poe(m, join('plugins', 'installed_plugins.json'), JSON.stringify(j, null, 2));
  return m;
};

test('C3 GUARDA formatText: o aviso do componente fica debaixo da linha dele e o aviso global depois da tabela', async () => {
  const r = await upd(comAvisos(), ['--check']);
  const ls = r.out.split('\n');
  const comp = ls.findIndex((l) => l === `    warning: ${AVISO_COMP}`);
  assert.ok(comp >= 0, 'sanidade da fixture: não há aviso de componente na saída:\n' + r.out);
  const linha = ls.slice(0, comp).findLastIndex((l) => l.startsWith('['));
  assert.ok(linha >= 0 && /mattpocock|matt pocock/i.test(ls[linha]), `o aviso do componente não está debaixo da linha [status] do mattpocock-skills: ${ls[linha]}`);
  const seguinte = ls.findIndex((l, i) => i > linha && l.startsWith('['));
  assert.ok(seguinte < 0 || comp < seguinte, 'o aviso do componente não está antes da linha seguinte que começa por [');
  const global = ls.findIndex((l) => /^warning: .*robonuggets\/gauntlet-loop has \d+ new commits/.test(l));
  assert.ok(global >= 0, 'sanidade da fixture: não há aviso global de commits novos na saída:\n' + r.out);
  const ultima = ls.findLastIndex((l) => l.startsWith('['));
  assert.ok(global > ultima, `o aviso global (linha ${global}) não está depois da última linha [ (linha ${ultima})`);
});