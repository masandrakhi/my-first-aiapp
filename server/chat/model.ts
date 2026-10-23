/**
 * The Coach talks to a model only through this interface, so the real model (Claude Haiku 5.5),
 * the free practice stand-in and test scripts are interchangeable. History in and out uses the
 * Anthropic SDK's own message types, stored as-is so thinking and tool blocks replay unchanged.
 */
import Anthropic from '@anthropic-ai/sdk'

export interface ModelRequest {
  system: string
  tools: Anthropic.Tool[]
  messages: Anthropic.MessageParam[]
}

export type ModelStop = 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'other'

export interface ModelTurn {
  content: Anthropic.ContentBlockParam[]
  stop: ModelStop
  usage: { inputTokens: number; outputTokens: number }
}

export interface ChatModel {
  /** Shown in the Coach so users know when replies come from the practice stand-in. */
  readonly practice: boolean
  readonly name: string
  respond(request: ModelRequest): Promise<ModelTurn>
}

export const COACH_MODEL = 'claude-haiku-5-5'

const STOPS: Record<string, ModelStop> = { end_turn: 'end_turn', tool_use: 'tool_use', max_tokens: 'max_tokens', refusal: 'refusal' }

/** Claude Haiku 5.5 through the official SDK. Used only when ANTHROPIC_API_KEY is configured. */
export class AnthropicChatModel implements ChatModel {
  readonly practice = false
  readonly name = COACH_MODEL
  private readonly client: Anthropic

  constructor(apiKey: string, client?: Anthropic) {
    // Short timeout and few retries: a chat reply that takes over 30 s is better reported than awaited.
    this.client = client ?? new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 })
  }

  async respond({ system, tools, messages }: ModelRequest): Promise<ModelTurn> {
    const response = await this.client.messages.create({
      model: COACH_MODEL,
      max_tokens: 2048,
      // Everyday chat doesn't need deep reasoning; low effort keeps replies quick and cheap.
      output_config: { effort: 'low' },
      // The system prompt and tool list never change, so they are cached between requests.
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      tools,
      messages,
    })
    return {
      content: response.content as Anthropic.ContentBlockParam[],
      stop: STOPS[response.stop_reason ?? ''] ?? 'other',
      usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
    }
  }
}
