// caso limpo: o inicializador de BASE acaba na quebra de linha (sem ponto e vírgula); o literal da linha seguinte é uma fixture
const BASE = process.env.FORGE_BASE ?? null
const FIXTURE = { ref: 'abc1234def' }
export { BASE, FIXTURE }