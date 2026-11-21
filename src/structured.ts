import { z } from "zod";
import type { LlmClient, Message } from "./llm.ts";

export interface ModelPolicy {
  primary: string;
  fallback: string;
  maxAttempts: number;
}

export interface TraceEvent {
  stage: string;
  attempt: number;
  model: string;
  errors: string[];
  output: string | null;
}

export interface CallEnvironment {
  signal?: AbortSignal;
  trace?: (event: TraceEvent) => void;
}

export interface StructuredCall<S extends z.ZodObject> {
  schema: S;
  schemaName: string;
  messages: Message[];
  maxOutputTokens: number;
  validate: (value: z.infer<S>) => string[];
}

export type StructuredResult<T> =
  | { ok: true; value: T; attempts: number }
  | { ok: false; errors: string[]; attempts: number; lastValue?: T };

const MAX_TRACED_OUTPUT_CHARS = 4_000;

export async function callStructured<S extends z.ZodObject>(
  llm: LlmClient,
  policy: ModelPolicy,
  call: StructuredCall<S>,
  env: CallEnvironment = {},
): Promise<StructuredResult<z.infer<S>>> {
  const messages = [...call.messages];
  let errors: string[] = [];
  let lastValue: z.infer<S> | undefined;
  let attempt = 0;

  while (attempt < policy.maxAttempts) {
    if (env.signal?.aborted) {
      errors = ["document deadline exceeded"];
      break;
    }
    attempt++;
    const model = attempt === policy.maxAttempts && attempt > 1 ? policy.fallback : policy.primary;
    const reject = (reasons: string[], output: string | null) => {
      errors = reasons;
      env.trace?.({ stage: call.schemaName, attempt, model, errors: reasons, output: output?.slice(0, MAX_TRACED_OUTPUT_CHARS) ?? null });
    };

    let text: string;
    try {
      const response = await llm.complete({
        model,
        messages,
        schema: call.schema,
        schemaName: call.schemaName,
        maxOutputTokens: call.maxOutputTokens,
        ...(env.signal ? { signal: env.signal } : {}),
      });
      if (response.refusal) {
        reject([`model refused: ${response.refusal}`], null);
        continue;
      }
      if (response.truncated) {
        reject(["output was truncated before completion"], response.text);
        continue;
      }
      text = response.text;
    } catch (error) {
      reject([`request failed: ${error instanceof Error ? error.message : String(error)}`], null);
      continue;
    }

    const checked = parseAndValidate(text, call);
    if (checked.value !== undefined) lastValue = checked.value;
    if (checked.value !== undefined && checked.errors.length === 0) return { ok: true, value: checked.value, attempts: attempt };
    reject(checked.errors, text);

    messages.push(
      { role: "assistant", content: text },
      {
        role: "user",
        content: `Your response was rejected:\n${errors.map((e) => `- ${e}`).join("\n")}\nReturn a corrected, complete response.`,
      },
    );
  }

  return { ok: false, errors, attempts: attempt, ...(lastValue !== undefined ? { lastValue } : {}) };
}

function parseAndValidate<S extends z.ZodObject>(
  text: string,
  call: StructuredCall<S>,
): { value?: z.infer<S>; errors: string[] } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { errors: ["response is not valid JSON"] };
  }
  const parsed = call.schema.safeParse(json);
  if (!parsed.success) return { errors: [`response does not match schema: ${z.prettifyError(parsed.error)}`] };
  return { value: parsed.data, errors: call.validate(parsed.data) };
}
