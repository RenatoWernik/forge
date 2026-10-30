// Oráculo do critério 2 do F-16 (#57): corpus fechado de blocos hostis. Cada entrada é uma função do comando do tipo (K: o
// testCommand na suíte, o e2eCommand no E2E) e de um ficheiro que EXISTE nesse tipo (f). Nenhum destes blocos é «K seguido de um
// filtro que existe»: cada um tem de dar fail com reason runs. As famílias pedidas no contrato: echo, prefixos, sufixos `; x`, `&& x`,
// aspas, maiúsculas, caminhos inexistentes e `..`; mais as que o crítico juntou (redireções, substituições, sinais Unicode).
// Ficam DE FORA, à espera das PERGUNTAS P2–P5 na #57: `./f`, `f/`, `tests\\a` (barras do Windows), globs, o comando nu entre blocos
// com filtro e o e2eCommand como bloco da suíte (e o inverso).

export const HOSTIS = [
  ['echo', () => 'echo a'],
  ['true', () => 'true'],
  ['vazio', () => ''],
  ['so-o-programa', (K) => K.split(' ')[0]],
  ['comando-colado', (K, f) => `${K}x ${f}`],
  ['comando-truncado', (K, f) => `${K.split(' ').slice(0, -1).join(' ')} ${f}`],
  ['comando-a-meio', (K, f) => `echo ${K} ${f}`],
  ['variavel-antes', (K, f) => `FOO=1 ${K} ${f}`],
  ['sufixo-ponto-e-virgula', (K, f) => `${K} ${f}; echo x`],
  ['sufixo-ponto-e-virgula-colado', (K, f) => `${K} ${f};`],
  ['sufixo-e-e', (K, f) => `${K} ${f} && echo x`],
  ['sufixo-ou-ou', (K, f) => `${K} ${f} || true`],
  ['sufixo-pipe', (K, f) => `${K} ${f} | tee out.txt`],
  ['sufixo-redirecao', (K, f) => `${K} ${f} > out.txt`],
  ['sufixo-fundo', (K, f) => `${K} ${f} & echo x`],
  ['sufixo-nova-linha', (K, f) => `${K} ${f}\necho x`],
  ['sufixo-comentario', (K, f) => `${K} ${f} # x`],
  ['aspas-duplas', (K, f) => `${K} "${f}"`],
  ['aspas-simples', (K, f) => `${K} '${f}'`],
  ['substituicao', (K, f) => `${K} $(echo ${f})`],
  ['crases', (K, f) => `${K} \`echo ${f}\``],
  ['maiusculas-no-comando', (K, f) => `${K.toUpperCase()} ${f}`],
  ['maiusculas-no-filtro', (K, f) => `${K} ${f.toUpperCase()}`],
  ['letra-cirilica', (K, f) => `${K.replace('e', 'е')} ${f}`],
  ['espaco-inquebravel', (K, f) => `${K} ${f}`],
  ['ficheiro-inexistente', (K, f) => `${K} ${f.replace(/[^/]+$/, 'nao-existe.test.mjs')}`],
  ['pasta-inexistente', (K) => `${K} tests/fantasma`],
  ['um-filtro-inexistente-entre-dois', (K, f) => `${K} ${f} tests/fantasma.test.mjs`],
  ['flag-em-vez-de-filtro', (K) => `${K} --version`],
  ['caminho-absoluto', (K) => `${K} /etc/passwd`],
  ['pai-fora', (K) => `${K} ../fora/a.test.mjs`],
  ['pai-a-meio', (K) => `${K} tests/../../fora.test.mjs`],
  ['pai-que-volta-a-uma-pasta-que-existe', (K) => `${K} tests/unit/../integ`],
  ['so-pai', (K) => `${K} ..`],
];

// Os blocos válidos (critério 1): K seguido de um ficheiro ou de uma pasta que existe (FICHEIROS em helpers.mjs)
export const VALIDOS = {
  suite: [
    ['duas-pastas', (K) => [`${K} tests/unit`, `${K} tests/integ`]],
    ['tres-ficheiros', (K) => [`${K} tests/unit/a.test.mjs`, `${K} tests/unit/b.test.mjs`, `${K} tests/integ/c.test.mjs`]],
    ['ficheiro-e-pasta', (K) => [`${K} tests/unit/a.test.mjs`, `${K} tests/integ`]],
    ['espacos-repetidos', (K) => [`${K}   tests/unit`, `${K} tests/integ`]],
  ],
  e2e: [
    ['ficheiro-e-pasta', (K) => [`${K} e2e/login.spec.ts`, `${K} e2e/flows`]],
    ['dois-ficheiros', (K) => [`${K} e2e/login.spec.ts`, `${K} e2e/flows/cart.spec.ts`]],
  ],
};

// O bloco válido que acompanha cada hostil, e o ficheiro que existe em cada tipo
export const PAR = { suite: (K) => `${K} tests/integ`, e2e: (K) => `${K} e2e/flows` };
export const F = { suite: 'tests/unit/a.test.mjs', e2e: 'e2e/login.spec.ts' };
