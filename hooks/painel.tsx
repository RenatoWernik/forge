import type { Register } from 'claude-code'

import { COMANDO, comando, criarRelogio, ecra, evento, PANE } from '../scripts/mod-painel.mjs'

// The forge panel: reads <project>/.checkpoints/painel.json through the shared reader, only in forge projects, plus the agents
// and the quota of Claude Code itself. The hooks only wire events to scripts/mod-painel.mjs; the state is this module's relogio,
// which an event rearms when a respawn or a reload left it without a timer.
const relogio = criarRelogio()

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await evento($, relogio, 'session.start', e)
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    await evento($, relogio, 'agent.spawn', e, r)
    return r
  })

  on('tool.call', async ($, e, next) => {
    await evento($, relogio, 'tool.call', e)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await evento($, relogio, 'turn.complete', e)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await evento($, relogio, 'prompt.submit', e)
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await evento($, relogio, 'session.measure', e)
    return next(e)
  })

  on('command.run', { command: COMANDO }, async $ => comando($, relogio))

  on('ui.close', { id: PANE }, async ($, e, next) => {
    await evento($, relogio, 'ui.close', e)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const linhas = (await ecra($, relogio, e.props.bodyColumns || 60)).split('\n')
    return (
      <Box flexDirection="column">
        {linhas.map(l => (
          <Text wrap="truncate-end">{l || ' '}</Text>
        ))}
      </Box>
    )
  })
}
