import type { CompletionRequest, CompletionResponse, LlmClient } from "../src/llm.ts";

type Scripted = object | string;

export class ScriptedLlm implements LlmClient {
  readonly requests: CompletionRequest[] = [];
  readonly #queues: Map<string, Scripted[]>;

  constructor(script: Record<string, Scripted[]>) {
    this.#queues = new Map(Object.entries(script).map(([name, responses]) => [name, [...responses]]));
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    this.requests.push({ ...request, messages: [...request.messages] });
    const next = this.#queues.get(request.schemaName)?.shift();
    if (next === undefined) throw new Error(`no scripted response left for ${request.schemaName}`);
    return {
      text: typeof next === "string" ? next : JSON.stringify(next),
      truncated: false,
      refusal: null,
      inputTokens: 100,
      outputTokens: 10,
    };
  }

  callsFor(schemaName: string): CompletionRequest[] {
    return this.requests.filter((request) => request.schemaName === schemaName);
  }
}

export const DOC = `# Guide

Intro paragraph that nobody should touch.

## Pricing

Starter costs $49 per month and Team costs $199 per month.

## APIs

The legacy v1 API uses query-string keys and is deprecated.

To migrate off the legacy v1 API, switch to bearer tokens and the /v2 base URL.
`;

export const plan = (
  ...entries: {
    index: number;
    scope?: "local" | "global";
    blockIds?: string[];
    applicable?: boolean;
    ambiguous?: boolean;
    styleOnly?: boolean;
  }[]
) => ({
  changes: entries.map((entry) => ({
    applicable: true,
    ambiguous: false,
    scope: "local",
    styleOnly: false,
    blockIds: [],
    rationale: "test",
    ...entry,
  })),
});
