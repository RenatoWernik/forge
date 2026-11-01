// F-27 (#111): o limite do corpus cresce com o corpus, para o custo por mutação não piorar sem obrigar a cortar mutações.
// Função pura, sem efeitos (o helpers.mjs cria pastas temporárias no import), para o f-27-r0 a poder testar.
export const LIMITE_BASE_MS = 60000;
export const limiteMs = (nAgora, nBase) => Math.max(LIMITE_BASE_MS, (LIMITE_BASE_MS * nAgora) / nBase); // multiplica antes de dividir: 41/40 em vírgula flutuante dá 61499,99…
