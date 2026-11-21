import { newBlock } from "./blocks.ts";
import type { Block, Edit } from "./types.ts";

export function applyEdits(blocks: Block[], edits: Edit[]): Block[] {
  const byId = new Map<string, Edit[]>();
  for (const edit of edits) byId.set(edit.id, [...(byId.get(edit.id) ?? []), edit]);
  const result: Block[] = [];

  for (const block of blocks) {
    const blockEdits = byId.get(block.id) ?? [];
    const replacement = blockEdits.find((edit) => edit.action === "replace");
    const deleted = blockEdits.some((edit) => edit.action === "delete");

    if (!deleted) result.push(replacement ? { ...block, text: replacement.text.trim() } : block);

    blockEdits
      .filter((edit) => edit.action === "insert_after")
      .forEach((edit, i) => result.push(newBlock(`${block.id}.${i + 1}`, edit.text)));
  }
  return result;
}
