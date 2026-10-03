import { test, expect } from 'claude-code/testing'

const chunks = [
  { kind: 'text', index: 0, text: 'Hello ' },
  { kind: 'text', index: 0, text: 'world' },
  { kind: 'stop', stopReason: 'end_turn', usage: { model: 'm', input_tokens: 10, output_tokens: 2, cache_read_input_tokens: 5, cache_creation_input_tokens: 0 } },
]
const result = { turnId: 't', index: 0, answer: 'Hello world', toolUses: [], stopReason: 'end_turn', usage: chunks[2]!.usage }

test('turn.step chunks and result pass through unchanged', async ($, on) => {
  on('ui.status', () => ({}) as any)
  on('turn.step', async function* () {
    for (const c of chunks) yield c as any
    return result as any
  })
  const stream = ($ as any).turn.step({ turnId: 't', index: 0, model: 'm', messageCount: 1 })
  const seen: unknown[] = []
  let step = await stream.next()
  while (!step.done) { seen.push(step.value); step = await stream.next() }
  const r = step.value
  expect(seen.map((c: any) => c.kind)).toEqual(['text', 'text', 'stop'])
  expect((seen[1] as any).text).toBe('world')
  expect(r.answer).toBe('Hello world')
  expect(r.usage.output_tokens).toBe(2)
})
