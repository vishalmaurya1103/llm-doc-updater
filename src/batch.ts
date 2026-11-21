import { z } from "zod";
import { mapWithConcurrency } from "./concurrency.ts";
import { OpenAiClient } from "./llm.ts";
import { updateDocument, type UpdateOptions } from "./pipeline.ts";
import type { TraceEvent } from "./structured.ts";
import type { UpdateRequest, UpdateResult } from "./types.ts";

export interface BatchItem {
  id: string;
  load: () => Promise<UpdateRequest>;
}

export type BatchOutcome = { id: string } & ({ ok: true; result: UpdateResult } | { ok: false; error: string });

export interface BatchOptions extends Omit<UpdateOptions, "trace"> {
  documentConcurrency?: number;
  trace?: (documentId: string, event: TraceEvent) => void;
  onDocumentDone?: (outcome: BatchOutcome) => Promise<void> | void;
}

export async function updateDocuments(items: BatchItem[], options: BatchOptions = {}): Promise<BatchOutcome[]> {
  const { documentConcurrency = 4, trace, onDocumentDone, ...updateOptions } = options;
  const llm = updateOptions.llm ?? new OpenAiClient();

  return mapWithConcurrency(items, documentConcurrency, async (item) => {
    let outcome: BatchOutcome;
    try {
      const result = await updateDocument(await item.load(), {
        ...updateOptions,
        llm,
        ...(trace ? { trace: (event: TraceEvent) => trace(item.id, event) } : {}),
      });
      outcome = { id: item.id, ok: true, result };
    } catch (error) {
      outcome = { id: item.id, ok: false, error: describeError(error) };
    }
    await onDocumentDone?.(outcome);
    return outcome;
  });
}

export function describeError(error: unknown): string {
  if (error instanceof z.ZodError) return `invalid request: ${z.prettifyError(error)}`;
  return error instanceof Error ? error.message : String(error);
}
