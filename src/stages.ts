import { countWords, renderTagged } from "./blocks.ts";
import { mapWithConcurrency } from "./concurrency.ts";
import type { LlmClient } from "./llm.ts";
import { formatChanges, GLOBAL_EDITOR_PROMPT, LOCAL_EDITOR_PROMPT, PLANNER_PROMPT } from "./prompts.ts";
import { GlobalEditsSchema, LocalEditsSchema, PlanSchema, type PlannedChange } from "./schemas.ts";
import { callStructured, type CallEnvironment, type ModelPolicy, type StructuredResult } from "./structured.ts";
import type { Block, Edit } from "./types.ts";
import { validateGlobalCoverage, validateGlobalEdit, validateLocalEdits, validatePlan } from "./validation.ts";

export interface StageContext {
  llm: LlmClient;
  plannerPolicy: ModelPolicy;
  editorPolicy: ModelPolicy;
  concurrency: number;
  chunkWords: number;
  env: CallEnvironment;
}

export interface LocalJob {
  changeIndexes: number[];
  blockIds: string[];
}

export interface LocalJobResult {
  job: LocalJob;
  outcome: StructuredResult<{ edits: Edit[]; unapplied: { changeIndex: number; reason: string }[] }>;
}

export interface GlobalChunkResult {
  blockIds: string[];
  edits: Edit[];
  rejectedIds: string[];
  errors: string[];
}

const indexed = (changes: string[], indexes: number[]) => indexes.map((index) => ({ index, text: changes[index]! }));

export async function planChanges(ctx: StageContext, blocks: Block[], changes: string[]) {
  const knownIds = new Set(blocks.map((block) => block.id));
  return callStructured(ctx.llm, ctx.plannerPolicy, {
    schema: PlanSchema,
    schemaName: "edit_plan",
    maxOutputTokens: 400 + changes.length * 300,
    messages: [
      { role: "system", content: PLANNER_PROMPT },
      {
        role: "user",
        content: `<document>\n${renderTagged(blocks)}\n</document>\n\nRequested changes:\n${formatChanges(indexed(changes, changes.map((_, i) => i)))}`,
      },
    ],
    validate: (plan) => validatePlan(plan, changes.length, knownIds),
  }, ctx.env);
}

export function groupLocalChanges(planned: PlannedChange[], blocks: Block[]): LocalJob[] {
  const order = new Map(blocks.map((block, i) => [block.id, i]));
  let jobs: { changeIndexes: Set<number>; blockIds: Set<string> }[] = [];

  for (const entry of planned) {
    const overlapping = jobs.filter((job) => entry.blockIds.some((id) => job.blockIds.has(id)));
    const merged = {
      changeIndexes: new Set([entry.index, ...overlapping.flatMap((job) => [...job.changeIndexes])]),
      blockIds: new Set([...entry.blockIds, ...overlapping.flatMap((job) => [...job.blockIds])]),
    };
    jobs = [...jobs.filter((job) => !overlapping.includes(job)), merged];
  }

  return jobs.map((job) => ({
    changeIndexes: [...job.changeIndexes].sort((a, b) => a - b),
    blockIds: [...job.blockIds].sort((a, b) => order.get(a)! - order.get(b)!),
  }));
}

