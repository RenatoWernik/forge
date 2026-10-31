// The panel mod's types. Since F-25 the mod keeps its state in the hooks module (scripts/mod-painel.mjs, criarRelogio) and asks
// for a redraw with $.ui.invalidate, so it declares no $.state values. Modelo is what texto() draws from painel.json.
export type Agente = {
  nome: string
  papel: string
  ticket: string
  modelo: string
  checkpoint: string
  vida: string
  minutos: number | null
  porta?: number
  portaViva?: boolean
}
export type Modelo = {
  erro?: string
  projeto?: string
  modo?: string
  objetivo?: string
  contagens: [string, number][] | null
  percentagem?: number
  agentes: Agente[]
}
