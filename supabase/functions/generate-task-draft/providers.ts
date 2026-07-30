import { buildTaskDraftPrompt, TaskDraftRequest } from './task-draft.ts';

export interface TaskDraftProvider {
  readonly name: string;
  readonly model: string;
  generate(request: TaskDraftRequest, previousInvalidOutput?: string): Promise<unknown>;
}

interface DeepSeekProviderOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
}

function mapDeepSeekError(status: number): string {
  switch (status) {
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
      return 'DeepSeek could not generate a task draft.';
  }
}

export class DeepSeekTaskDraftProvider implements TaskDraftProvider {
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
    request: TaskDraftRequest,
    previousInvalidOutput?: string
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const prompt = previousInvalidOutput
      ? [
          buildTaskDraftPrompt(request),
          'The previous response was invalid. Return a corrected JSON object only.',
          `<invalid_response>${previousInvalidOutput.slice(0, 4000)}</invalid_response>`,
        ].join('\n')
      : buildTaskDraftPrompt(request);

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
              content:
                'You extract structured task data. Always return one valid JSON object and no markdown.',
            },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
          thinking: { type: 'disabled' },
          max_tokens: 800,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(mapDeepSeekError(response.status));
      const payload = await response.json();
      const choice = payload?.choices?.[0];
      const content = choice?.message?.content;
      if (choice?.finish_reason === 'length') throw new Error('DeepSeek response was truncated.');
      if (typeof content !== 'string' || !content.trim()) {
        throw new Error('DeepSeek returned an empty response.');
      }
      return JSON.parse(content);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('DeepSeek request timed out. Please try again.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
