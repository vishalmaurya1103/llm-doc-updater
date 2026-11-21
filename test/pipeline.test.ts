import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { updateDocument } from "../src/pipeline.ts";
import type { TraceEvent } from "../src/structured.ts";
import { DOC, plan, ScriptedLlm } from "./helpers.ts";

const PRICES_UP = {
  id: "B4",
  action: "replace",
  text: "Starter costs $53.90 per month and Team costs $218.90 per month.",
  changeIndexes: [0],
};
const run = (llm: ScriptedLlm, changes: string[]) =>
  updateDocument({ sourceDocument: DOC, changes }, { llm, concurrency: 2 });

describe("updateDocument", () => {
  it("applies a local edit and leaves every other byte untouched", async () => {
    const llm = new ScriptedLlm({
      edit_plan: [plan({ index: 0, blockIds: ["B4"] })],
      local_edits: [{ edits: [PRICES_UP], unapplied: [] }],
    });
    const { document, report } = await run(llm, ["Raise prices by 10%"]);

    assert.equal(document, DOC.replace("$49", "$53.90").replace("$199", "$218.90"));
    assert.equal(report.changes[0]!.status, "applied");
    assert.equal(report.usage.calls, 2);
  });

  it("only sends target blocks and their neighbours to the local editor", async () => {
    const llm = new ScriptedLlm({
      edit_plan: [plan({ index: 0, blockIds: ["B4"] })],
      local_edits: [{ edits: [PRICES_UP], unapplied: [] }],
    });
    await run(llm, ["Raise prices by 10%"]);

    const prompt = llm.callsFor("local_edits")[0]!.messages[1]!.content;
    assert.match(prompt, /\[\[B4\]\]/);
    assert.doesNotMatch(prompt, /\[\[B2\]\]|\[\[B6\]\]|legacy/);
  });

  it("retries with feedback after malformed output and then succeeds", async () => {
    const llm = new ScriptedLlm({
      edit_plan: ["{not json", plan({ index: 0, blockIds: ["B4"] })],
      local_edits: [
        { edits: [{ ...PRICES_UP, id: "B9" }], unapplied: [] },
        { edits: [PRICES_UP], unapplied: [] },
      ],
    });
    const { report } = await run(llm, ["Raise prices by 10%"]);

    assert.equal(report.changes[0]!.status, "applied");
    const retry = llm.callsFor("local_edits")[1]!.messages.at(-1)!.content;
    assert.match(retry, /B9, which is not a target block/);
  });

  it("escalates to the fallback model on the final attempt", async () => {
    const bad = { edits: [{ ...PRICES_UP, text: "" }], unapplied: [] };
    const llm = new ScriptedLlm({
      edit_plan: [plan({ index: 0, blockIds: ["B4"] })],
      local_edits: [bad, bad, bad],
    });
    await run(llm, ["Raise prices by 10%"]);

    assert.deepEqual(
      llm.callsFor("local_edits").map((r) => r.model),
      ["gpt-4.1-mini", "gpt-4.1-mini", "gpt-4.1"],
    );
  });

  it("isolates a failing change: others still apply and the original text is kept", async () => {
    const llm = new ScriptedLlm({
      edit_plan: [plan({ index: 0, blockIds: ["B4"] }, { index: 1, blockIds: ["B6"] })],
      local_edits: [
        { edits: [PRICES_UP], unapplied: [] },
        ...Array(3).fill({
          edits: [{ id: "B6", action: "replace", text: "Sure, here you go!", changeIndexes: [1] }],
          unapplied: [],
        }),
      ],
    });
    const { document, report } = await run(llm, ["Raise prices by 10%", "Reword the legacy API note"]);

    assert.deepEqual(
      report.changes.map((c) => c.status),
      ["applied", "failed"],
    );
    assert.match(document, /\$53\.90/);
    assert.match(document, /The legacy v1 API uses query-string keys and is deprecated\./);
  });

  it("rejects a silent no-op instead of reporting success", async () => {
    const noop = { edits: [{ id: "B4", action: "keep", text: "", changeIndexes: [0] }], unapplied: [] };
    const llm = new ScriptedLlm({
      edit_plan: [plan({ index: 0, blockIds: ["B4"] })],
      local_edits: [noop, noop, noop],
    });
    const { report } = await run(llm, ["Raise prices by 10%"]);

    assert.equal(report.changes[0]!.status, "failed");
    assert.ok(report.changes[0]!.notes.some((note) => note.includes("has no effective edit")));
  });

  it("reports changes that do not apply to the document", async () => {
    const llm = new ScriptedLlm({ edit_plan: [plan({ index: 0, applicable: false })] });
    const { document, report } = await run(llm, ["Remove the section about GraphQL"]);

    assert.equal(document, DOC);
    assert.equal(report.changes[0]!.status, "not_applicable");
  });

  it("rejects a style-only rewrite that alters numbers and retries only that block", async () => {
    const keepAll = (ids: string[]) => ids.map((id) => ({ id, action: "keep", text: "" }));
    const tamperedB4 = {
      id: "B4",
      action: "replace",
      text: "The Starter plan costs $59 per month; the Team plan costs $199 per month.",
    };
    const llm = new ScriptedLlm({
      edit_plan: [plan({ index: 0, scope: "global", styleOnly: true })],
      global_edits: [
        { edits: [...keepAll(["B1", "B2", "B3"]), tamperedB4, ...keepAll(["B5", "B6", "B7"])] },
        { edits: [tamperedB4] },
        { edits: [tamperedB4] },
      ],
    });
    const { document, report } = await run(llm, ["Make the tone more formal"]);

    const retry = llm.callsFor("global_edits")[1]!.messages[1]!.content;
    assert.match(retry, /\[\[B4\]\]/);
    assert.doesNotMatch(retry, /\[\[B2\]\]/);
    assert.match(retry, /missing: 49/);
    assert.equal(report.changes[0]!.status, "partial");
    assert.ok(report.changes[0]!.notes.some((note) => note.includes("left unchanged: B4")));
    assert.equal(document, DOC);
  });

  it("marks a singular reference with several equal matches as ambiguous instead of guessing", async () => {
    const llm = new ScriptedLlm({ edit_plan: [plan({ index: 0, blockIds: ["B6", "B7"], ambiguous: true })] });
    const { document, report } = await run(llm, ["Remove the paragraph about the legacy API"]);

    assert.equal(document, DOC);
    assert.equal(report.changes[0]!.status, "ambiguous");
    assert.equal(llm.callsFor("local_edits").length, 0);
  });

  it("stops at the document deadline and returns the original text", async () => {
    const slow = new ScriptedLlm({ edit_plan: [plan({ index: 0, blockIds: ["B4"] })] });
    const { document, report } = await updateDocument(
      { sourceDocument: DOC, changes: ["Raise prices by 10%"] },
      { llm: slow, signal: AbortSignal.abort() },
    );

    assert.equal(document, DOC);
    assert.equal(slow.requests.length, 0);
    assert.ok(report.changes[0]!.notes.some((note) => note.includes("deadline exceeded")));
  });

  it("emits a trace event for every rejected output", async () => {
    const events: TraceEvent[] = [];
    const llm = new ScriptedLlm({
      edit_plan: ["{not json", plan({ index: 0, blockIds: ["B4"] })],
      local_edits: [{ edits: [PRICES_UP], unapplied: [] }],
    });
    await updateDocument({ sourceDocument: DOC, changes: ["Raise prices"] }, { llm, trace: (e) => events.push(e) });

    assert.equal(events.length, 1);
    assert.deepEqual(
      { stage: events[0]!.stage, attempt: events[0]!.attempt, output: events[0]!.output },
      { stage: "edit_plan", attempt: 1, output: "{not json" },
    );
  });

  it("KNOWN BLIND SPOT: deleting the wrong legacy-API paragraph passes every check", async () => {
    const llm = new ScriptedLlm({
      edit_plan: [plan({ index: 0, blockIds: ["B7"] })],
      local_edits: [{ edits: [{ id: "B7", action: "delete", text: "", changeIndexes: [0] }], unapplied: [] }],
    });
    const { document, report } = await run(llm, ["Remove the paragraph about the legacy API"]);

    assert.equal(report.changes[0]!.status, "applied");
    assert.match(document, /The legacy v1 API uses query-string keys/);
    assert.doesNotMatch(document, /To migrate off the legacy v1 API/);
  });
});
