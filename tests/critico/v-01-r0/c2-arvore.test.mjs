// V-01 critério C2 (mata só a sua árvore), no corpus scripts/fixtures/executor/arvore: a unidade `pendura` lança um neto
// `node -e "setInterval(()=>{},1e3)"` e passa o limite_s de 3 s; a `vizinha` corre ao mesmo tempo e acaba sozinha ao fim de 8 s.
// Oráculo: uma isca com a mesma imagem (node), lançada por este teste fora do executor, fica viva; o neto, o processo do ficheiro de teste
// e o filho node --test estão mortos 5 s depois do limite; a unidade fica com estado «limite», a vizinha com «pass», e a saída é 1.
// A isca morre pelo PID no after. O lint do código procura as formas de matar por nome.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { EXECUTOR, exigeExecutor, repo, tempPrivado, lanca, saida, umResultado, unidade, lerJson, esperaAte, espera, vivo, registaPid, validaResultado, limpa } from './helpers.mjs';

after(limpa);

test('C2: no limite_s o executor mata só a árvore que lançou: neto, corredor e filho mortos 5 s depois do limite, isca e vizinha vivas, estado «limite» e saída 1', async () => {
  exigeExecutor();
  const d = repo('arvore');
  const isca = spawn(process.execPath, ['-e', 'setInterval(()=>{},1e3)'], { stdio: 'ignore', windowsHide: true });
  registaPid(isca.pid);
  const corrida = lanca(d, ['--todas'], { env: tempPrivado(), limite_ms: 90000 });
  const f = join(d, '.sonda/pids.json');
  const arrancou = await esperaAte(() => existsSync(f), 40000);
  let pids = null;
  if (arrancou) { await espera(300); pids = lerJson(f); for (const k of ['neto', 'corredor', 'pai']) registaPid(pids[k]); }
  if (pids) await espera(Math.max(0, pids.t + (3 + 5) * 1000 - Date.now()));
  const vivosNoPrazo = pids ? ['neto', 'corredor', 'pai'].filter((k) => vivo(pids[k])).map((k) => `${k} ${pids[k]}`) : null;
  const iscaNoPrazo = vivo(isca.pid);
  const r = await corrida.fim;
  assert.ok(arrancou, 'a unidade pendura não arrancou em 40 s\n' + saida(r));
  assert.equal(r.pendurado, false, saida(r));
  assert.deepEqual(vivosNoPrazo, [], 'processos da árvore da unidade ainda vivos 5 s depois do limite');
  assert.equal(iscaNoPrazo, true, 'a isca (mesma imagem, fora do executor) morreu');
  assert.equal(vivo(isca.pid), true, 'a isca morreu antes de o executor sair');
  assert.equal(r.status, 1, saida(r));
  const res = umResultado(d).dados;
  assert.deepEqual(validaResultado(res), []);
  const p = unidade(res, 'pendura/n.fx.mjs'), v = unidade(res, 'vizinha/v.fx.mjs');
  assert.equal(p?.estado, 'limite', `pendura: ${p?.estado}`);
  assert.equal(v?.estado, 'pass', `vizinha: ${v?.estado} (matar a árvore de uma unidade não pode tocar noutra)`);
  assert.equal(vivo(p.pid), false, `o filho ${p.pid} da unidade pendura ainda está vivo`);
  assert.equal(p.pid, pids.pai, 'o pid da unidade não é o do filho node --test que correu o ficheiro');
  if (pids.home) assert.equal(existsSync(dirname(dirname(pids.home))), false, 'a raiz tmp ficou para trás depois de matar a árvore');
});

test('C2: o código de scripts/executor.mjs não mata por nome (taskkill /IM, «/IM », pkill, killall, Stop-Process -Name): 0 linhas', () => {
  exigeExecutor();
  const re = /taskkill \/IM|\/IM |pkill|killall|Stop-Process -Name/;
  const linhas = readFileSync(EXECUTOR, 'utf8').split(/\r?\n/).map((l, i) => [i + 1, l]).filter(([, l]) => re.test(l)).map(([i, l]) => `${i}: ${l.trim()}`);
  assert.deepEqual(linhas, []);
});