export async function runLocalJobs(
  ctx: StageContext,
  jobs: LocalJob[],
  blocks: Block[],
  changes: string[],
): Promise<LocalJobResult[]> {
  const position = new Map(blocks.map((block, i) => [block.id, i]));

  return mapWithConcurrency(jobs, ctx.concurrency, async (job) => {
    const targets = new Map(job.blockIds.map((id) => [id, blocks[position.get(id)!]!]));
    const context = [...new Set(job.blockIds.flatMap((id) => [position.get(id)! - 1, position.get(id)! + 1]))]
      .sort((a, b) => a - b)
      .map((i) => blocks[i])
      .filter((block): block is Block => block !== undefined && !targets.has(block.id));
    const targetChars = [...targets.values()].reduce((sum, block) => sum + block.text.length, 0);

    const outcome = await callStructured(ctx.llm, ctx.editorPolicy, {
      schema: LocalEditsSchema,
      schemaName: "local_edits",
      maxOutputTokens: Math.min(16_000, 1_000 + Math.ceil(targetChars / 2)),
      messages: [
        { role: "system", content: LOCAL_EDITOR_PROMPT },
        {
          role: "user",
          content: [
            `Requested changes:\n${formatChanges(indexed(changes, job.changeIndexes))}`,
            `<target_blocks>\n${renderTagged([...targets.values()])}\n</target_blocks>`,
            `<context_blocks>\n${context.length ? renderTagged(context) : "(none)"}\n</context_blocks>`,
          ].join("\n\n"),
        },
      ],
      validate: (result) => validateLocalEdits(result, targets, job.changeIndexes),
    }, ctx.env);
    return { job, outcome };
  });
}

export function chunkBlocks(blocks: Block[], maxWords: number): Block[][] {
  const chunks: Block[][] = [];
  let current: Block[] = [];
  let words = 0;

  for (const block of blocks) {
    const blockWords = countWords(block.text);
    if (current.length > 0 && words + blockWords > maxWords) {
      chunks.push(current);
      current = [];
      words = 0;
    }
    current.push(block);
    words += blockWords;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export async function runGlobalPass(
  ctx: StageContext,
  blocks: Block[],
  changes: string[],
  planned: PlannedChange[],
): Promise<GlobalChunkResult[]> {
  const styleOnly = planned.every((entry) => entry.styleOnly);
  const instructions = formatChanges(indexed(changes, planned.map((entry) => entry.index)));

  return mapWithConcurrency(chunkBlocks(blocks, ctx.chunkWords), ctx.concurrency, (chunk) =>
    editChunk(ctx, chunk, instructions, styleOnly),
  );
}

async function editChunk(ctx: StageContext, chunk: Block[], instructions: string, styleOnly: boolean): Promise<GlobalChunkResult> {
  const { primary, fallback, maxAttempts } = ctx.editorPolicy;
  const accepted: Edit[] = [];
  let pending = chunk;
  let feedback: string[] = [];

  for (let round = 1; round <= maxAttempts && pending.length > 0 && !ctx.env.signal?.aborted; round++) {
    const model = round === maxAttempts && round > 1 ? fallback : primary;
    const blocksToEdit = pending;
    const outcome = await callStructured(
      ctx.llm,
      { primary: model, fallback: model, maxAttempts: 1 },
      {
        schema: GlobalEditsSchema,
        schemaName: "global_edits",
        maxOutputTokens: 1_000 + Math.ceil(countWords(blocksToEdit.map((b) => b.text).join(" ")) * 2.5),
        messages: [
          { role: "system", content: GLOBAL_EDITOR_PROMPT },
          {
            role: "user",
            content: [
              `Document-wide changes:\n${instructions}`,
              ...(feedback.length ? [`A previous attempt on these blocks was rejected; fix these issues:\n${feedback.map((e) => `- ${e}`).join("\n")}`] : []),
              `<chunk>\n${renderTagged(blocksToEdit)}\n</chunk>`,
            ].join("\n\n"),
          },
        ],
        validate: (result) => validateGlobalCoverage(result, blocksToEdit),
      },
      ctx.env,
    );

    if (!outcome.ok) {
      feedback = outcome.errors;
      continue;
    }

    const failed: Block[] = [];
    feedback = [];
    outcome.value.edits.forEach((edit, i) => {
      const errors = validateGlobalEdit(edit, blocksToEdit[i]!, styleOnly);
      if (errors.length === 0) accepted.push(edit);
      else {
        failed.push(blocksToEdit[i]!);
        feedback.push(...errors);
        ctx.env.trace?.({ stage: "global_edits", attempt: round, model, errors, output: edit.text });
      }
    });
    pending = failed;
  }

  return {
    blockIds: chunk.map((block) => block.id),
    edits: accepted,
    rejectedIds: pending.map((block) => block.id),
    errors: pending.length > 0 ? feedback : [],
  };
}
