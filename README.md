# LLM-driven document updates

This tool takes a long document and a list of plain-English changes, and uses an LLM to produce the updated document. The LLM only ever sees and rewrites the parts it was asked to change. Everything else is copied through untouched by code.

```ts
updateDocument({ sourceDocument: string, changes: string[] }) → { document: string, report: UpdateReport }
```

## Quick start

```bash
npm install
cp .env.example .env            # add OPENAI_API_KEY
npm run update -- --doc samples/doc.md --changes samples/changes.json --out out/updated.md --report out/report.json
npm run update -- --input samples/batch/northwind-guide.json --out out/updated.md
npm run update -- --batch samples/batch --out-dir out/batch --trace out/trace.jsonl
npm test                        # 25 offline tests against a scripted LLM
npm run typecheck
```

`--input` takes the `{ sourceDocument, changes }` shape from the brief. `--batch` runs every request file in a folder.

The CLI exits with `0` when every change was applied or reported as not applicable, and with `2` when anything needs a human to look at it (`failed`, `partial` or `ambiguous`). A batch runner can route documents on the exit code alone.

Stack: Node 20.12 or later, TypeScript run through `tsx`, the official `openai` SDK (Responses API with Structured Outputs) and `zod`. Those two are the only runtime dependencies.

## Architecture

```
document ──► split into blocks [[B1]]..[[Bn]]                     (code)
               │
               ▼
          PLAN  (1 call, gpt-4.1)                                  full doc in, ~100 tokens out per change
          for each change: applicable? ambiguous? local | global? styleOnly? which block ids?
               │
      ┌────────┴──────────┐
      ▼                   ▼
  LOCAL EDITS          GLOBAL EDITS                                gpt-4.1-mini, parallel
  changes that share   document-wide changes (tone) applied
  blocks are merged    to ~800-word chunks concurrently,
  into one job; only   after local edits land
  target blocks +
  neighbours are sent
      │                   │
      └────────┬──────────┘
               ▼
          VALIDATE every edit (code) ── reject → retry with errors as feedback → fallback model → keep original
               │
               ▼
          APPLY by block id (code) ──► document + per-change report (status, notes, tokens, timings)
```

The document is split on blank lines into blocks with stable ids. Fenced code blocks that contain blank lines stay in one piece. The model answers with edits addressed by id (`replace`, `delete`, `insert_after` or `keep`), and plain code splices them back in. A block the model wasn't asked about is never sent back through the model, so it comes out byte-for-byte identical.

A single planning call reads the whole document once and decides, for each change, which blocks it touches and whether it's local (a price, one paragraph) or document-wide (tone). Local changes that touch the same block are merged into one job so two edits can't conflict. Jobs with no shared blocks run in parallel. Document-wide changes run after the local ones, over ~800-word chunks in parallel.

### Tokens and latency

Output tokens drive both cost and latency, so the design keeps them proportional to how much text changes rather than to the size of the document.

| Change type                         | Input tokens                                                 | Output tokens                         | Latency                                              |
| ----------------------------------- | ------------------------------------------------------------ | ------------------------------------- | ---------------------------------------------------- |
| Local (pricing, delete a paragraph) | the whole doc once for the plan, then only the target blocks | only the edited blocks                | 2 sequential calls, independent of doc size          |
| Document-wide (tone)                | the whole doc                                                | the whole doc, which can't be avoided | chunks run in parallel, so about one chunk's latency |

Measured with `gpt-4.1` as planner and `gpt-4.1-mini` as editor:

| Document    | Changes                     | LLM calls | Tokens in / out | Wall time |
| ----------- | --------------------------- | --------- | --------------- | --------- |
| 777 words   | pricing + legacy API        | 3         | 2.7k / 0.3k     | 4.8s      |
| 9,600 words | pricing + legacy API        | 3         | 14.9k / 0.3k    | 3.3s      |
| 777 words   | pricing + legacy API + tone | 6         | 10.8k / 4.2k    | 26.5s     |
| 9,600 words | pricing + legacy API + tone | 20        | 35.8k / 17.7k   | 26.8s     |

