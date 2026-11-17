import type { Reason } from '../types'

export type RouteInput = {
  subagent_type?: string
  model?: string
  description?: string
  prompt?: string
}

export type Route = { model: string | undefined; reason: Reason }

export const ROLES: Record<string, string> = {
  advisor: 'fable',
  executor: 'sonnet',
  'gsd-executor': 'sonnet',
  'gsd-code-fixer': 'sonnet',
  'gsd-debugger': 'sonnet',
  scribe: 'haiku',
  'gsd-doc-writer': 'haiku',
}

const FABLE = [
  /second[- ]opinion/g,
  /\breview/g,
  /architect/g,
  /\badvi[cs]e/g,
  /\badvisor/g,
  /trade-?offs?/g,
  /\bdecide/g,
  /\bdecision/g,
]
const HAIKU = [
  /\bdocs?\b/g,
  /readme/g,
  /claude\.md/g,
  /changelog/g,
  /\bdocument/g,
  /\bannotate/g,
]

const count = (patterns: RegExp[], text: string): number =>
  patterns.reduce((n, p) => n + (text.match(p)?.length ?? 0), 0)

/**
 * Keyword scorer. The description counts double (it states the intent); the
 * prompt only counts its first 600 chars. A side needs a score of 2 to win, so
 * one stray "review" inside a long implementation prompt stays on sonnet.
 */
export function classify(description: string, prompt: string): 'fable' | 'haiku' | 'sonnet' {
  const d = description.toLowerCase()
  const p = prompt.toLowerCase().slice(0, 600)
  const fable = count(FABLE, d) * 2 + count(FABLE, p)
  const haiku = count(HAIKU, d) * 2 + count(HAIKU, p)
  if (fable >= 2 && fable >= haiku) return 'fable'
  if (haiku >= 2 && haiku > fable) return 'haiku'
  return 'sonnet'
}

export function routeAgent(input: RouteInput): Route {
  const type = input.subagent_type ?? ''
  if (type === 'fork') return { model: undefined, reason: 'untouched' }
  const role = ROLES[type]
  if (role !== undefined) return { model: role, reason: 'role' }
  const isUntyped = type === '' || type === 'general-purpose' || type === 'claude'
  if (!isUntyped) return { model: undefined, reason: 'untouched' }
  if (input.model) return { model: input.model, reason: 'explicit' }
  return {
    model: classify(input.description ?? '', input.prompt ?? ''),
    reason: 'classified',
  }
}
