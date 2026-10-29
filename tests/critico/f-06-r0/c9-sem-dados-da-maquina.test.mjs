// F-06 «reprova sempre» e barra: os briefs e o .checkpoints/README.md não têm dados pessoais, caminhos da máquina nem nada
// específico da Guilda ou do Sistema Completo (portas, caminhos, nomes de tickets), embora a referência sejam os briefs da Guilda.
// Oráculo: corpus finito de padrões proibidos (o do F-05, mais as portas da Guilda, o wrapper `ghp` e os ids de tickets E3-nn,
// G-nn e F-nn), aplicado aos templates novos (templates/.claude/briefs/*.md e templates/.checkpoints/README.md) e aos ficheiros
// gerados nas 4 combinações língua × modo. Exceção declarada: `SC-###` (critério de sucesso do Spec-Kit).
// Não depende do F-05.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { ROOT, COMBOS, ROLES, README, BRIEFS_DIR, generate, briefsByRole } from './helpers.mjs';

const NAMES = [
  /\bGuild(a)?\b/i, /guilda-painel/i, /Sistema Completo/i, /\bSC\b(?!-)/, /Ads_Claude|ads-claude/i, /Atlas de Vendas/i,
  /RenatoWernik|\brenato\b|wernik/i, /keyrus/i, /[A-Za-z]:[\\/]+(Users|Guilda|Ads_Claude|forge-ref|forge-wt|AIData)\b/i,
  /\/(Users|home)\/[A-Za-z]/, /[\w.+-]+@[\w-]+\.(com|pt|br|org|net)\b/i,
  /\b[A-Za-z]:\\/, /\b(4790|4810|5210)\b/, /\bghp(\.ps1)?\b/i, /\b(E3|G|F)-\d{2}[a-z]?\b/, /\bEtapa \d/i, /\bpergaminho|grim[óo]rio\b/i,
];
const scan = (label, text) => NAMES.flatMap((re) => { const m = text.match(re); return m ? [`${label}: ${re} («${m[0]}»)`] : []; });

test('C9: os templates dos briefs e do .checkpoints/README.md existem e não têm dados da máquina nem da Guilda ou do SC', () => {
  const dir = join(ROOT, 'templates', BRIEFS_DIR);
  const briefs = existsSync(dir) ? readdirSync(dir).filter((f) => extname(f) === '.md').map((f) => join(dir, f)) : [];
  const readme = join(ROOT, 'templates', README);
  assert.equal(briefs.length, 4, `templates/${BRIEFS_DIR}/ tem de ter os 4 briefs (tem ${briefs.length})`);
  assert.ok(existsSync(readme), `templates/${README} não existe`);
  assert.deepEqual([...briefs, readme].flatMap((f) => scan(f.slice(ROOT.length), readFileSync(f, 'utf8'))), []);
});

for (const [name, answers] of COMBOS) {
  test(`C9 ${name}: os briefs e o README gerados não têm dados da máquina nem da Guilda ou do SC`, async () => {
    const { dest, raw } = await generate(answers);
    const by = briefsByRole(dest);
    const rels = [...ROLES.map((r) => by[r]), README];
    assert.deepEqual(rels.filter((d) => raw[d] === undefined), [], 'ficheiros em falta');
    assert.deepEqual(rels.flatMap((d) => scan(d, raw[d])), []);
  });
}
