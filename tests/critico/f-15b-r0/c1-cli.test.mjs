// F-15b critério 1, pelo processo real: `node scripts/update.mjs --check --versions scripts/fixtures/versions-2026-10-29.json` num
// ambiente tmp (HOME, USERPROFILE e CLAUDE_CONFIG_DIR em mkdtemp), com o espião pré-carregado (espiao.mjs): zero rede, zero escritas
// no disco e nenhum processo filho além das sondas de versão do registo. Mais a higiene da fixture gravada (só os campos usados, o
// URL de cada fonte, nada pessoal nem tokens) e o caso do URL ausente da fixture → unknown, também pelo processo real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { ROOT, UPDATE, FIXTURE, ESPIAO, tmp, sandboxEnv, sonda, personalHits, readJson, URL_PONYTAIL, ALVOS } from './helpers.mjs';

const corre = (args, { cfg } = {}) => {
  const d = tmp('critico-f15b-cli-');
  const home = join(d, 'home');
  const config = cfg ?? join(d, 'cfg dir');
  mkdirSync(home, { recursive: true });
  mkdirSync(config, { recursive: true });
  const log = join(d, 'espiao.log');
  writeFileSync(log, '');
  const r = spawnSync(process.execPath, [UPDATE, ...args], {
    cwd: d, encoding: 'utf8', timeout: 120000,
    env: sandboxEnv({ HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: config, AI_MEMORY_BIN: undefined, NODE_OPTIONS: `--import=${ESPIAO}`, CRITICO_LOG: log, GITHUB_TOKEN: undefined, GH_TOKEN: undefined }),
  });
  const eventos = readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), stdout: r.stdout || '', eventos, d, config };
};
const verifica = (r) => {
  assert.deepEqual(r.eventos.filter((e) => e.t === 'rede'), [], 'reprova sempre: o processo tentou a rede');
  assert.deepEqual(r.eventos.filter((e) => e.t === 'escrita'), [], 'o --check escreveu no disco');
  assert.deepEqual(r.eventos.filter((e) => e.t === 'proc' && !sonda(e.cmd, e.args, { shell: e.shell })), [], 'o --check lançou um processo que não é uma sonda de versão');
};

test('C1 processo real: --check --versions <fixture> numa máquina vazia, sem rede, sem escritas, só sondas; código 1 e o forge na lista', () => {
  assert.ok(existsSync(UPDATE), 'falta scripts/update.mjs');
  assert.ok(existsSync(FIXTURE), 'falta scripts/fixtures/versions-2026-10-29.json');
  const r = corre(['--check', '--versions', FIXTURE]);
  verifica(r);
  assert.equal(r.status, 1, 'máquina vazia: tudo missing, código 1\n' + r.out.slice(-1500));
  assert.match(r.out, /forge/i, 'o --check não inclui o alvo forge');
});

test('C1 processo real: um URL ausente da fixture dá unknown nessa componente (o ponytail instalado em <c>)', () => {
  assert.ok(existsSync(FIXTURE), 'falta a fixture');
  const d = tmp('critico-f15b-fx-');
  const fx = readJson(FIXTURE);
  const sem = semUrl(fx, URL_PONYTAIL);
  assert.notDeepEqual(sem, fx, 'o URL da fonte do ponytail não está na fixture: ' + URL_PONYTAIL);
  const copia = join(d, 'versions sem ponytail.json');
  writeFileSync(copia, JSON.stringify(sem, null, 2));
  const cfg = join(d, 'cfg');
  mkdirSync(join(cfg, 'plugins'), { recursive: true });
  writeFileSync(join(cfg, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'ponytail@ponytail': [{ scope: 'user', version: '5.3.3' }] } }));
  const r = corre(['--check', '--json', '--versions', copia], { cfg });
  verifica(r);
  const rep = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'), r.stdout.lastIndexOf('}') + 1));
  const by = Object.fromEntries(rep.components.map((c) => [c.id, c]));
  assert.equal(by.ponytail?.status, 'unknown', 'sem o URL na fixture, o ponytail instalado tem de ficar unknown');
  assert.deepEqual(ALVOS.filter((id) => !by[id]), [], 'faltam componentes no --check --json');
});

test('C1 fixture: JSON, sem caminhos da máquina, dados pessoais nem tokens', () => {
  assert.ok(existsSync(FIXTURE), 'falta a fixture');
  const txt = readFileSync(FIXTURE, 'utf8');
  JSON.parse(txt.replace(/^﻿/, ''));
  assert.deepEqual(personalHits(txt), []);
  assert.doesNotMatch(txt, /"(token|authorization|cookie|set-cookie|x-github-request-id)"/i, 'a fixture guarda cabeçalhos ou credenciais');
});

test('C1 fixture: tem o URL de cada fonte latest do registo (o gauntlet-loop no fork), uma do alvo forge e uma do original robonuggets, e só os campos usados (sem respostas inteiras da API)', () => {
  const txt = readFileSync(FIXTURE, 'utf8');
  const fontes = [
    'https://api.github.com/repos/astral-sh/uv/releases/latest',
    'https://api.github.com/repos/akitaonrails/ai-memory/releases/latest',
    'https://api.github.com/repos/DietrichGebert/ponytail/releases/latest',
    'https://api.github.com/repos/mattpocock/skills/releases/latest',
    'https://api.github.com/repos/RenatoWernik/gauntlet-loop/commits/HEAD',
    'https://raw.githubusercontent.com/SpillwaveSolutions/sdd-skill/HEAD/skill.md',
    'https://pypi.org/pypi/specify-cli/json',
    'https://pypi.org/pypi/graphifyy/json',
  ];
  assert.deepEqual(fontes.filter((u) => !txt.includes(u)), [], 'fontes do registo sem entrada na fixture');
  assert.match(txt, /github(usercontent)?\.com\/(repos\/)?RenatoWernik\/forge\b/i, 'a fixture não tem a fonte do alvo forge');
  assert.match(txt, /github(usercontent)?\.com\/(repos\/)?robonuggets\/gauntlet-loop\b/i, 'a fixture não tem a fonte do original robonuggets (aviso de commits novos, emenda do fork)');
  // campos que o doctor nunca usa: uma resposta inteira da API do GitHub ou do PyPI foi gravada
  assert.doesNotMatch(txt, /"(node_id|assets_url|upload_url|zipball_url|tarball_url|uploader|vulnerabilities|requires_dist|project_urls)"\s*:/, 'a fixture tem campos que nenhuma sonda usa');
});

// Tira da fixture a entrada que responde a `url`, seja qual for a forma: uma chave igual ao URL, ou o objeto mais interno que tem um
// texto igual ao URL (e esse objeto sai do pai, seja um array ou um objeto).
const DROP = Symbol('drop');
function semUrl(v, url) {
  const rec = (x) => {
    if (Array.isArray(x)) return x.map(rec).filter((y) => y !== DROP);
    if (x && typeof x === 'object') {
      if (Object.values(x).some((y) => typeof y === 'string' && y === url)) return DROP;
      return Object.fromEntries(Object.entries(x).filter(([k]) => k !== url).map(([k, y]) => [k, rec(y)]).filter(([, y]) => y !== DROP));
    }
    return x;
  };
  const r = rec(v);
  assert.notEqual(r, DROP, 'a fixture inteira é a entrada do URL');
  return r;
}
