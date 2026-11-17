export type Model = 'fable' | 'opus' | 'sonnet' | 'haiku'
export type Reason = 'role' | 'classified' | 'explicit' | 'untouched'

export type Meter = {
  percent: number
  fiveHour: number | null
}

export type Flags = { warned70: boolean; warned85: boolean }

declare module 'claude-code' {
  interface PluginState {
    'control-tower': {
      meter: Shaped<Meter | null>
      flags: Shaped<Flags>
      warnedModel: string
    }
  }
}
