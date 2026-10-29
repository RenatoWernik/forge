import { atom, read, update } from 'claude-code'
import type { Register, Timer } from 'claude-code'

import { abrir, COMANDO, dados, iniciar, linhaPulso, PANE, texto } from '../scripts/mod-painel.mjs'
import type { Modelo, Orq } from '../types'

// The forge panel: reads <project>/.checkpoints/painel.json through the shared reader, only in forge projects
const painel = atom({ plugin: 'forge', key: 'painel' } as const, { contagens: null, agentes: [] } as Modelo, { shape: 'painel-1' })
const orq = atom({ plugin: 'forge', key: 'orq' } as const, { acoes: [] } as Orq, { shape: 'orq-1' })
const MEIA_HORA = 30 * 60000
let timer: Timer | undefined

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await iniciar($)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (!e.isMeta) {
      const agora = await $.clock.now()
      await update($, orq, o => ({ ...o, ultimaMensagem: agora }))
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId === undefined) {
      // only the orchestrator's own actions, not its subagents'
      const agora = await $.clock.now()
      await update($, orq, o => ({ ...o, acoes: [...o.acoes.filter(t => agora - t < MEIA_HORA), agora].slice(-400) }))
    }
    return next(e)
  })

  on('command.run', { command: COMANDO }, async $ => {
    const refrescar = async () => {
      const modelo = (await dados($, await $.clock.now())) as Modelo
      await update($, painel, () => modelo)
    }
    return abrir($, async () => {
      await refrescar()
      timer ??= $.clock.every(5000, () => void refrescar())
    })
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    timer?.cancel()
    timer = undefined
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const m = await read($, painel)
    const o = await read($, orq)
    const pulso = linhaPulso(o.acoes, o.ultimaMensagem, await $.clock.now())
    const linhas = texto({ ...m, pulso }, e.props.bodyColumns || 60).split('\n')
    return (
      <Box flexDirection="column">
        {linhas.map(l => (
          <Text wrap="truncate-end">{l || ' '}</Text>
        ))}
      </Box>
    )
  })
}
