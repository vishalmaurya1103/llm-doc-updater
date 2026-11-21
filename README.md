# LLM-Driven Document Updates

Applies a list of natural-language changes to a long document using an LLM, without letting the LLM rewrite (or silently damage) the parts it was not asked to touch.

```ts
updateDocument({ sourceDocument: string, changes: string[] }) → { document: string, report: UpdateReport }
```

## Quick start

```bash
npm install
cp .env.example .env            # add OPENAI_API_KEY
npm run update -- --doc samples/doc.md --changes samples/changes.json --out out/updated.md --report out/report.json
npm run update -- --input samples/request.json --out out/updated.md   # { sourceDocument, changes } shape
npm run update -- --batch samples/batch --out-dir out/batch --trace out/trace.jsonl
npm test                        # 25 offline tests, scripted LLM
npm run typecheck
```

The CLI exits `0` when every change was applied (or reported as not applicable) and `2` when anything needs review (`failed`, `partial`, `ambiguous`), so batch runners can route documents for follow-up without parsing output.

**Batch mode** (`--batch <dir>`) processes every request JSON in a folder with bounded document concurrency (`--doc-concurrency`, default 4) through **one shared OpenAI client**, so the in-flight request cap holds across the whole batch. Each document is isolated: a malformed, oversized, or failing document is recorded in `batch-summary.json` (`ok | needs_review | error`) and the rest continue. Results are written as each document finishes, so a crash mid-batch keeps completed work. Library equivalent: `updateDocuments(items, options)`.

Stack: Node ≥ 20.12, TypeScript (run via `tsx`), the official `openai` SDK (Responses API with Structured Outputs), and `zod` for schemas. No other runtime dependencies.

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

**Key idea: the LLM never re-emits text that isn't changing.** The document is split on blank lines into blocks with stable ids (fenced code blocks that contain blank lines stay whole). The model returns edits addressed by id (`replace | delete | insert_after | keep`), and plain code splices them in. Untouched blocks are byte-for-byte identical by construction, so the model cannot drift unrelated text.

### Token and latency scaling

Output tokens dominate both cost and latency, so the design keeps them proportional to *what changes*, not to document size.

| Change type | Input tokens | Output tokens | Latency |
|---|---|---|---|
| Local (pricing, delete a paragraph) | O(doc) once for the plan + O(target blocks) | O(edited blocks) | 2 sequential calls, independent of doc size |
| Global (tone) | O(doc) | O(doc), unavoidable | chunks run in parallel, so roughly one chunk's latency |

Measured with `gpt-4.1` (planner) and `gpt-4.1-mini` (editor):

| Document | Changes | LLM calls | Tokens in / out | Wall time |
|---|---|---|---|---|
| 777 words | pricing + legacy API | 3 | 2.7k / 0.3k | 4.8s |
| **9,600 words** | pricing + legacy API | 3 | 14.9k / **0.3k** | **3.3s** |
| 777 words | pricing + legacy API + tone | 6 | 10.8k / 4.2k | 26.5s |
| **9,600 words** | pricing + legacy API + tone | 20 | 35.8k / 17.7k | 26.8s |

The last row was 52.4k / 23.8k tokens before tone-pass retries were changed to resend **only the rejected blocks** instead of the whole chunk: about 30% fewer tokens for the same result.

A 12× larger document left local-edit output tokens flat (~300) and latency unchanged. For comparison, a naive full rewrite of the 9,600-word document would emit ~13k output tokens on *every* run, even for a one-number change, and stream them sequentially (roughly 1.5–2 minutes).

## Reliability

The LLM is treated as an untrusted component. Every response goes through these layers:

