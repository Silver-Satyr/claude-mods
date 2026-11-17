import { expect, test } from 'claude-code/testing'

import { bar, levelOf, step } from './meter'
import { classify, routeAgent } from './route'

test('typed roles override the caller model', () => {
  expect(routeAgent({ subagent_type: 'advisor', model: 'haiku' })).toEqual({ model: 'fable', reason: 'role' })
  expect(routeAgent({ subagent_type: 'executor', model: 'opus' }).model).toBe('sonnet')
  expect(routeAgent({ subagent_type: 'gsd-debugger' }).model).toBe('sonnet')
  expect(routeAgent({ subagent_type: 'scribe' }).model).toBe('haiku')
  expect(routeAgent({ subagent_type: 'gsd-doc-writer' }).model).toBe('haiku')
})

test('fork and other typed agents are untouched', () => {
  expect(routeAgent({ subagent_type: 'fork', model: 'haiku' })).toEqual({ model: undefined, reason: 'untouched' })
  expect(routeAgent({ subagent_type: 'Explore' }).reason).toBe('untouched')
  expect(routeAgent({ subagent_type: 'law-au-tax' }).model).toBeUndefined()
})

test('untyped: explicit model kept, otherwise classified', () => {
  expect(routeAgent({ model: 'opus', description: 'x', prompt: 'y' })).toEqual({ model: 'opus', reason: 'explicit' })
  expect(routeAgent({ subagent_type: 'claude', description: 'Second opinion on schema', prompt: '' }).model).toBe('fable')
  expect(routeAgent({ subagent_type: 'general-purpose', description: 'Update README docs', prompt: '' }).model).toBe('haiku')
  expect(routeAgent({ description: 'Fix login bug', prompt: 'edit the handler' })).toEqual({ model: 'sonnet', reason: 'classified' })
})

test('classifier ignores a stray keyword in a long prompt', () => {
  expect(classify('Implement parser', 'please implement; later someone will review')).toBe('sonnet')
  expect(classify('Architecture tradeoff review', '')).toBe('fable')
  expect(classify('Annotate changelog', '')).toBe('haiku')
})

test('70/85 thresholds toast once and reset below 60', () => {
  expect(levelOf(69)).toBe('ok')
  expect(levelOf(70)).toBe('warn')
  expect(levelOf(85)).toBe('strong')
  let f = { warned70: false, warned85: false }
  let s = step(69, f)
  expect(s.toast).toBeUndefined()
  s = step(70, f); f = s.flags
  expect(s.toast).toContain('70%')
  s = step(75, f); f = s.flags
  expect(s.toast).toBeUndefined()
  s = step(86, f); f = s.flags
  expect(s.toast).toContain('/compact')
  s = step(90, f); f = s.flags
  expect(s.toast).toBeUndefined()
  s = step(65, f); f = s.flags
  expect(f.warned70).toBe(true)
  s = step(40, f); f = s.flags
  expect(f).toEqual({ warned70: false, warned85: false })
  expect(step(70, f).toast).toBeDefined()
  expect(bar(68)).toBe('■■■■■■■□□□')
})

test('agent.spawn rewrites the model; tool.call leaves the Agent input alone', async ($, on) => {
  on('clock.now', () => ({ value: 1000 }))
  on('clock.every', () => ({ value: undefined }))
  const seen: (string | undefined)[] = []
  on('agent.spawn', (_, e) => {
    seen.push(e.model)
    return { model: e.model ?? 'inherit', agentId: 'a1' }
  })
  let toolInput: { model?: string } = {}
  on('tool.call', (_, e) => {
    toolInput = e as { model?: string }
    return { result: {} }
  })

  const base = { prompt: 'p', description: 'Fix bug' }
  await $.agent.spawn({ ...base, subagentType: 'advisor', model: 'haiku' } as never)
  await $.agent.spawn({ ...base, subagentType: 'general-purpose', description: 'Second opinion on design' } as never)
  await $.agent.spawn({ ...base, subagentType: 'general-purpose', model: 'opus' } as never)
  await $.agent.spawn({ ...base, subagentType: 'fork', model: 'haiku' } as never)
  await $.agent.spawn({ ...base, subagentType: 'Explore' } as never)
  expect(seen).toEqual(['fable', 'fable', 'opus', 'haiku', undefined])

  await $.tool.call({ tool: 'Agent', ...base, subagent_type: 'executor', model: 'opus' })
  expect(toolInput.model).toBe('opus')
})

import { fiveLevelOf } from './meter'

test('5h window thresholds: 69 ok, 70 warn, 89 warn, 90 strong', () => {
  expect(fiveLevelOf(69)).toBe('ok')
  expect(fiveLevelOf(70)).toBe('warn')
  expect(fiveLevelOf(89)).toBe('warn')
  expect(fiveLevelOf(90)).toBe('strong')
  expect(levelOf(85)).toBe('strong') // ctx keeps 70/85
})

const BAND = {
  plugin: 'control-tower',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 5,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 4 },
    view: {},
  },
} as const

{
  test('band: bars, no cost, wrap-up button runs /wrap-up directly', async ($, on) => {
    on('clock.now', () => ({ value: 1000 }))
    on('clock.every', () => ({ value: undefined }))
    on('session.model', () => ({ value: 'claude-opus-4' }))
    on('session.usage', () => ({
      value: {
        startedAt: 0,
        context: { window: 1000, tokens: 680, percent: 68 },
        rateLimits: [{ kind: 'five_hour', percentUsed: 44 }],
        cost: { usd: 2.14 },
      },
    }))
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    const sent: string[] = []
    on('command.run', (_, e) => {
      sent.push(e.command)
      return { text: '' }
    })

    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...BAND, surface })
      const all = (await ui.findAll?.({ type: 'Text' })) ?? []
      const text = all.map(t => t.text).join(' ')
      expect(text).toContain('context ■■■■■■■□□□ 68%')
      expect(text).toContain('5h ■■■■□□□□□□ 44%')
      expect(text).not.toContain('$')
      expect(text).not.toContain('2.14')
      await ui.press({ key: 'wrap-up' })
      await ui.unmount()
    }
    expect(sent).toEqual(['wrap-up', 'wrap-up'])
  })
}
