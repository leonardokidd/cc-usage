import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit, Speed } from '../types'

const limits = atom({ plugin: 'cd-usage', key: 'limits' } as const, [] as Limit[])
const now = atom({ plugin: 'cd-usage', key: 'now' } as const, 0)
const cost = atom({ plugin: 'cd-usage', key: 'cost' } as const, 0)
const isHidden = atom({ plugin: 'cd-usage', key: 'isHidden' } as const, false)
const speed = atom({ plugin: 'cd-usage', key: 'speed' } as const, {
  inTok: 0,
  outTok: 0,
  cacheTok: 0,
  liveOut: 0,
  tps: 0,
  liveTps: 0,
  isLive: false,
} as Speed)

// Space between an icon and its value; a Unicode space, so the app does not collapse it.
const GAP = '\u2002'
// ⏳ and ⚡ are drawn about 1/6 em narrower than their box on each side (measured in Apple Color
// Emoji), so they get a 1/3 em space instead of 1/2 em to look the same as the other icons.
const GAP_NARROW_ICON = '\u2004'
// Space between fields. The em space keeps its width in the desktop app (which collapses
// runs of ASCII spaces); the two ASCII spaces widen it in the terminal, where every space is one cell.
const SEP = '\u2003  '
// Pads t/s on the left with figure spaces (each as wide as a digit), so its changing value keeps
// one width and the right-aligned line stops shifting while Claude replies.
const pad = (s: string, width: number) => s.padStart(width, '\u2007')
// The desktop font's digits differ in width (a 1 is narrower than an 8), so t/s uses the Unicode
// monospace digits, which are all exactly one figure space wide.
const monoDigits = (s: string) => s.replace(/[0-9]/g, d => String.fromCodePoint(0x1d7f6 + Number(d)))
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0)
// One decimal, halves rounded up (10.55 -> 10.6); the epsilon absorbs float error such as 10.549999.
const r1 = (n: number) => (Math.round(n * 10 + 1e-9) / 10).toFixed(1)
const fmt = (n: number) => (n >= 1e6 ? `${r1(n / 1e6)}M` : n >= 1000 ? `${r1(n / 1000)}k` : String(Math.round(n)))
const left = (iso: string | number | undefined, t: number) => {
  if (iso === undefined || iso === null || !t) return '--'
  const n = Number(iso)
  const at = Number.isFinite(n) ? (n < 1e12 ? n * 1000 : n) : Date.parse(String(iso))
  if (!Number.isFinite(at)) return '--'
  const s = Math.max(0, Math.floor((at - t) / 1000))
  const d = Math.floor(s / 86400)
  const hh = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  return d > 0 ? `${d}d\u2009${hh}h` : `${hh}h\u2009${m}m`
}

async function refresh($: EngineInterface) {
  const u = await $.session.usage()
  await update($, limits, () => (u.rateLimits ?? []).map(r => ({ ...r })))
  await update($, cost, () => num(u.cost?.usd))
  await pushStatus($)
}

// Background bookkeeping: never awaited by a hook, never allowed to throw into one.
const quietly = (p: Promise<unknown>) => void p.catch(() => {})

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    quietly(
      (async () => {
        await $.command.register({ name: 'usage-bar', description: 'Show or hide the usage line under the prompt' })
        await update($, now, () => Date.now())
        await refresh($)
        $.clock.every(5000, async () => {
          const t = Date.now()
          await update($, now, () => t)
          if (Math.floor(t / 5000) % 6 === 0) await refresh($)
          else await pushStatus($)
        })
      })(),
    )
    return r
  })

  on('command.run', { command: 'usage-bar' }, async ($, e) => {
    if (e.args.trim() === 'raw') {
      const u = await $.session.usage()
      return { text: JSON.stringify({ rateLimits: u.rateLimits, cost: u.cost, at: new Date().toISOString() }, null, 2) }
    }
    const hidden = await update($, isHidden, v => !v)
    await pushStatus($)
    return { text: `Usage line ${hidden ? 'hidden' : 'shown'}.` }
  })

  on('session.measure', async ($, e, next) => {
    const r = await next(e)
    quietly(refresh($))
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    quietly(refresh($))
    return r
  })

  // Observe the main conversation's stream only; every chunk is passed on untouched and at once.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId) return yield* next(e)
    const t0 = Date.now()
    let first = 0
    let chars = 0
    let lastWrite = 0
    const stream = next(e)
    for await (const c of stream) {
      yield c
      try {
        const t = Date.now()
        if (c.kind === 'text' || c.kind === 'thinking' || c.kind === 'input') {
          if (!first) first = t
          chars += (c.kind === 'input' ? c.json : c.text).length
          if (t - lastWrite >= 150) {
            lastWrite = t
            const est = chars / 4
            const tps = num(est / Math.max(0.2, (t - first) / 1000))
            quietly(update($, speed, s => ({ ...s, isLive: true, liveOut: est, liveTps: tps })).then(() => pushStatus($)))
          }
        }
        if (c.kind === 'stop') {
          const u = c.usage
          const out = u ? num(u.output_tokens) : chars / 4
          const tps = num(out / Math.max(0.2, (t - (first || t0)) / 1000))
          quietly(
            update($, speed, s => ({
              inTok: num(s?.inTok) + (u ? num(u.input_tokens) + num(u.cache_read_input_tokens) + num(u.cache_creation_input_tokens) : 0),
              outTok: num(s?.outTok) + out,
              cacheTok: num(s?.cacheTok) + (u ? num(u.cache_read_input_tokens) + num(u.cache_creation_input_tokens) : 0),
              liveOut: 0,
              tps,
              liveTps: 0,
              isLive: false,
            })).then(() => pushStatus($)),
          )
        }
      } catch {}
    }
    return await stream.result
  })
}

async function pushStatus($: EngineInterface) {
  if (await read($, isHidden)) {
    $.ui.status(undefined)
    return
  }
  const ls = (await read($, limits)) ?? []
  const sp: Partial<Speed> = (await read($, speed)) ?? {}
  const t = num(await read($, now))
  const usd = num(await read($, cost))
  const isLive = !!sp.isLive
  const tps = num(isLive ? sp.liveTps : sp.tps)
  const out = num(sp.outTok) + (isLive ? num(sp.liveOut) : 0)
  const win = (kind: string) => {
    const l = ls.find(x => x?.kind === kind)
    return `${l ? Math.round(num(l.percentUsed)) + '%' : '--'} | ${left(l?.resetsAt, t)}`
  }
  $.ui.status(
    [
      `⏳${GAP_NARROW_ICON}${win('five_hour')}`,
      `📅${GAP}${win('seven_day')}`,
      `⬆️${GAP}${fmt(num(sp.inTok))}`,
      `⬇️${GAP}${fmt(out)}`,
      `💵${GAP}${r1(usd)}`,
      `⚡${GAP_NARROW_ICON}${monoDigits(pad(r1(tps), 5))} t/s`,
    ].join(SEP),
  )
}
