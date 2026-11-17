export const WARN = 70
export const STRONG = 85
export const RESET = 60

export type Level = 'ok' | 'warn' | 'strong'

export const levelOf = (percent: number): Level =>
  percent >= STRONG ? 'strong' : percent >= WARN ? 'warn' : 'ok'

export type Flags = { warned70: boolean; warned85: boolean }

/** Decide which toast (if any) to raise and the flags after it. */
export function step(
  percent: number,
  flags: Flags,
): { flags: Flags; toast?: string } {
  if (percent < RESET) return { flags: { warned70: false, warned85: false } }
  if (percent >= STRONG && !flags.warned85) {
    return {
      flags: { warned70: true, warned85: true },
      toast: `control-tower: context at ${Math.round(percent)}% — /compact now`,
    }
  }
  if (percent >= WARN && !flags.warned70) {
    return {
      flags: { ...flags, warned70: true },
      toast: `control-tower: context past 70% (${Math.round(percent)}%) — consider /compact`,
    }
  }
  return { flags }
}

export function bar(percent: number, width = 10): string {
  const filled = Math.max(0, Math.min(width, Math.round((percent / 100) * width)))
  return '■'.repeat(filled) + '□'.repeat(width - filled)
}

export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
}

export const FIVE_WARN = 70
export const FIVE_STRONG = 90

/** The 5h window's own thresholds: warn at 70, strong at 90. */
export const fiveLevelOf = (percent: number): Level =>
  percent >= FIVE_STRONG ? 'strong' : percent >= FIVE_WARN ? 'warn' : 'ok'

export const colorOf = (level: Level): 'error' | 'warning' | undefined =>
  level === 'strong' ? 'error' : level === 'warn' ? 'warning' : undefined
