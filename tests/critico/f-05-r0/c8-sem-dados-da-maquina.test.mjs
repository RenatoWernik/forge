// F-05 «reprova sempre»: nenhum dado pessoal nem caminho da máquina nos ficheiros do pacote, e nada da Guilda nem do Sistema
// Completo nos templates (o processo v3 vem de lá, mas os documentos gerados servem qualquer projeto).
// Oráculo: corpus finito de padrões proibidos, aplicado a todos os ficheiros de texto de templates/ e aos 4 documentos gerados nas
// 4 combinações língua × modo. Exceções declaradas: `SC-###` (critério de sucesso do Spec-Kit) e os caminhos falsos da simulação do
// check.cjs (`C:\\p`, `C:\\elsewhere`), que o padrão genérico de unidade só procura nos .md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { ROOT, COMBOS, DOCS, generate } from './helpers.mjs';

const NAMES = [
  /\bGuild(a)?\b/i, /guilda-painel/i, /Sistema Completo/i, /\bSC\b(?!-)/, /Ads_Claude|ads-claude/i, /Atlas de Vendas/i,
  /RenatoWernik|\brenato\b|wernik/i, /keyrus/i, /[A-Za-z]:[\\/]+(Users|Guilda|Ads_Claude|forge-ref|forge-wt|AIData)\b/i,
  /\/(Users|home)\/[A-Za-z]/, /[\w.+-]+@[\w-]+\.(com|pt|br|org|net)\b/i,
];
const MD_ONLY = [/\b[A-Za-z]:\\/];
const TEXT = new Set(['.md', '.cjs', '.mjs', '.js', '.json', '.html', '.toml', '.txt', '']);
const walk = (p) => (statSync(p).isFile() ? [p] : readdirSync(p).flatMap((x) => walk(join(p, x))));
const scan = (label, text, md) => [...NAMES, ...(md ? MD_ONLY : [])].flatMap((re) => {
  const m = text.match(re);
  return m ? [`${label}: ${re} («${m[0]}»)`] : [];
});

test('C8: nenhum ficheiro de templates/ tem nomes da Guilda ou do SC, dados pessoais ou caminhos da máquina', () => {
  const files = walk(join(ROOT, 'templates')).filter((f) => TEXT.has(extname(f)) || /^\.[\w-]+$/.test(f.split(/[\\/]/).pop()));
  assert.ok(files.some((f) => f.endsWith('AGENTS.md')), 'templates/AGENTS.md não existe');
  assert.deepEqual(files.flatMap((f) => scan(relative(ROOT, f), readFileSync(f, 'utf8'), extname(f) === '.md')), []);
});

for (const [name, answers] of COMBOS) {
  test(`C8 ${name}: os 4 documentos gerados não têm nomes da Guilda ou do SC, dados pessoais ou caminhos da máquina`, async () => {
    const { raw } = await generate(answers);
    assert.deepEqual(DOCS.filter((d) => raw[d] === undefined), [], 'documentos em falta');
    assert.deepEqual(DOCS.flatMap((d) => scan(d, raw[d], true)), []);
  });
}
