export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Speed = {
  inTok: number
  outTok: number
  cacheTok: number
  liveOut: number
  tps: number
  liveTps: number
  isLive: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'cc-usage': { limits: Limit[]; speed: Speed; now: number; cost: number; isHidden: boolean }
  }
}
