import { blockShape, countFences, extractNumbers, mentionsNumberWord } from "./blocks.ts";
import type { GlobalEdits, LocalEdits, Plan } from "./schemas.ts";
import type { Block } from "./types.ts";

const BLOCK_MARKER = /\[\[B\d+(?:\.\d+)?\]\]/;
const ASSISTANT_PREAMBLE = /^(?:sure|certainly|of course)\b[,!.]|^here(?:'s| is) (?:the|your) (?:updated|revised|rewritten|edited)\b/i;

export function validatePlan(plan: Plan, changeCount: number, knownIds: Set<string>): string[] {
  const errors: string[] = [];
  const seen = new Set<number>();

  for (const entry of plan.changes) {
    if (entry.index < 0 || entry.index >= changeCount) errors.push(`change index ${entry.index} does not exist`);
    if (seen.has(entry.index)) errors.push(`change ${entry.index} is planned more than once`);
    seen.add(entry.index);

    const unknown = entry.blockIds.filter((id) => !knownIds.has(id));
    if (unknown.length > 0) errors.push(`change ${entry.index} references unknown blocks: ${unknown.join(", ")}`);
    if (entry.applicable && entry.scope === "local" && entry.blockIds.length === 0) {
      errors.push(`change ${entry.index} is local and applicable but lists no blocks`);
    }
  }

  for (let i = 0; i < changeCount; i++) {
    if (!seen.has(i)) errors.push(`change ${i} is missing from the plan`);
  }
  return errors;
}

export function validateLocalEdits(
  result: LocalEdits,
  targets: Map<string, Block>,
  changeIndexes: number[],
): string[] {
  const errors: string[] = [];
  const covered = new Set<number>();
  const rewritten = new Set<string>();

  for (const edit of result.edits) {
    const original = targets.get(edit.id);
    if (!original) {
      errors.push(`edit references ${edit.id}, which is not a target block (targets: ${[...targets.keys()].join(", ")})`);
      continue;
    }

    const foreign = edit.changeIndexes.filter((i) => !changeIndexes.includes(i));
    if (foreign.length > 0) errors.push(`edit on ${edit.id} cites unknown change indexes: ${foreign.join(", ")}`);

    if (edit.action === "replace" || edit.action === "delete") {
      if (rewritten.has(edit.id)) errors.push(`block ${edit.id} is replaced or deleted more than once`);
      rewritten.add(edit.id);
    }

    if (edit.action === "replace" || edit.action === "insert_after") {
      errors.push(...checkText(edit.id, edit.text));
      if (edit.action === "replace") errors.push(...checkLengthRatio(edit.id, original.text, edit.text, 0.2, 5));
    }

    const effective = edit.action !== "keep" && !(edit.action === "replace" && edit.text.trim() === original.text.trim());
    if (effective) edit.changeIndexes.forEach((i) => covered.add(i));
  }

  result.unapplied.forEach((entry) => covered.add(entry.changeIndex));
  for (const index of changeIndexes) {
    if (!covered.has(index)) {
      errors.push(`change ${index} has no effective edit; apply it or list it in unapplied with a reason`);
    }
  }
  return errors;
}

export function validateGlobalCoverage(result: GlobalEdits, chunk: Block[]): string[] {
  const expected = chunk.map((block) => block.id).join(", ");
  const actual = result.edits.map((edit) => edit.id).join(", ");
  return expected === actual ? [] : [`edits must cover exactly these block ids in order: ${expected}; received: ${actual}`];
}

export function validateGlobalEdit(edit: GlobalEdits["edits"][number], original: Block, styleOnly: boolean): string[] {
  if (edit.action === "insert_after") return [`${edit.id}: insert_after is not allowed in a document-wide pass`];
  if (edit.action !== "replace") return [];

  const errors = checkText(edit.id, edit.text);
  if (!styleOnly) return errors;

  const before = blockShape(original.text);
  const after = blockShape(edit.text);
  if (before.kind === "code") errors.push(`${edit.id}: code blocks must be kept unchanged`);
  else if (before.kind !== after.kind || before.detail !== after.detail) {
    errors.push(`${edit.id}: structure changed from ${describe(before)} to ${describe(after)}`);
  }

  const diff = diffNumbers(extractNumbers(original.text), extractNumbers(edit.text));
  const missing = diff.missing.filter((n) => !mentionsNumberWord(edit.text, n));
  const added = diff.added.filter((n) => !mentionsNumberWord(original.text, n));
  if (missing.length > 0 || added.length > 0) {
    errors.push(
      `${edit.id}: numbers must be preserved as numerals in a style-only change (missing: ${missing.join(", ") || "none"}; added: ${added.join(", ") || "none"}). Keep every original number and do not introduce new ones; use words instead (e.g. "around the clock", not "24/7").`,
    );
  }
  errors.push(...checkLengthRatio(edit.id, original.text, edit.text, 0.5, 2));
  return errors;
}

function diffNumbers(before: string[], after: string[]) {
  const remaining = [...after];
  const missing: string[] = [];
  for (const n of before) {
    const i = remaining.indexOf(n);
    if (i === -1) missing.push(n);
    else remaining.splice(i, 1);
  }
  return { missing, added: remaining };
}

function checkText(id: string, text: string): string[] {
  const errors: string[] = [];
  if (text.trim().length === 0) errors.push(`${id}: text is empty`);
  if (BLOCK_MARKER.test(text)) errors.push(`${id}: text contains a block marker`);
  if (ASSISTANT_PREAMBLE.test(text.trim())) errors.push(`${id}: text contains conversational preamble`);
  if (countFences(text) % 2 !== 0) errors.push(`${id}: unbalanced code fence`);
  return errors;
}

function checkLengthRatio(id: string, before: string, after: string, min: number, max: number): string[] {
  if (before.length < 80) return [];
  const ratio = after.length / before.length;
  return ratio < min || ratio > max ? [`${id}: length changed by an implausible factor (${ratio.toFixed(2)}x)`] : [];
}

function describe(shape: { kind: string; detail: number }): string {
  return shape.detail ? `${shape.kind}(${shape.detail})` : shape.kind;
}