Making the document 12 times larger left the output for local edits flat at about 300 tokens, and the wall time didn't grow. A full rewrite of the 9,600-word document would emit about 13k output tokens on every run, even to change one number, and would take roughly 1.5 to 2 minutes to stream.

## Reliability

I treat the LLM as an untrusted component. Each response passes through five layers.

1. Structured Outputs (`zodTextFormat`) constrain the response shape while the model generates it. The same Zod schema is checked again locally, because refusals, truncated responses (`status: "incomplete"`) and model drift still get through.

2. Code checks what the response means (`src/validation.ts`).
   - The plan must cover every change exactly once and use block ids that exist. A local change that applies must name at least one block.
   - A local edit may only touch its target blocks and may replace or delete each block once. Text can't be empty, contain leftover `[[B12]]` markers, open with chat filler like "Sure, here's the updated…", or leave a code fence unclosed. Length changes beyond 0.2× to 5× are rejected. Every change has to produce at least one real edit or be declared `unapplied` with a reason, so a no-op can't pass as a success.
   - A tone edit must return every block in order. Headings keep their level, lists their item count and tables their row count. Code blocks stay untouched and length stays within 0.5× to 2×. The set of numbers in each block must stay the same, so a "more formal" pass can't turn `$49` into `$59`.

3. A rejected response goes back to the model with the exact errors, for example `B9 is not a target block (targets: B4)` or `numbers must be preserved (missing: 49; added: 59)`. In the tone pass, only the rejected blocks are sent again and blocks that passed are kept. The final attempt switches to the stronger `gpt-4.1`. Network errors and 429s are retried separately by the SDK.

4. When a change still can't be validated, the system keeps the original text for that change and reports why.
   - Failures stay inside their own job. If one change fails, the others still apply.
   - In the tone pass, blocks that passed are applied and only the rejected ones keep their original wording. The change is reported as `partial` with the block ids and reasons.
   - If a change refers to one item ("the paragraph about X") and several blocks match equally well, the planner flags it. Nothing is edited and the change is reported as `ambiguous` with the candidate blocks.
   - Each document has a deadline (180 seconds by default, `--deadline`). Once it passes, no new calls start and open requests are cancelled. Edits that already passed validation are kept. A stuck document can't hold up a batch.
   - Every change ends with one of `applied`, `partial`, `failed`, `not_applicable` or `ambiguous`, plus notes. One bad response never crashes the run.

5. With `--trace out/trace.jsonl`, every rejected output is written as a JSON line with the document id, stage, attempt, model, the reasons and the output itself. Nobody watches a batch run, so this is how you find out afterwards why something was rejected.

### What the checks caught in live runs

On the 9,600-word document, the tone pass sometimes merged an intro sentence with the bullet list below it, moving text between blocks. The structure checks rejected those blocks (`list(3) → paragraph`, `length 5.96x`).

The trace showed the model rewriting "around the clock" as "24/7", adding numbers the source never had. It kept doing so after the first round of feedback. Once the feedback said what to write instead ("use words, e.g. 'around the clock'"), the next attempt was accepted.

One rejection is deliberate. When the model makes "No 3am pages because a cron job died" formal, it drops the "3am" every time. The number check counts that as a lost fact, so after three attempts that paragraph keeps its original wording and the tone change is `partial`. I kept the strict check on purpose: in an unattended system, one slightly informal paragraph costs much less than a fact that quietly disappears.

## Security and operational safeguards

The tool runs unattended in batch, so the risks I planned for are runaway cost, provider rate limits, hostile text inside documents and leaked secrets.

