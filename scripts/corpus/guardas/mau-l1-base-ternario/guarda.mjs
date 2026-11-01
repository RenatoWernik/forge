// caso mau L1: o sha no ramo falso de um ternário, sem ponto e vírgula
const base = process.env.CI === '1'
  ? process.env.GITHUB_BASE_REF
  : 'abc1234def'
export default base;