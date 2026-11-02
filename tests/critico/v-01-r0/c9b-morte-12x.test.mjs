// C9-b (#125, contrato reescrito): a ponta real, sem carga artificial. Matar a árvore do motor (taskkill /PID <pid> /T /F) a meio da fila, 12 vezes
// seguidas, 12/12: a cadeia --continuar acaba em 0 e nenhuma unidade fica com um fail/limite de arrasto como estado final.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { correr, esperaAte, inicios, limpa, mataArvore, saida, tempPrivado, vivo } from './helpers.mjs';
import { feitas, montar, motores } from './motor-comum.mjs';

after(limpa);

const REPETICOES = 12;

test(`C9-b: matar a árvore do motor a meio da fila ${REPETICOES} vezes seguidas: a cadeia acaba em 0, sem arrasto final e sem rearranque das pass`, { timeout: 480000 }, async () => {
  for (let rep = 1; rep <= REPETICOES; rep++) {
    const r = `repetição ${rep}/${REPETICOES}`;
    const d = montar(`c9b-${rep}`, { paralelo: 2, orcamento_s: 4, suites: [{ nome: 'q', limite_s: 60 }] }, { 'q-1': 2, 'q-2': 2, 'q-3': 8, 'q-4': 8 });
    const env = tempPrivado();
    const r1 = await correr(d, ['--todas'], { env, limite_ms: 60000 });
    const [motor] = motores(d);
    assert.equal(r1.status, 3, `${r}: ${saida(r1)}`);
    assert.ok(motor && vivo(motor.pid), `${r}: o motor tem de estar vivo`);
    assert.ok(await esperaAte(() => inicios(d).length === 4, 30000), `${r}: as unidades 3 e 4 não arrancaram`);
    const antes = Object.fromEntries(feitas(d).map((u) => [u.ficheiro, u]));
    mataArvore(motor.pid); // taskkill /PID /T /F: as unidades morrem primeiro e escrevem «not ok»
    assert.ok(await esperaAte(() => !vivo(motor.pid), 10000), `${r}: o motor não morreu`);
    const codigos = [];
    for (let i = 0; i < 4; i++) { codigos.push((await correr(d, ['--todas', '--continuar'], { env, limite_ms: 60000 })).status); motores(d); if (codigos.at(-1) === 0) break; }
    assert.equal(codigos.at(-1), 0, `${r}: a cadeia não acabou em 0: ${codigos.join(', ')}`);
    const depois = Object.fromEntries(feitas(d).map((u) => [u.ficheiro, u.estado]));
    assert.deepEqual(Object.values(depois), ['pass', 'pass', 'pass', 'pass'], `${r}: ${JSON.stringify(depois)}`);
    for (const [f, u] of Object.entries(antes)) if (u.estado === 'pass') assert.equal(inicios(d, f).length, 1, `${r}: ${f} (pass antes da morte) voltou a correr`);
  }
});