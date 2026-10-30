// F-14 critério 4 e emenda 6503240709: o ensaio de ponta a ponta, na parte que corre sem rede, sem a config real e sem sessão `claude`
// (a entrevista real fica para a captura da Ronda 0). Para um projeto EN e um PT em cada modo:
//   1. o scaffold gera o projeto (PT com o substituto da tradução do corpus) e o check.cjs dá «All ok.»;
//   2. o `update.mjs --check` com a fixture de versões, na raiz do projeto, sem rede e sem PATH, só lê: sai 0 ou 1, diz que nada correu
//      nem foi escrito e não muda nenhum ficheiro do projeto;
//   3. o painel lê o painel.json: o leitor do projeto (.claude/painel-leitor.mjs) lê o .checkpoints/painel.json gerado sem erro, com o
//      projeto e o modo das respostas, e a página .claude/dashboard/panel.html tem o leitor embutido e lê painel/estado;
//   4. os hooks: o .claude/settings.json tem exatamente os hooks a que o utilizador disse sim (sem nenhum sim, não há settings.json).
// Guarda do ensaio (pode passar na base): o que é novo no F-14 está nos outros ataques.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, FIXTURE, SEM_REDE, tmp, gerar, corpusAnswers, traduzSePt, check, allOk, falhas, sandboxEnv, walk, readJson, readFileSync, existsSync } from './helpers.mjs';

const H = (k, b, i) => ({ killByName: k, backgroundTests: b, idleWatch: i });
const CASOS = [
  ['EN rigorous', 'en-plain-published', 'rigorous', H(true, true, true)],
  ['EN accelerated', 'en-noplain-pending', 'accelerated', H(false, false, false)],
  ['PT rigorous', 'pt-plain-published', 'rigorous', H(true, false, true)],
  ['PT accelerated', 'pt-noplain-pending', 'accelerated', H(false, true, false)],
];
const MODO = { rigorous: 'rigoroso', accelerated: 'acelerado' };
const foto = (dir) => Object.fromEntries(walk(dir).map((f) => [relative(dir, f), createHash('sha256').update(readFileSync(f)).digest('hex')]));

for (const [nome, set, mode, hooks] of CASOS) {
  test(`ensaio ${nome}: gerar, check «All ok.», update --check sem rede, painel lê o painel.json, hooks como respondidos`, async () => {
    const answers = { ...corpusAnswers(set), mode, hooks };
    const proj = await gerar(answers);
    traduzSePt(proj);

    const c = check(proj);
    assert.ok(allOk(c), '1. check.cjs\n' + falhas(c.out));

    const log = join(tmp(), 'rede.log'), antes = foto(proj);
    const u = spawnSync(process.execPath, ['--import', pathToFileURL(SEM_REDE).href, join(ROOT, 'scripts/update.mjs'), '--check', '--versions', FIXTURE], { cwd: proj, encoding: 'utf8', env: sandboxEnv({ PATH: '', Path: '', CRITICO_REDE_LOG: log }), timeout: 120000 });
    const uo = (u.stdout ?? '') + (u.stderr ?? '');
    assert.ok([0, 1].includes(u.status) && /Nothing was run and nothing was written/.test(uo), `2. update --check: código ${u.status}\n${uo.slice(-1200)}`);
    assert.equal(existsSync(log) ? readFileSync(log, 'utf8') : '', '', '2. tentativas de rede');
    assert.deepEqual(foto(proj), antes, '2. o update --check mudou ficheiros do projeto');

    const { ler } = await import(pathToFileURL(join(proj, '.claude/painel-leitor.mjs')).href);
    const p = ler(readFileSync(join(proj, '.checkpoints/painel.json'), 'utf8'), {}, Date.now());
    assert.ok(!p.erro && p.projeto === answers.projectName && p.modo === MODO[mode], '3. o leitor do projeto: ' + JSON.stringify(p));
    const page = readFileSync(join(proj, '.claude/dashboard/panel.html'), 'utf8');
    assert.ok(!page.includes('{{PAINEL_LEITOR}}') && /function ler\s*\(/.test(page) && page.includes('painel/estado'), '3. a página não tem o leitor embutido ou não lê painel/estado');

    const { SCRIPTS } = await import(pathToFileURL(join(ROOT, 'scripts/hooks.mjs')).href);
    const sim = [['killByName', SCRIPTS.matar], ['backgroundTests', SCRIPTS.fundo], ['idleWatch', SCRIPTS.vigia]];
    const f = join(proj, '.claude/settings.json');
    if (!Object.values(hooks).some(Boolean)) { assert.ok(!existsSync(f), '4. sem nenhum sim, não pode haver settings.json'); return; }
    const s = JSON.stringify(readJson(f)).replace(/\\\\/g, '/');
    for (const [k, rel] of sim) assert.equal(s.includes(rel.split('/').pop()), hooks[k], `4. hook ${k}: ${hooks[k] ? 'em falta' : 'instalado sem o sim'}`);
  });
}
