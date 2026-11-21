import type { Block } from "./types.ts";

export interface ParsedDocument {
  leading: string;
  trailing: string;
  blocks: Block[];
}

const BLANK_LINE_RUN = /(\n[ \t]*\n\s*)/;
const FENCE_LINE = /^\s*(```|~~~)/gm;
const DEFAULT_SEPARATOR = "\n\n";

export function parseDocument(source: string): ParsedDocument {
  const normalized = source.replace(/\r\n?/g, "\n");
  const leading = /^\s*/.exec(normalized)?.[0] ?? "";
  const body = normalized.slice(leading.length);
  if (body.length === 0) return { leading, trailing: "", blocks: [] };

  const parts = body.split(BLANK_LINE_RUN);
  const segments: { text: string; separator: string }[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const raw = parts[i] ?? "";
    const text = raw.trimEnd();
    segments.push({ text, separator: raw.slice(text.length) + (parts[i + 1] ?? "") });
  }

  const merged = mergeOpenFences(segments);
  const last = merged.at(-1);
  const trailing = last?.separator ?? "";
  if (last) last.separator = DEFAULT_SEPARATOR;

  return {
    leading,
    trailing,
    blocks: merged.map((segment, i) => ({ id: `B${i + 1}`, ...segment })),
  };
}

function mergeOpenFences(segments: { text: string; separator: string }[]) {
  const merged: { text: string; separator: string }[] = [];
  let open: { text: string; separator: string } | undefined;

  for (const segment of segments) {
    if (open) {
      open.text += open.separator + segment.text;
      open.separator = segment.separator;
    } else {
      open = { ...segment };
    }
    if (countFences(open.text) % 2 === 0) {
      merged.push(open);
      open = undefined;
    }
  }
  if (open) merged.push(open);
  return merged;
}

export function countFences(text: string): number {
  return text.match(FENCE_LINE)?.length ?? 0;
}

export function renderDocument(doc: Pick<ParsedDocument, "leading" | "trailing">, blocks: Block[]): string {
  if (blocks.length === 0) return doc.leading + doc.trailing;
  const body = blocks.map((block, i) => block.text + (i === blocks.length - 1 ? "" : block.separator)).join("");
  return doc.leading + body + doc.trailing;
}

export function renderTagged(blocks: Block[]): string {
  return blocks.map((block) => `[[${block.id}]]\n${block.text}`).join("\n\n");
}

export function newBlock(id: string, text: string): Block {
  return { id, text: text.trim(), separator: DEFAULT_SEPARATOR };
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export type BlockKind = "heading" | "code" | "table" | "list" | "quote" | "paragraph";

export interface BlockShape {
  kind: BlockKind;
  detail: number;
}

export function blockShape(text: string): BlockShape {
  const trimmed = text.trim();
  if (/^#{1,6}\s/.test(trimmed)) return { kind: "heading", detail: /^#+/.exec(trimmed)![0].length };
  if (/^(```|~~~)/.test(trimmed)) return { kind: "code", detail: 0 };

  const lines = trimmed.split("\n");
  if (lines.every((line) => line.trimStart().startsWith("|"))) return { kind: "table", detail: lines.length };
  if (/^([-*+]|\d+[.)])\s/.test(trimmed)) {
    return { kind: "list", detail: lines.filter((line) => /^([-*+]|\d+[.)])\s/.test(line)).length };
  }
  if (trimmed.startsWith(">")) return { kind: "quote", detail: 0 };
  return { kind: "paragraph", detail: 0 };
}

const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
];

export function extractNumbers(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,/g, "")).sort();
}

export function mentionsNumberWord(text: string, numeral: string): boolean {
  const word = NUMBER_WORDS[Number(numeral)];
  return word !== undefined && new RegExp(`\\b${word}\\b`, "i").test(text);
}
