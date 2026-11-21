import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyEdits } from "../src/apply.ts";
import { blockShape, parseDocument, renderDocument } from "../src/blocks.ts";
import { chunkBlocks, groupLocalChanges } from "../src/stages.ts";

describe("parseDocument / renderDocument", () => {
  it("round-trips a document byte-for-byte", () => {
    const source = "\n# Title\n\nPara one\nline two\n\n\n- a\n- b\n\n| x |\n| - |\n\nEnd.\n";
    const parsed = parseDocument(source);
    assert.equal(renderDocument(parsed, parsed.blocks), source);
    assert.deepEqual(
      parsed.blocks.map((b) => b.id),
      ["B1", "B2", "B3", "B4", "B5"],
    );
  });

  it("keeps fenced code containing blank lines in a single block", () => {
    const source = "Intro\n\n```js\nconst a = 1;\n\nconst b = 2;\n```\n\nOutro";
    const parsed = parseDocument(source);
    assert.equal(parsed.blocks.length, 3);
    assert.match(parsed.blocks[1]!.text, /const a = 1;\n\nconst b = 2;/);
    assert.equal(renderDocument(parsed, parsed.blocks), source);
  });
});

describe("applyEdits", () => {
  it("replaces, deletes and inserts while leaving other blocks untouched", () => {
    const parsed = parseDocument("A\n\nB\n\nC\n");
    const result = applyEdits(parsed.blocks, [
      { id: "B1", action: "replace", text: "A2" },
      { id: "B2", action: "delete", text: "" },
      { id: "B3", action: "insert_after", text: "D" },
    ]);
    assert.equal(renderDocument(parsed, result), "A2\n\nC\n\nD\n");
  });
});

describe("blockShape", () => {
  it("classifies markdown structures", () => {
    assert.deepEqual(blockShape("## Title"), { kind: "heading", detail: 2 });
    assert.deepEqual(blockShape("1. one\n2. two"), { kind: "list", detail: 2 });
    assert.deepEqual(blockShape("| a |\n| - |\n| 1 |"), { kind: "table", detail: 3 });
    assert.deepEqual(blockShape("Plain text."), { kind: "paragraph", detail: 0 });
  });
});

describe("planning helpers", () => {
  const blocks = parseDocument("a\n\nb\n\nc\n\nd").blocks;
  const entry = (index: number, blockIds: string[]) => ({
    index,
    blockIds,
    applicable: true,
    ambiguous: false,
    scope: "local" as const,
    styleOnly: false,
    rationale: "",
  });

  it("merges local changes that touch the same block into one job", () => {
    const jobs = groupLocalChanges([entry(0, ["B3", "B1"]), entry(1, ["B4"]), entry(2, ["B1"])], blocks);
    assert.deepEqual(jobs, [
      { changeIndexes: [1], blockIds: ["B4"] },
      { changeIndexes: [0, 2], blockIds: ["B1", "B3"] },
    ]);
  });

  it("chunks blocks by word budget", () => {
    assert.deepEqual(
      chunkBlocks(blocks, 2).map((chunk) => chunk.map((b) => b.id)),
      [
        ["B1", "B2"],
        ["B3", "B4"],
      ],
    );
  });
});
