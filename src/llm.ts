import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { Semaphore } from "./concurrency.ts";
import type { TokenUsage } from "./types.ts";

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  model: string;
  messages: Message[];
  schema: z.ZodObject;
  schemaName: string;
  maxOutputTokens: number;
  signal?: AbortSignal;
}

export interface CompletionResponse {
  text: string;
  truncated: boolean;
  refusal: string | null;
  inputTokens: number;
  outputTokens: number;
}

export interface LlmClient {
  complete(request: CompletionRequest): Promise<CompletionResponse>;
}

export interface OpenAiClientOptions {
  apiKey?: string;
  timeoutMs?: number;
  maxRetries?: number;
  maxInFlight?: number;
}

export class OpenAiClient implements LlmClient {
  readonly #client: OpenAI;
  readonly #slots: Semaphore;

  constructor(options: OpenAiClientOptions = {}) {
    this.#client = new OpenAI({
      ...(options.apiKey ? { apiKey: options.apiKey } : {}),
      maxRetries: options.maxRetries ?? 4,
      timeout: options.timeoutMs ?? 120_000,
    });
    this.#slots = new Semaphore(options.maxInFlight ?? 16);
  }

  complete(request: CompletionRequest): Promise<CompletionResponse> {
    return this.#slots.run(() => this.#send(request));
  }

  async #send(request: CompletionRequest): Promise<CompletionResponse> {
    const response = await this.#client.responses.create(
      {
        model: request.model,
        input: request.messages,
        temperature: 0,
        max_output_tokens: request.maxOutputTokens,
        store: false,
        text: { format: zodTextFormat(request.schema, request.schemaName) },
      },
      request.signal ? { signal: request.signal } : {},
    );

    const refusal = response.output
      .flatMap((item) => (item.type === "message" ? item.content : []))
      .find((part) => part.type === "refusal");

    return {
      text: response.output_text,
      truncated: response.status === "incomplete",
      refusal: refusal?.type === "refusal" ? refusal.refusal : null,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    };
  }
}

export class TokenBudgetExceededError extends Error {
  constructor(budget: number) {
    super(`token budget of ${budget} exhausted for this document`);
    this.name = "TokenBudgetExceededError";
  }
}

export class MeteredClient implements LlmClient {
  readonly usage: TokenUsage = { calls: 0, inputTokens: 0, outputTokens: 0 };

  constructor(
    private readonly inner: LlmClient,
    private readonly tokenBudget = Number.POSITIVE_INFINITY,
  ) {}

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    request.signal?.throwIfAborted();
    if (this.usage.inputTokens + this.usage.outputTokens >= this.tokenBudget) {
      throw new TokenBudgetExceededError(this.tokenBudget);
    }
    const response = await this.inner.complete(request);
    this.usage.calls += 1;
    this.usage.inputTokens += response.inputTokens;
    this.usage.outputTokens += response.outputTokens;
    return response;
  }
}
