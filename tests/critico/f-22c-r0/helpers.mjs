// Ronda −1 do F-22c (#79): utilitários partilhados pelos ataques à skill /forge:learn, ao manual (FRAMEWORK.md e CLAUDE.md) e ao /forge:sync.
// Só biblioteca padrão. Reutiliza o sandbox e o projeto gerado do f-22a-r0 (HOME, USERPROFILE, CLAUDE_CONFIG_DIR, LOCALAPPDATA, APPDATA e XDG_*
// temporários; git sem config de sistema nem global). Sem rede, sem ai-memory e sem sessões claude.
//
// LEITURA DO CONTRATO (corpo da #79 com as «Atualizações» de 2026-11-01; sem comentários à data):
// - os literais entre crases do corpo são procurados tal como estão (`learn.mjs gotcha`, `gotchas/<class>.md`, `APPROVED: yes,` ...);
// - as secções do FRAMEWORK são as do template: «## N. » até ao título seguinte do mesmo nível ou acima, fora das cercas ```; os passos do §5 são
//   «### Step N.» dentro do «## 5. »;
// - os passos da skill são os títulos «## N. <título>» (a forma de todas as skills numeradas do pacote: new-project, update, sync); ver a PERGUNTA 1.
//
// Regras 8 e 9 dos briefs: base() e soNoTicket() são os de tests/critico/_comum/ (F-26). Este ticket nasce em cima do F-22b (#76), que ainda não
// está na main: baseDoTicket() é o base() salvo quando a HEAD contém a branch do F-22b e o base() não, e então é o ponto onde este ticket começou
// (o merge-base com essa branch). Depois do merge do F-22b e do rebase, volta a ser o base().
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { base } from '../_comum/base.mjs';
import { ROOT, projeto, apaga, tmp, escreve, entrada, ficheiro, ambiente, check, linha } from '../f-22a-r0/helpers.mjs';

export { ROOT, projeto, apaga, tmp, escreve, entrada, ficheiro, ambiente, check, linha, base };
export { soNoTicket } from '../_comum/ambito.mjs';

// ---------- Literais do contrato ----------
export const SKILL = 'skills/learn/SKILL.md';
export const IDS = ['user', 'critic-rejected', 'escape', 'noise', 'hook-blocked', 'incident'];
export const SECAO_SYNC = 'learnings (scope package):';

// ---------- Texto ----------
export const LF = (s) => s.replace(/\r\n/g, '\n');
export const texto = (rel) => LF(readFileSync(join(ROOT, rel), 'utf8'));
export const conta = (s, lit) => s.split(lit).length - 1;
// a secção que começa na linha com o título dado e acaba no título seguinte do mesmo nível ou acima, fora das cercas ```; '' sem o título
export const seccao = (t, titulo) => {
  const nivel = titulo.match(/^#+/)[0].length;
  let cerca = false, dentro = false;
  const out = [];
  for (const l of LF(t).split('\n')) {
    if (/^\s*```/.test(l)) cerca = !cerca;
    else if (!cerca) {
      const h = /^(#+) /.exec(l);
      if (h && h[1].length <= nivel) { if (dentro) break; dentro = l.startsWith(titulo); }
    }
    if (dentro) out.push(l);
  }
  return out.join('\n');
};
export const fw = () => texto('templates/FRAMEWORK.md');
export const passo5 = (n) => seccao(seccao(fw(), '## 5. '), `### Step ${n}.`);
// as linhas de uma tabela markdown: as células sem as barras das pontas
export const linhasDeTabela = (s) => s.split('\n').filter((l) => /^\s*\|/.test(l) && !/^[\s|:-]+$/.test(l)).map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
// um identificador como palavra (o hífen conta como parte da palavra: «user» não casa em «user-facing»)
export const palavra = (id) => new RegExp(`(?<![\\w-])${id.replace(/-/g, '\\-')}(?![\\w-])`);

// ---------- Git, para as guardas de âmbito ----------
const DEP = 'origin/f-22b-learn-mjs'; // a branch do F-22b (#76)
const gitR = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });
export const gitRoot = (...a) => { const r = gitR(...a); assert.equal(r.status, 0, 'git ' + a.join(' ') + ': ' + r.stderr); return r.stdout; };
export const baseDoTicket = () => {
  const b = base();
  if (!b) return null;
  const d = gitR('merge-base', 'HEAD', DEP);
  const dep = d.status === 0 ? d.stdout.trim() : '';
  return dep && dep !== b && gitR('merge-base', '--is-ancestor', b, dep).status === 0 ? dep : b;
};

// ---------- Sync ----------
// Corre `node scripts/sync.mjs --project <proj> --package <ROOT>` com o ambiente do sandbox; out = stdout e stderr, por esta ordem
export const sync = (proj) => {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/sync.mjs'), '--project', proj, '--package', ROOT], { cwd: proj, encoding: 'utf8', env: ambiente(), timeout: 240000 });
  const stdout = r.stdout || '', stderr = r.stderr || '';
  return { status: r.status, stdout, stderr, out: LF(stdout + '\n' + stderr) };
};
// A secção do sync: o cabeçalho e as linhas seguintes que são uma entrada («E-NNN ...») ou «none»; o resto do próprio cabeçalho conta como linha.
// null sem cabeçalho. Procura-se no stdout e no stderr em separado (cada um é um fluxo contínuo).
export const secaoSync = (r) => {
  for (const fluxo of [r.stdout, r.stderr]) {
    const ls = LF(fluxo).split('\n');
    const i = ls.findIndex((l) => l.trim().startsWith(SECAO_SYNC));
    if (i < 0) continue;
    const itens = [];
    const resto = ls[i].trim().slice(SECAO_SYNC.length).trim();
    if (resto) itens.push(resto);
    for (let j = i + 1; j < ls.length; j++) {
      const l = ls[j].trim();
      if (/^E-\d{3,}\s/.test(l) || l === 'none') itens.push(l); else break;
    }
    return itens;
  }
  return null;
};
// sha256 de cada ficheiro de uma pasta (recursivo; sem .git nem node_modules), por caminho relativo
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
export const fotografia = (dir, pastas = ['.']) => {
  const m = {};
  const anda = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === 'node_modules') continue;
      const p = join(d, e.name);
      if (e.isDirectory()) anda(p); else if (statSync(p).isFile()) m[relative(dir, p).replaceAll('\\', '/')] = sha(p);
    }
  };
  for (const p of pastas) if (existsSync(join(dir, p))) anda(join(dir, p));
  return m;
};