| Risk                                                               | Safeguard                                                                                                                                                                                                                                                                         | Where                         |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Huge or malformed input burning tokens                             | Input is validated before any LLM call. Defaults are 400k characters per document (about 6× the expected 10k words), 50 changes and 2k characters per change. Callers can raise them with `options.limits`.                                                                       | `schemas.ts`                  |
| Retry loops running up cost                                        | Each document has a token budget that scales with its size, with a 50k minimum. When it runs out, no more calls are made, the remaining changes are reported `failed` and their original text is kept.                                                                            | `llm.ts` (`MeteredClient`)    |
| Unbounded model output                                             | `max_output_tokens` is sized to each call's input.                                                                                                                                                                                                                                | `stages.ts`                   |
| Rate limits (429) and server errors                                | The OpenAI SDK retries with exponential backoff and respects `retry-after` (`maxRetries: 4`). Requests time out after 120 seconds.                                                                                                                                                | `llm.ts`                      |
| Too many parallel requests                                         | Each document is capped at 12 parallel calls, and a semaphore on the client caps in-flight requests at 16. Batch runs share one client, so the cap covers the whole batch.                                                                                                        | `concurrency.ts`, `llm.ts`    |
| Prompt injection in the document ("ignore previous instructions…") | Document text is wrapped in `<document>`, `<target_blocks>` or `<chunk>` tags, and every system prompt says that text is data. If the model is manipulated anyway, it can still only touch the blocks the planner chose, and a tone pass still can't change numbers or structure. | `prompts.ts`, `validation.ts` |
| Leaked secrets                                                     | The API key is read only from the environment. `.env` is gitignored, left out of the zip and never logged.                                                                                                                                                                        | `cli.ts`                      |
| Data retention                                                     | Every request sets `store: false`, so OpenAI doesn't keep responses.                                                                                                                                                                                                              | `llm.ts`                      |
| Vulnerable dependencies                                            | Two runtime dependencies (`openai`, `zod`). `npm audit` reports 0 vulnerabilities.                                                                                                                                                                                                | `package.json`                |

Known limits: a document that literally contains `</chunk>` or text like `[[B12]]` could confuse the model about where blocks begin and end. The id and structure checks limit what that confusion can break, but they don't stop it from happening. The tool writes the model's output to a file and never executes or renders it. Anyone who renders it as HTML should sanitize it first.

## A wrong change that passes every check

The request is "Remove the paragraph about the legacy API", in a document where two paragraphs mention it:

```
[[B6]] The legacy v1 API uses query-string keys and is deprecated.
[[B7]] To migrate off the legacy v1 API, switch to bearer tokens and the /v2 base URL.
```

The model returns:

```json
{ "edits": [{ "id": "B7", "action": "delete", "text": "", "changeIndexes": [0] }], "unapplied": [] }
```

The JSON is valid and matches the schema. B7 is a real target, the delete applies cleanly and it counts as a real edit, so the change is reported `applied`. The wrong paragraph is gone, though: the migration guide was deleted and the description of the deprecated API is still there. The test marked `KNOWN BLIND SPOT` in `test/pipeline.test.ts` reproduces this.

My checks confirm that an edit is well formed and stays inside its allowed blocks. None of them can tell whether the model picked the right paragraph. Deciding which paragraph is "about" the legacy API is a judgement only the LLM makes, and the system trusts the planner's choice. The ambiguity flag exists for this case, but it comes from the same model. If the planner is confidently wrong (`ambiguous: false`, one block), nothing later in the pipeline notices. This nearly happened in a live run: the planner selected both B21 and B22 for deletion, and only the editor's own judgement saved the migration paragraph.

A second real case came from the 9,600-word run. The pricing table rounded $49 × 1.1 = $53.90 up to `$54`, but the annual line became `$539 per year` (53.90 × 10) instead of `$540`. Each number looks reasonable and every check passes, yet the document now contradicts itself. The code has no idea which numbers are derived from which.

## Architectural decisions

The coding agent proposed several other designs. I didn't take these:

