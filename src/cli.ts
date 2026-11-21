import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { parseArgs } from "node:util";
import { describeError, updateDocuments, type BatchOutcome } from "./batch.ts";
import { updateDocument, type UpdateOptions } from "./pipeline.ts";
import type { TraceEvent } from "./structured.ts";
import type { UpdateReport, UpdateRequest } from "./types.ts";

const USAGE = `Usage:
  npm run update -- --input request.json [--out updated.md] [--report report.json]
  npm run update -- --doc document.md --changes changes.json [--out updated.md] [--report report.json]
  npm run update -- --batch requests/ --out-dir results/

Options:
  --input             JSON file shaped as { "sourceDocument": string, "changes": string[] }
  --doc               Markdown/text document (alternative to --input)
  --changes           JSON array of change strings (used with --doc)
  --batch             Directory of request JSON files; each produces <name>.md and <name>.report.json
  --out               Write the updated document here (default: stdout)
  --out-dir           Output directory for --batch (default: out/batch)
  --report            Write the JSON report here
  --trace             Append rejected LLM outputs as JSON lines to this file
  --editor-model      Model for edits (default: gpt-4.1-mini)
  --planner-model     Model for planning (default: gpt-4.1)
  --concurrency       Parallel LLM calls per document (default: 12)
  --doc-concurrency   Documents processed in parallel in batch mode (default: 4)
  --deadline          Per-document time limit in seconds (default: 180)`;

const SUCCESS = new Set(["applied", "not_applicable"]);

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      doc: { type: "string" },
      changes: { type: "string" },
      batch: { type: "string" },
      out: { type: "string" },
      "out-dir": { type: "string" },
      report: { type: "string" },
      trace: { type: "string" },
      "editor-model": { type: "string" },
      "planner-model": { type: "string" },
      concurrency: { type: "string" },
      "doc-concurrency": { type: "string" },
      deadline: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help || (!values.input && !values.batch && !(values.doc && values.changes))) {
    console.error(USAGE);
    return values.help ? 0 : 1;
  }

  if (existsSync(".env")) process.loadEnvFile(".env");
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set (see .env.example)");

  const options: Omit<UpdateOptions, "trace"> = {
    ...(values["editor-model"] ? { editorModel: values["editor-model"] } : {}),
    ...(values["planner-model"] ? { plannerModel: values["planner-model"] } : {}),
    ...(values.concurrency ? { concurrency: positiveInt(values.concurrency, "--concurrency") } : {}),
    ...(values.deadline ? { deadlineMs: positiveInt(values.deadline, "--deadline") * 1000 } : {}),
  };
  const trace = values.trace ? traceWriter(values.trace) : undefined;

  if (values.batch) {
    return runBatch(values.batch, values["out-dir"] ?? "out/batch", {
      ...options,
      ...(values["doc-concurrency"] ? { documentConcurrency: positiveInt(values["doc-concurrency"], "--doc-concurrency") } : {}),
      ...(trace ? { trace } : {}),
    });
  }

  const request: UpdateRequest = values.input
    ? await readJson(values.input)
    : { sourceDocument: await readFile(values.doc!, "utf8"), changes: await readJson(values.changes!) };

  const { document, report } = await updateDocument(request, {
    ...options,
    ...(trace ? { trace: (event: TraceEvent) => trace("document", event) } : {}),
  });

  if (values.out) await writeOutput(values.out, document);
  else process.stdout.write(document);
  if (values.report) await writeOutput(values.report, JSON.stringify(report, null, 2) + "\n");

  printReport(report);
  return report.changes.every((change) => SUCCESS.has(change.status)) ? 0 : 2;
}

async function runBatch(dir: string, outDir: string, options: Parameters<typeof updateDocuments>[1]): Promise<number> {
  const files = (await readdir(dir)).filter((file) => extname(file) === ".json").sort();
  if (files.length === 0) throw new Error(`no .json request files found in ${dir}`);
  console.error(`Processing ${files.length} documents from ${dir}`);

  const outcomes = await updateDocuments(
    files.map((file) => ({ id: basename(file, ".json"), load: () => readJson<UpdateRequest>(join(dir, file)) })),
    {
      ...options,
      onDocumentDone: async (outcome) => {
        if (outcome.ok) {
          await writeOutput(join(outDir, `${outcome.id}.md`), outcome.result.document);
          await writeOutput(join(outDir, `${outcome.id}.report.json`), JSON.stringify(outcome.result.report, null, 2) + "\n");
        }
        console.error(`  ${outcome.id}: ${summarize(outcome)}`);
      },
    },
  );

  const summary = outcomes.map((outcome) => ({ id: outcome.id, status: documentStatus(outcome), detail: summarize(outcome) }));
  await writeOutput(join(outDir, "batch-summary.json"), JSON.stringify(summary, null, 2) + "\n");
  const ok = summary.filter((entry) => entry.status === "ok").length;
  console.error(`\n${ok}/${summary.length} documents fully updated. Results in ${outDir}`);
  return ok === summary.length ? 0 : 2;
}

function documentStatus(outcome: BatchOutcome): "ok" | "needs_review" | "error" {
  if (!outcome.ok) return "error";
  return outcome.result.report.changes.every((change) => SUCCESS.has(change.status)) ? "ok" : "needs_review";
}

function summarize(outcome: BatchOutcome): string {
  if (!outcome.ok) return `error: ${outcome.error}`;
  const { changes, usage, timingsMs } = outcome.result.report;
  const statuses = changes.map((change) => change.status).join(", ");
  return `${statuses} | ${usage.calls} calls, ${usage.inputTokens}/${usage.outputTokens} tokens, ${(timingsMs.total / 1000).toFixed(1)}s`;
}

function traceWriter(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  return (documentId: string, event: TraceEvent) => {
    appendFileSync(path, JSON.stringify({ at: new Date().toISOString(), documentId, ...event }) + "\n");
  };
}

async function readJson<T>(path: string): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    throw new Error(`could not read JSON from ${path}: ${describeError(error)}`);
  }
}

function positiveInt(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${flag} must be a positive integer`);
  return parsed;
}

async function writeOutput(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

function printReport(report: UpdateReport) {
  const { usage, timingsMs, documentWords } = report;
  console.error("\nChanges:");
  for (const change of report.changes) {
    console.error(`  [${change.status.padEnd(14)}] ${change.index}. ${change.change}`);
    if (!SUCCESS.has(change.status)) change.notes.forEach((note) => console.error(`      - ${note}`));
  }
  console.error(
    `\nWords: ${documentWords.before} -> ${documentWords.after} | ` +
      `LLM calls: ${usage.calls} | tokens in/out: ${usage.inputTokens}/${usage.outputTokens} | ` +
      `time: ${(timingsMs.total / 1000).toFixed(1)}s (plan ${timingsMs.plan}ms, local ${timingsMs.local}ms, global ${timingsMs.global}ms)`,
  );
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(describeError(error));
    process.exit(1);
  },
);