1. **Structured Outputs** (`zodTextFormat`) constrain the shape at decode time. The same Zod schema is then re-validated locally, because refusals, truncation (`status: "incomplete"`), and SDK/model drift still happen.
2. **Semantic validation in code** (`src/validation.ts`):
   - Plan: every change planned exactly once, block ids exist, an applicable local change names at least one block.
   - Local edits: only target ids may be touched; no block replaced or deleted twice; no empty text, leftover `[[B12]]` markers, conversational preamble ("Sure, here's the updated…"), or unbalanced code fences; implausible length ratios are rejected; **every change must produce at least one effective edit or be explicitly declared `unapplied` with a reason**, so a no-op can't pass as success.
   - Style-only global edits (tone): one edit per block, in order; heading level, list item count, and table row count preserved; code blocks untouched; **the multiset of numbers preserved**, so a "formal tone" pass cannot change `$49` to `$59`; length within 0.5–2×.
3. **Retry with feedback.** Rejected output goes back to the model alongside the exact errors, for example `B9 is not a target block (targets: B4)` or `numbers must be preserved (missing: 49; added: 59)`. In the tone pass, **only the rejected blocks are resent**; blocks that passed are kept. The last attempt escalates to the stronger model (`gpt-4.1`). Transport errors and 429s are retried separately by the SDK (`maxRetries: 4`).
4. **Graceful degradation, never a silent bad apply.**
   - Failures are isolated per job: if one change can't be validated, the others still apply and its blocks keep their original text.
   - In global passes, valid blocks from a failed chunk are kept and only the invalid blocks fall back to the original. The change is reported as `partial`, with the block ids and reasons.
   - **Ambiguity is reported, not guessed.** When a change names one item ("*the* paragraph about X") and several blocks match equally well, the planner flags it, nothing is edited, and the change is reported as `ambiguous` with the candidate block ids.
   - **Per-document deadline** (default 180s, `--deadline`): once it passes, no new calls start and in-flight requests are aborted. Edits already validated are kept, the rest keep their original text, and the report says why. One stuck document can't stall a batch.
   - Every outcome lands in the report as `applied | partial | failed | not_applicable | ambiguous` with notes. Nothing is dropped quietly, and the run never hard-fails on one bad response.
5. **Debug trace** (`--trace out/trace.jsonl`): every rejected LLM output is appended as a JSON line with document id, stage, attempt, model, the rejection reasons, and the output itself. In unattended batch runs this is how you find out *why* something was rejected without re-running it.

### What the checks catch in practice (live runs)

- On the 9,600-word document, the tone pass sometimes **merged an intro sentence with the bullet list after it**, shifting content between blocks. Structure checks rejected those blocks (`list(3) → paragraph`, `length 5.96x`). After retries, 3 of 347 blocks were kept as original and the change was marked `partial` rather than corrupting the document.
- On the first live run, one block in the support section failed the number check after a "formal" rewrite (consistent with a numeral being spelled out). Number words 0–20 are now accepted as equivalent to their numerals, and the prompt asks the model to keep numerals.
- The trace showed the model rewriting "around the clock" as **"24/7"**, which introduces numbers the source never had, and repeating it even after feedback. Making the feedback say what to do instead ("use words, e.g. 'around the clock'") fixed it on the next attempt.
- The trace also shows a deliberate trade-off. Made formal, "No 3am pages because a cron job died" consistently loses the "3am" detail. The number check treats that as dropping a fact, so after three attempts that one paragraph keeps its original wording and the change is `partial`. I chose to keep the strict check: in an unattended system, a slightly informal paragraph is a much cheaper failure than a silently removed fact.

## Security and operational safeguards

This runs unattended in batch, so the main risks are runaway cost, provider rate limits, hostile document content, and leaked secrets.

