// Ronda −1 do V-05 (#129): o gh falso. É pré-carregado por NODE_OPTIONS=--import em todos os node que um cenário lança, mas só age quando o
// executável é a cópia do node chamada gh(.exe), isto é, o GH_BIN: regista o argv em GH_FALSO_LOG (um JSON por linha) e sai com 0, sem correr
// nada. O node trata o 1.º argumento como o nome do script e resolve-o para um caminho absoluto, por isso o registo guarda só o nome dele.
// O ambiente nunca se regista (é onde está o token).
import { appendFileSync } from 'node:fs';
import { basename } from 'node:path';

if (/^gh(\.exe)?$/i.test(basename(process.execPath))) {
  const [primeiro, ...resto] = process.argv.slice(1);
  appendFileSync(process.env.GH_FALSO_LOG, JSON.stringify({ argv: [...(primeiro === undefined ? [] : [basename(primeiro)]), ...resto] }) + '\n');
  process.exit(0);
}