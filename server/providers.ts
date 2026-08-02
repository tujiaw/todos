import type { AssistantChatMessage, ChatMessage } from './ai-assist.js';
import { buildTaskDraftPrompt, TaskDraftRequest } from './task-draft.js';

export interface TaskDraftProvider {
  readonly name: string;
  readonly model: string;
  generate(request: TaskDraftRequest, previousInvalidOutput?: string): Promise<unknown>;
}

export interface DeepSeekProviderOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
}

function mapDeepSeekError(status: number): string {
  switch (status) {
    case 400:
    case 422:
      return 'DeepSeek rejected the request. Check the configured model.';
    case 401:
      return 'DeepSeek authentication failed. Check the server API key.';
    case 402:
      return 'DeepSeek account balance is insufficient.';
    case 429:
      return 'AI requests are temporarily rate limited. Please try again shortly.';
    case 500:
    case 503:
      return 'DeepSeek is temporarily unavailable. Please try again shortly.';
    default:
      return `DeepSeek request failed (HTTP ${status}).`;
  }
}

export class DeepSeekJsonProvider {
  readonly name = 'deepseek';
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: DeepSeekProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = (options.baseUrl || 'https://api.deepseek.com').replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs || 25_000;
  }

  async generate(
    system: string,
    prompt: string,
    maxTokens = 1200
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: system,
            },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
          thinking: { type: 'disabled' },
          max_tokens: maxTokens,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(mapDeepSeekError(response.status));
      const payload = await response.json();
      const choice = payload?.choices?.[0];
      const content = choice?.message?.content;
      if (choice?.finish_reason === 'length') {
        throw new Error('DeepSeek response was truncated.');
      }
      if (typeof content !== 'string' || !content.trim()) {
        throw new Error('DeepSeek returned an empty response.');
      }
      return JSON.parse(content);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted'))
      ) {
        throw new Error('DeepSeek request timed out. Please try again.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async chatWithTools(input: {
    messages: ChatMessage[];
    tools: unknown[];
    maxTokens?: number;
  }): Promise<AssistantChatMessage> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: input.messages,
          tools: input.tools,
          tool_choice: 'auto',
          thinking: { type: 'disabled' },
          max_tokens: input.maxTokens ?? 1600,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(mapDeepSeekError(response.status));
      const payload = await response.json();
      const choice = payload?.choices?.[0];
      const message = choice?.message;
      if (!message || typeof message !== 'object') {
        throw new Error('DeepSeek returned an empty response.');
      }
      if (choice?.finish_reason === 'length') {
        throw new Error('DeepSeek response was truncated.');
      }

      const toolCalls = Array.isArray(message.tool_calls)
        ? message.tool_calls
            .filter(
              (call: unknown) =>
                call &&
                typeof call === 'object' &&
                typeof (call as { id?: unknown }).id === 'string' &&
                (call as { type?: unknown }).type === 'function' &&
                typeof (call as { function?: { name?: unknown } }).function?.name === 'string'
            )
            .map((call: {
              id: string;
              function: { name: string; arguments?: string };
            }) => ({
              id: call.id,
              type: 'function' as const,
              function: {
                name: call.function.name,
                arguments:
                  typeof call.function.arguments === 'string'
                    ? call.function.arguments
                    : '{}',
              },
            }))
        : undefined;

      const content =
        typeof message.content === 'string'
          ? message.content
          : message.content == null
            ? null
            : String(message.content);

      return {
        role: 'assistant',
        content,
        tool_calls: toolCalls?.length ? toolCalls : undefined,
      };
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted'))
      ) {
        throw new Error('DeepSeek request timed out. Please try again.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class DeepSeekTaskDraftProvider implements TaskDraftProvider {
  readonly name = 'deepseek';
  readonly model: string;
  private readonly client: DeepSeekJsonProvider;

  constructor(options: DeepSeekProviderOptions) {
    this.model = options.model;
    this.client = new DeepSeekJsonProvider(options);
  }

  generate(
    request: TaskDraftRequest,
    previousInvalidOutput?: string
  ): Promise<unknown> {
    const prompt = previousInvalidOutput
      ? [
          buildTaskDraftPrompt(request),
          'The previous response was invalid. Return a corrected JSON object only.',
          `<invalid_response>${previousInvalidOutput.slice(0, 4000)}</invalid_response>`,
        ].join('\n')
      : buildTaskDraftPrompt(request);

    return this.client.generate(
      'You extract structured task data. Always return one valid JSON object and no markdown.',
      prompt
    );
  }
}
