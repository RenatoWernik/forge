// V-01 critério C3 (retoma): scripts/fixtures/executor/orcamento tem 4 unidades de 3 s, paralelo 1, limite_s 8 e orcamento_s 14, por isso
// nenhuma chamada as corre todas. Oráculo: a cadeia `--todas`, `--todas --continuar`, ... acaba com 0 depois de pelo menos um 3; cada chamada
// fica em ≤ 14 s + 10 s; há sempre um só ficheiro de resultados; uma unidade com estado final nunca volta a correr, visto pelos registos das
// fixtures (um só início por ficheiro) e pelo `pid` e `inicio` de cada unidade, que não mudam nas chamadas seguintes.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { exigeExecutor, repo, shaDe, tempPrivado, correr, saida, resultados, inicios, validaResultado, final, limpa } from './helpers.mjs';

after(limpa);

test('C3: --continuar acaba sem voltar a correr nenhuma unidade com estado final (PID e inicio de cada unidade) e nenhuma chamada passa de orcamento_s + 10 s', async () => {
  exigeExecutor();
  const d = repo('orcamento'), sha = shaDe(d), env = tempPrivado();
  const vistos = new Map(), codigos = [];
  for (let i = 0; i < 6; i++) {
    const r = await correr(d, ['--todas', ...(i ? ['--continuar'] : [])], { env, limite_ms: 60000 });
    codigos.push(r.status);
    assert.equal(r.pendurado, false, saida(r));
    assert.ok(r.ms <= (14 + 10) * 1000, `chamada ${i + 1}: ${Math.round(r.ms / 1000)} s (> orcamento_s + 10 s)`);
    assert.ok(r.status === 0 || r.status === 3, `chamada ${i + 1}: ` + saida(r));
    const rs = resultados(d);
    assert.deepEqual(rs.map((x) => x.nome), [`${sha}-limpa-p1.json`], `chamada ${i + 1}: a retoma não ficou no mesmo ficheiro`);
    const res = rs[0].dados;
    assert.deepEqual(validaResultado(res, { raiz: d }), [], `chamada ${i + 1}`);
    assert.equal(res.completo, r.status === 0, `chamada ${i + 1}: completo ${res.completo} com a saída ${r.status}`);
    for (const u of res.unidades.filter(final)) {
      const antes = vistos.get(u.ficheiro);
      if (antes) assert.deepEqual({ pid: u.pid, inicio: u.inicio, estado: u.estado }, antes, `chamada ${i + 1}: ${u.ficheiro} voltou a correr`);
      else vistos.set(u.ficheiro, { pid: u.pid, inicio: u.inicio, estado: u.estado });
    }
    if (r.status === 0) break;
  }
  assert.ok(codigos.includes(3), `nenhuma chamada saiu com 3 (${codigos.join(', ')}): o orçamento não foi aplicado`);
  assert.equal(codigos.at(-1), 0, `a cadeia não acabou: ${codigos.join(', ')}`);
  const fs = ['curta/1.fx.mjs', 'curta/2.fx.mjs', 'curta/3.fx.mjs', 'curta/4.fx.mjs'];
  assert.deepEqual([...vistos.keys()].sort(), fs);
  for (const f of fs) {
    const ev = inicios(d, f);
    assert.equal(ev.length, 1, `${f} correu ${ev.length} vezes`);
    assert.equal(vistos.get(f).estado, 'pass', f);
    assert.equal(vistos.get(f).pid, ev[0].ppid, `${f}: o pid da unidade não é o do filho node --test que a correu`);
  }
});