// Sonda das fixtures do executor (V-01, #125). Cada caso é copiado para um repo git temporário com este ficheiro na raiz e o
// `gitignore` como .gitignore; os testes do caso registam o que viram em <repo>/.sonda/, que fica fora do hash da árvore.
// Os ataques em tests/critico/v-01-r0/ leem esses registos. Só biblioteca padrão.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = dirname(fileURLToPath(import.meta.url));
const SONDA = join(RAIZ, '.sonda');
mkdirSync(SONDA, { recursive: true });

// o caminho do ficheiro de teste relativo à raiz do repo, com barras normais (o mesmo que o campo `ficheiro` das unidades)
export const rel = (url) => relative(RAIZ, fileURLToPath(url)).replaceAll('\\', '/');
// uma linha JSON por evento: {f, evento, t, pid, ppid, ...extra}
export const marca = (url, evento, extra = {}) =>
  appendFileSync(join(SONDA, 'eventos.jsonl'), JSON.stringify({ f: rel(url), evento, t: Date.now(), pid: process.pid, ppid: process.ppid, ...extra }) + '\n');
export const grava = (nome, dados) => writeFileSync(join(SONDA, nome), JSON.stringify(dados));
export const dorme = (s) => new Promise((r) => setTimeout(r, s * 1000));

// o env que o executor deu à unidade (a suíte sonda imprime-o e grava-o em .sonda/env-<ficheiro>.json)
const CHAVES = ['HOME', 'USERPROFILE', 'CLAUDE_CONFIG_DIR', 'TMP', 'TEMP', 'DISABLE_AUTOUPDATER'];
export const gravaEnv = (url) => {
  const e = Object.fromEntries(CHAVES.map((k) => [k, process.env[k] ?? null]));
  console.log('SONDA ' + JSON.stringify(e));
  grava(`env-${rel(url).replaceAll('/', '_')}.json`, e);
};