| Risk | Safeguard | Where |
|---|---|---|
| Huge or malformed input burning tokens | Input validated with Zod **before any LLM call**. Defaults: 400k characters per document (about 6× the expected 10k words), 50 changes, 2k characters per change. Overridable through `options.limits` | `schemas.ts` |
| Runaway cost from retry loops | **Per-document token budget** (default scales with document size, minimum 50k tokens). Once spent, no further calls are made; the remaining changes are reported `failed` and the original text is kept (no throw) | `llm.ts` (`MeteredClient`) |
| Unbounded model output | `max_output_tokens` sized to each call's input | `stages.ts` |
| Provider rate limits (429) and 5xx errors | The OpenAI SDK retries with exponential backoff and honours `retry-after` (`maxRetries: 4`); 120-second request timeout | `llm.ts` |
| Too many parallel requests | Per-document concurrency cap (`concurrency`, default 12) plus a **semaphore on the client** (`maxInFlight`, default 16). Batch jobs share one `OpenAiClient`, so the cap holds across all documents | `concurrency.ts`, `llm.ts` |
| Prompt injection inside the document ("ignore previous instructions…") | Document text goes in `<document>` / `<target_blocks>` / `<chunk>` tags, and every system prompt states it is data, not instructions. More importantly, a manipulated model **still can't do damage**: it can only touch block ids the planner selected, and style passes can't change numbers or structure | `prompts.ts`, `validation.ts` |
| Secrets | API key read only from the environment (`.env` is gitignored and excluded from the zip); never logged | `cli.ts` |
| Data retention | `store: false` on every request, so OpenAI doesn't store responses | `llm.ts` |
| Vulnerable dependencies | Two runtime dependencies (`openai`, `zod`); `npm audit` reports 0 vulnerabilities | `package.json` |

Known limits: a document that literally contains `</chunk>` or `[[B12]]`-style text could confuse the model's view of block boundaries. The id and structure checks contain the damage, but they don't prevent the confusion. The model's output is written to a file and never executed or rendered by this tool; sanitizing it is the consumer's responsibility if they render it as HTML.

## A wrong change that passes every check

Request: *"Remove the paragraph about the legacy API"*, in a document with two paragraphs that mention it:

```
[[B6]] The legacy v1 API uses query-string keys and is deprecated.
[[B7]] To migrate off the legacy v1 API, switch to bearer tokens and the /v2 base URL.
```

Model output:

```json
{ "edits": [{ "id": "B7", "action": "delete", "text": "", "changeIndexes": [0] }], "unapplied": [] }
```

It is valid JSON, matches the schema, references a real target id, deletes cleanly, and counts as an effective edit for the change. The status is `applied`, yet the **wrong paragraph** is gone: the migration guide was removed and the deprecated-API description remains. This is encoded as a test (`KNOWN BLIND SPOT` in `test/pipeline.test.ts`).

**Why it isn't caught:** the planner's ambiguity flag exists for exactly this case, but it is the same model's judgement. If the planner is *confidently* wrong (`ambiguous: false`, one block), nothing downstream can tell. Every code check verifies that an edit is *well-formed and confined* (right shape, allowed ids, structure and numbers preserved). None verifies that the model chose the *right referent*. "Which paragraph is *about* the legacy API" is a semantic judgment that only the LLM makes, and the system trusts the planner's choice of blocks. This nearly happened in a live run: the planner selected both B21 and B22 for deletion, and only the editor's judgment kept the migration paragraph.

A second real example from the 9,600-word run: the pricing table was rounded to `$54` (49 × 1.1 = 53.90), but the annual line became `$539 per year` (unrounded 53.90 × 10), not `$540`. Each number is individually plausible and every check passes, but the document is now internally inconsistent. Code has no notion of which numbers are derived from which.

## Architectural decisions

**Alternatives proposed by the coding agent and not taken:**

