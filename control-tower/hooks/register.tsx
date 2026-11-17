import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Flags, Meter } from '../types'
import { bar, colorOf, fiveLevelOf, levelOf, step } from './meter'
import { routeAgent } from './route'

const meter = atom({ plugin: 'control-tower', key: 'meter' } as const, null, { shape: 'meter-2' })
const flags = atom({ plugin: 'control-tower', key: 'flags' } as const, { warned70: false, warned85: false }, { shape: 'flags-1' })
const warnedModel = atom({ plugin: 'control-tower', key: 'warnedModel' } as const, '')

const PROMPT_NOTE =
  'Subagent models are routed automatically by the control-tower mod (advisor→Fable, executor→Sonnet, scribe→Haiku). Do not pass a `model` override to the Agent tool unless the user asks for a specific model.'

let isRunning = false

async function checkOrchestrator($: EngineInterface) {
  try {
    const model = await $.session.model()
    if (/opus/i.test(model)) return
    if ((await read($, warnedModel)) === model) return
    await update($, warnedModel, () => model)
    $.ui.toast(`control-tower: orchestrator is ${model}, expected Opus`)
  } catch {
    // model unknown: nothing to warn about
  }
}

async function refreshUsage($: EngineInterface) {
  try {
    const u = await $.session.usage()
    const percent = u.context.percent
    if (percent === undefined) return
    const five = u.rateLimits.find(r => r.kind === 'five_hour')
    const m: Meter = {
      percent,
      fiveHour: five?.percentUsed ?? null,
    }
    await update($, meter, () => m)
    let toast: string | undefined
    await update($, flags, (f: Flags) => {
      const s = step(percent, f)
      toast = s.toast
      return s.flags
    })
    if (toast) $.ui.toast(toast)
  } catch {
    // usage unavailable: keep the last reading
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await checkOrchestrator($)
    await refreshUsage($)

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await checkOrchestrator($)

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    void refreshUsage($)

    return result
  })

  on('turn.complete', async ($, e, next) => {
    await refreshUsage($)

    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const out = await next(e)

    return {
      ...out,
      sections: [
        ...out.sections,
        { id: 'control-tower:routing', text: PROMPT_NOTE, scope: 'session' as const },
      ],
    }
  })

  on('agent.spawn', async ($, e, next) => {
    const route = routeAgent({
      subagent_type: e.subagentType,
      model: e.model,
      description: e.description,
      prompt: e.prompt,
    })

    return next(route.model !== undefined ? { ...e, model: route.model } : e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const m = await read($, meter)
    if (e.props.hasSurvey || m === null) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const ctx = levelOf(m.percent)
    const five = m.fiveHour === null ? null : fiveLevelOf(m.fiveHour)

    return (
      <Box>
        <Text color={colorOf(ctx)} bold={ctx === 'strong'}>
          context {bar(m.percent)} {Math.round(m.percent)}%
        </Text>
        {m.fiveHour !== null && five !== null && (
          <Text color={colorOf(five)} bold={five === 'strong'}>
            {'   '}5h {bar(m.fiveHour)} {Math.round(m.fiveHour)}%
          </Text>
        )}
        {ctx !== 'ok' && (
          <Text color={colorOf(ctx)}>
            {'  '}context past 70% — consider /compact
          </Text>
        )}
        <Box flexGrow={1} />
        <Button
          key="wrap-up"
          label="Wrap up"
          onPress={async () => {
            if (isRunning) return
            isRunning = true
            try {
              await $.command.run({ command: 'wrap-up' })
            } catch {
              // command unavailable: do nothing
            } finally {
              isRunning = false
            }
          }}
        />
      </Box>
    )
  })
}
