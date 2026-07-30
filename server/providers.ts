import { APICallError, generateText, Output } from 'ai';
import { buildTaskDraftPrompt, TaskDraftRequest } from './task-draft.js';

export interface TaskDraftProvider {
  readonly name: string;
  readonly model: string;
  generate(request: TaskDraftRequest, previousInvalidOutput?: string): Promise<unknown>;
}

interface VercelAiGatewayProviderOptions {
  apiKey: string;
  model: string;
  userId: string;
  timeoutMs?: number;
}

function mapGatewayError(status: number): string {
  switch (status) {
    case 401:
      return 'Vercel AI Gateway authentication failed.';
    case 402:
      return 'Vercel AI Gateway credits are insufficient.';
    case 429:
      return 'AI requests are temporarily rate limited. Please try again shortly.';
    case 500:
    case 503:
      return 'Vercel AI Gateway is temporarily unavailable. Please try again shortly.';
    default:
      return 'Vercel AI Gateway could not generate a task draft.';
  }
}

export class VercelAiGatewayTaskDraftProvider implements TaskDraftProvider {
  readonly name = 'vercel-ai-gateway';
  readonly model: string;
  private readonly apiKey: string;
  private readonly userId: string;
  private readonly timeoutMs: number;

  constructor(options: VercelAiGatewayProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.userId = options.userId;
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
      const result = await generateText({
        model: this.model,
        system:
          'You extract structured task data. Always return one valid JSON object and no markdown.',
        prompt,
        output: Output.json(),
        maxOutputTokens: 800,
        maxRetries: 0,
        abortSignal: controller.signal,
        providerOptions: {
          gateway: {
            byok: {
              deepseek: [{ apiKey: this.apiKey }],
            },
            only: ['deepseek'],
            user: this.userId,
            tags: ['feature:task-draft'],
          },
        },
      });

      if (result.finishReason === 'length') {
        throw new Error('Vercel AI Gateway response was truncated.');
      }
      if (!result.output || typeof result.output !== 'object') {
        throw new Error('Vercel AI Gateway returned an empty response.');
      }
      return result.output;
    } catch (error) {
      if (APICallError.isInstance(error) && error.statusCode) {
        throw new Error(mapGatewayError(error.statusCode));
      }
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted'))
      ) {
        throw new Error('Vercel AI Gateway request timed out. Please try again.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
