export interface UpdateRequest {
  sourceDocument: string;
  changes: string[];
}

export interface Block {
  id: string;
  text: string;
  separator: string;
}

export type EditAction = "replace" | "delete" | "insert_after" | "keep";

export interface Edit {
  id: string;
  action: EditAction;
  text: string;
}

export type ChangeScope = "local" | "global";

export type ChangeStatus = "applied" | "partial" | "failed" | "not_applicable" | "ambiguous";

export interface ChangeReport {
  index: number;
  change: string;
  scope: ChangeScope | null;
  status: ChangeStatus;
  blockIds: string[];
  notes: string[];
}

export interface TokenUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

export interface UpdateReport {
  changes: ChangeReport[];
  usage: TokenUsage;
  timingsMs: { plan: number; local: number; global: number; total: number };
  documentWords: { before: number; after: number };
}

export interface UpdateResult {
  document: string;
  report: UpdateReport;
}
