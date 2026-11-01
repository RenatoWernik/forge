// caso mau L1: o inicializador de BASE ocupa várias linhas e não tem ponto e vírgula
export const BASE_REV = process.env.FORGE_BASE
  ?? process.env.OTHER_BASE
  ?? '645120f'
export const OUTRA = 1