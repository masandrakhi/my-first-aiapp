// @vitest-environment node
/** The Claude Haiku 5.5 adapter, against a fake SDK client (no network, no cost). */
import type Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'
import { AnthropicChatModel, COACH_MODEL } from '../chat/model'
import { SYSTEM_PROMPT } from '../chat/prompt'
import { TOOL_DEFS } from '../chat/toolDefs'

function fakeClient(response: Partial<Anthropic.Message>) {
  const create = vi.fn().mockResolvedValue({ usage: { input_tokens: 120, output_tokens: 30 }, content: [], stop_reason: 'end_turn', ...response })
  return { create, client: { messages: { create } } as unknown as Anthropic }
}

describe('AnthropicChatModel', () => {
  it('asks Haiku 5.5 with low effort, the cached system prompt and the three tools', async () => {
    const { create, client } = fakeClient({ content: [{ type: 'text', text: 'Hi!', citations: null }] })
    const model = new AnthropicChatModel('test-key', client)
    const turn = await model.respond({ system: SYSTEM_PROMPT, tools: TOOL_DEFS, messages: [{ role: 'user', content: 'hello' }] })

    const params = create.mock.calls[0]![0]
    expect(params).toMatchObject({ model: COACH_MODEL, output_config: { effort: 'low' }, tools: TOOL_DEFS })
    expect(params.model).toBe('claude-haiku-5-5')
    expect(params.system).toEqual([{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }])
    expect(params.tool_choice).toBeUndefined() // auto: forced tool use is never requested
    expect(turn).toEqual({ content: [{ type: 'text', text: 'Hi!', citations: null }], stop: 'end_turn', usage: { inputTokens: 120, outputTokens: 30 } })
    expect(model.practice).toBe(false)
  })

  it('passes tool calls through and maps stop reasons, including refusals', async () => {
    const toolUse = { type: 'tool_use', id: 'tu_1', name: 'search_habit_catalog', input: { query: 'sleep', categories: [], limit: 3 } }
    const { client } = fakeClient({ content: [toolUse] as unknown as Anthropic.ContentBlock[], stop_reason: 'tool_use' })
    const turn = await new AnthropicChatModel('k', client).respond({ system: 's', tools: [], messages: [{ role: 'user', content: 'x' }] })
    expect(turn.stop).toBe('tool_use')
    expect(turn.content[0]).toMatchObject({ type: 'tool_use', name: 'search_habit_catalog' })

    for (const [reason, stop] of [['refusal', 'refusal'], ['max_tokens', 'max_tokens'], ['pause_turn', 'other']] as const) {
      const { client: c } = fakeClient({ stop_reason: reason as Anthropic.Message['stop_reason'] })
      expect((await new AnthropicChatModel('k', c).respond({ system: 's', tools: [], messages: [{ role: 'user', content: 'x' }] })).stop).toBe(stop)
    }
  })

  it('lets API errors reach the coordinator (which answers 503)', async () => {
    const create = vi.fn().mockRejectedValue(new Error('overloaded'))
    const model = new AnthropicChatModel('k', { messages: { create } } as unknown as Anthropic)
    await expect(model.respond({ system: 's', tools: [], messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow('overloaded')
  })
})