- **Full-document rewrite with a diff check.** This is the simplest design, but output tokens scale with the document on every change, it is the slowest option, and the diff check can only *detect* drift after paying for it. Block-addressed edits make drift structurally impossible.
- **Search/replace snippets** (the model quotes exact old text and gives new text, Aider-style). This was a strong candidate and needs no pre-splitting. Rejected because LLMs frequently mis-copy the "old" text (whitespace, smart quotes), which makes anchors fail to match. Ids can't be mis-copied in a way that silently matches the wrong place.
- **Unified diffs / line-number patches.** Models are unreliable at line arithmetic and hunk headers, which is exactly the "formatting mistakes" failure mode this task warns about.
- **One full pipeline per change, run sequentially.** Simpler to reason about, but latency multiplies with the number of changes. Instead, a single plan call covers all changes, and changes that touch overlapping blocks are merged into one edit job (so two edits to the same paragraph can't conflict), while disjoint jobs run in parallel.

**What changed partway through:**

- Global chunks were originally **all-or-nothing**: one invalid block discarded the whole chunk. The first live run showed a single spelled-out number failing the entire tone change. I switched to per-block salvage: valid blocks from the last attempt are applied, invalid ones keep their original text, and the change is reported as `partial`.
- The planner correctly selected the annual-price block, but the editor didn't update it (`$490/$588` stayed stale after a 10% increase). I added explicit instructions to keep derived values consistent and to leave over-selected targets untouched. This fixed it on the next run.

## Test cases

**Offline** (`npm test`, scripted LLM, no network, 25 tests):

- Splitting and rendering round-trips byte-for-byte, keeps fenced code with blank lines whole, and classifies block shapes.
- Local edit applies, and every other byte is unchanged.
- The local editor only receives target blocks and their neighbours (the token bound).
- Malformed JSON, then retry with feedback, then success; an edit to a non-target id is rejected, and the error text reaches the retry prompt.
- The final attempt escalates to the fallback model.
- One failing change doesn't block another; the failed block keeps its original text.
- A silent no-op (`keep`) is rejected instead of being reported as applied.
- An inapplicable change returns the document unchanged with `not_applicable`.
- A style-only pass that alters a price is rejected for that block, the retry resends **only that block** with the exact error, and the change is reported as `partial`.
- An ambiguous singular reference is reported as `ambiguous`, with no edit call made.
- An expired deadline stops all calls and returns the original document.
- Every rejected output produces a trace event.
- **Known blind spot:** deleting the wrong legacy-API paragraph passes every check.
- Batch: a good, an oversized, and an unreadable document in one batch; the bad ones are isolated and the good one completes.
- Security: oversized input is rejected before any LLM call; limits can be overridden; an exhausted token budget stops further calls and degrades gracefully; injected instructions are passed as tagged data; a hijacked edit to a non-target block is rejected; the semaphore never exceeds its capacity.

**Live** (OpenAI): the sample document (777 words) and a generated 9,600-word version (`npm run generate:sample`), each with the three example changes, plus local-only runs. Results are in the tables above. A batch run over `samples/batch/` (both documents plus one with an inapplicable change) is in `samples/output/batch/`, including the trace.

## With more time

- **Semantic verification pass:** a cheap second call that sees the original target, the edit, and the instruction, and answers "does this implement the change, and did it pick the right referent?" This targets the blind spot above. It costs O(edited blocks), not O(doc).
- **Derived-value checks:** verify arithmetic relationships for percentage changes (a new value ≈ old value × factor) and flag inconsistent rounding.
- **Smaller planner input:** send an outline with block summaries plus keyword search instead of the full document, so planning input scales sub-linearly. Also order prompts for OpenAI prompt caching across documents that share boilerplate.
- **Resumable batches:** skip documents whose output already exists, and add a shared token budget across the whole batch.
- **Fact-aware tone checks:** distinguish "dropped a colloquial detail" from "changed a fact", so cases like the "3am" paragraph can apply instead of degrading to `partial`.
- An eval set of documents with expected outputs, to measure accuracy regressions when prompts or models change.

## Layout

```
src/
  pipeline.ts     updateDocument: orchestration, deadline, and reporting
  batch.ts        updateDocuments: many documents, shared client, per-document isolation
  stages.ts       plan, local edit jobs, global chunk pass
  validation.ts   all semantic checks
  structured.ts   structured call with retry, feedback and fallback
  blocks.ts       split/render, block shapes, number extraction
  apply.ts        splice edits by block id
  llm.ts          LlmClient interface, OpenAI client, token metering
  prompts.ts, schemas.ts, concurrency.ts, types.ts, cli.ts
test/             node:test suites with a scripted LlmClient
samples/          doc.md (777 words), large-doc.md (9,600 words), changes.json, request.json
scripts/          generate-large-sample.ts
```
