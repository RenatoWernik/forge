// The panel mod's state contract (F-11): the model the pane draws and the orchestrator's pulse.
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
export type Orq = { acoes: number[]; ultimaMensagem?: number }

declare module 'claude-code' {
  interface PluginState {
    forge: { painel: Shaped<Modelo>; orq: Shaped<Orq> }
  }
}
