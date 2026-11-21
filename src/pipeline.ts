import { setMaxListeners } from "node:events";
import { applyEdits } from "./apply.ts";
import { countWords, parseDocument, renderDocument } from "./blocks.ts";
import { MeteredClient, OpenAiClient, type LlmClient } from "./llm.ts";
import { createRequestSchema, DEFAULT_LIMITS, type InputLimits, type PlannedChange } from "./schemas.ts";
import { groupLocalChanges, planChanges, runGlobalPass, runLocalJobs, type StageContext } from "./stages.ts";
import type { TraceEvent } from "./structured.ts";
import type { ChangeReport, Edit, UpdateRequest, UpdateResult } from "./types.ts";

export interface UpdateOptions {
  llm?: LlmClient;
  plannerModel?: string;
  editorModel?: string;
  fallbackModel?: string;
  maxAttempts?: number;
  concurrency?: number;
  chunkWords?: number;
  tokenBudget?: number;
  limits?: Partial<InputLimits>;
  deadlineMs?: number;
  signal?: AbortSignal;
  trace?: (event: TraceEvent) => void;
}

export async function updateDocument(request: UpdateRequest, options: UpdateOptions = {}): Promise<UpdateResult> {
  const { sourceDocument, changes } = createRequestSchema({ ...DEFAULT_LIMITS, ...options.limits }).parse(request);
  const startedAt = performance.now();
  const tokenBudget = options.tokenBudget ?? Math.max(50_000, Math.ceil(sourceDocument.length * 3));
  const llm = new MeteredClient(options.llm ?? new OpenAiClient(), tokenBudget);
  const fallback = options.fallbackModel ?? "gpt-4.1";
  const maxAttempts = options.maxAttempts ?? 3;
  const concurrency = options.concurrency ?? 12;
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new RangeError("concurrency must be a positive integer");

  const ctx: StageContext = {
    llm,
    plannerPolicy: { primary: options.plannerModel ?? "gpt-4.1", fallback, maxAttempts },
    editorPolicy: { primary: options.editorModel ?? "gpt-4.1-mini", fallback, maxAttempts },
    concurrency,
    chunkWords: options.chunkWords ?? 800,
    env: { signal: documentSignal(options), ...(options.trace ? { trace: options.trace } : {}) },
  };

  const parsed = parseDocument(sourceDocument);
  const reports: ChangeReport[] = changes.map((change, index) => ({
    index,
    change,
    scope: null,
    status: "failed",
    blockIds: [],
    notes: [],
  }));
  const timingsMs = { plan: 0, local: 0, global: 0, total: 0 };
  const finish = (document: string): UpdateResult => {
    timingsMs.total = elapsed(startedAt);
    return {
      document,
      report: {
        changes: reports,
        usage: llm.usage,
        timingsMs,
        documentWords: { before: countWords(sourceDocument), after: countWords(document) },
      },
    };
  };

  if (changes.length === 0 || parsed.blocks.length === 0) {
    reports.forEach((report) => {
      report.status = "not_applicable";
      report.notes.push("document is empty");
    });
    return finish(sourceDocument);
  }

  let stageStart = performance.now();
  const plan = await planChanges(ctx, parsed.blocks, changes);
  timingsMs.plan = elapsed(stageStart);
  if (!plan.ok) {
    reports.forEach((report) => report.notes.push(`planning failed after ${plan.attempts} attempts`, ...plan.errors));
    return finish(sourceDocument);
  }

  const local: PlannedChange[] = [];
  const global: PlannedChange[] = [];
  for (const entry of plan.value.changes) {
    const report = reports[entry.index]!;
    report.scope = entry.scope;
    report.blockIds = entry.blockIds;
    report.notes.push(entry.rationale);
    if (!entry.applicable) report.status = "not_applicable";
    else if (entry.ambiguous && entry.scope === "local") {
      report.status = "ambiguous";
      report.notes.push(`several blocks match equally well (${entry.blockIds.join(", ")}); left unchanged for review`);
    } else (entry.scope === "local" ? local : global).push(entry);
  }

  let blocks = parsed.blocks;

  stageStart = performance.now();
  const localResults = await runLocalJobs(ctx, groupLocalChanges(local, blocks), blocks, changes);
  const localEdits: Edit[] = [];
  for (const { job, outcome } of localResults) {
    const jobReports = job.changeIndexes.map((index) => reports[index]!);
    if (!outcome.ok) {
      jobReports.forEach((report) => report.notes.push(`edit rejected after ${outcome.attempts} attempts`, ...outcome.errors));
      continue;
    }
    localEdits.push(...outcome.value.edits);
    const unapplied = new Map(outcome.value.unapplied.map((entry) => [entry.changeIndex, entry.reason]));
    jobReports.forEach((report) => {
      const reason = unapplied.get(report.index);
      report.status = reason === undefined ? "applied" : "not_applicable";
      if (reason !== undefined) report.notes.push(reason);
    });
  }
  blocks = applyEdits(blocks, localEdits);
  timingsMs.local = elapsed(stageStart);

  if (global.length > 0) {
    stageStart = performance.now();
    const chunkResults = await runGlobalPass(ctx, blocks, changes, global);
    blocks = applyEdits(blocks, chunkResults.flatMap((result) => result.edits));

    const totalBlocks = chunkResults.reduce((sum, result) => sum + result.blockIds.length, 0);
    const rejected = chunkResults.flatMap((result) => result.rejectedIds);
    const failures = chunkResults
      .filter((result) => result.rejectedIds.length > 0)
      .map((result) => `left unchanged: ${result.rejectedIds.join(", ")} (${result.errors.join("; ")})`);
    for (const entry of global) {
      const report = reports[entry.index]!;
      report.status = rejected.length === 0 ? "applied" : rejected.length < totalBlocks ? "partial" : "failed";
      report.notes.push(...failures);
    }
    timingsMs.global = elapsed(stageStart);
  }

  return finish(renderDocument(parsed, blocks));
}

function documentSignal(options: UpdateOptions): AbortSignal {
  const deadline = AbortSignal.timeout(options.deadlineMs ?? 180_000);
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
  setMaxListeners(0, signal);
  return signal;
}

function elapsed(since: number): number {
  return Math.round(performance.now() - since);
}