- A full-document rewrite checked with a diff afterwards. It's the simplest option, but output tokens grow with the document on every change, it's the slowest, and the diff can only spot drift after you've paid for it. With block ids, unrequested text never goes back through the model, so it can't drift.
- Search-and-replace snippets, where the model quotes the old text and supplies the new text (Aider's approach). This was the strongest alternative, and it needs no splitting step. I didn't use it because models often copy the old text slightly wrong (whitespace, curly quotes) and then the anchor doesn't match. A block id can't be miscopied into a different block that also exists by accident.
- Unified diffs or line-number patches. Models get line numbers and hunk headers wrong often, which is exactly the kind of formatting mistake the brief warns about.
- A separate pipeline for each change, run one after another. It's easier to reason about, but latency grows with every change. One planning call covers all changes instead, and only changes that share blocks are merged into a single job.

What changed partway through:

- The tone pass started out all-or-nothing, so one bad block threw away its whole chunk. On the first live run, a single spelled-out number failed the entire tone change. I switched to keeping the blocks that passed and leaving only the bad ones unchanged.
- The planner correctly picked the annual-price sentence for the 10% increase, but the editor left `$490/$588` stale. I told the editor to keep derived values consistent and to leave over-selected blocks alone, and the next run got it right.
- Tone-pass retries first resent the whole chunk. Resending only the rejected blocks cut the 9,600-word run from 52.4k / 23.8k tokens to 35.8k / 17.7k with the same result.

## Test cases

`npm test` runs 25 tests offline against a scripted LLM:

- Splitting and re-joining a document is byte-for-byte exact, fenced code with blank lines stays whole, and block shapes are classified correctly.
- A local edit applies and every other byte stays the same.
- The local editor receives only the target blocks and their neighbours.
- Malformed JSON gets a retry with feedback and then succeeds. An edit to a block outside the targets is rejected, and the error reaches the retry prompt.
- The last attempt uses the fallback model.
- A failing change doesn't block other changes, and its block keeps the original text.
- A `keep` that does nothing is rejected instead of being counted as applied.
- A change that doesn't apply to the document leaves it unchanged and is reported `not_applicable`.
- A tone edit that alters a price is rejected for that block, the retry resends only that block with the exact error, and the change ends `partial`.
- An ambiguous reference is reported `ambiguous` and no edit call is made.
- An expired deadline stops all calls and returns the original document.
- Every rejected output produces a trace event.
- Deleting the wrong legacy-API paragraph passes every check (the known blind spot).
- A batch with one good, one oversized and one unreadable document finishes the good one and reports the other two.
- Oversized input is rejected before any LLM call and the limits can be raised. A spent token budget stops further calls without crashing. Injected instructions arrive as tagged data. An edit hijacked toward a non-target block is rejected. The semaphore never exceeds its capacity.

Live runs against OpenAI used the 777-word sample and a generated 9,600-word version (`npm run generate:sample`), each with the three example changes from the brief, plus runs with only the local changes. The tables above come from those runs. Output from a batch over `samples/batch/` (both documents plus one with a change that doesn't apply) is in `samples/output/`, including the trace.

## With more time

- Add a verification call that sees the original block, the edit and the instruction, and answers whether the edit does what was asked to the right paragraph. That targets the blind spot above, and its cost grows with the edited blocks, not the whole document.
- Check arithmetic for percentage changes (new value ≈ old value × factor) and flag inconsistent rounding like the $539 vs $540 case.
- Give the planner an outline with short block summaries plus keyword search instead of the full text, so planning input grows more slowly than the document. Order prompts so OpenAI's prompt cache can reuse shared boilerplate across documents.
- Make batches resumable by skipping documents whose output already exists, and add one token budget for the whole batch.
- Teach the tone check to tell a dropped casual detail from a changed fact, so cases like the "3am" paragraph can apply.
- Build an evaluation set of documents with expected outputs to catch accuracy regressions when prompts or models change.

## Layout

```
src/
  pipeline.ts     updateDocument: orchestration, deadline and reporting
  batch.ts        updateDocuments: many documents, shared client, per-document isolation
  stages.ts       planning, local edit jobs, tone pass
  validation.ts   all checks on model output
  structured.ts   structured call with retry, feedback and fallback
  blocks.ts       splitting, rendering, block shapes, number extraction
  apply.ts        splices edits in by block id
  llm.ts          LlmClient interface, OpenAI client, token metering
  prompts.ts, schemas.ts, concurrency.ts, types.ts, cli.ts
test/             node:test suites with a scripted LlmClient
samples/          doc.md (777 words), large-doc.md (9,600 words), changes.json
samples/batch/    request files for batch mode
samples/output/   results and trace from a live batch run
scripts/          generate-large-sample.ts
```
