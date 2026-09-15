export interface Manager {
  id: number;
  name: string;
  is_admin: boolean;
}

export interface Project {
  id: number;
  name: string;
  tone_filename: string;
  tone_uploaded_at: string | null;
  created_by_name: string;
}

export interface ToneStatus {
  filename: string;
  uploaded_at: string | null;
  rule_count: number;
}

// One taught spelling in the global language-alias dictionary — see
// api.ts listLanguageAliases/addLanguageAlias/deleteLanguageAlias and
// LanguageAliases.tsx. Global (not per-project) and open to every folder,
// not just admin — matches the backend's non-admin-gated design.
export interface LanguageAlias {
  id: number;
  alias: string;
  canonical_code: string;
  added_by_name: string;
  created_at: string | null;
}

export interface Finding {
  type: string;
  severity: "low" | "medium" | "high";
  message: string;
}

export interface SingleCheckHistoryEntry {
  id: number;
  source_lang: string;
  target_lang: string;
  source: string;
  translation: string;
  checks_run: string[];
  findings: Finding[];
  performed_by_name: string;
  created_at: string;
  // Real Anthropic API cost of this check's AI calls, in USD (0 when it only
  // used free rule-based criteria).
  cost_usd: number;
}

export interface MultiCheckRowResult {
  excel_row: number;
  context: string;
  source: string;
  translation: string;
  findings: Finding[];
}

export interface MultiCheckSheetResult {
  sheet_name: string;
  source_lang: string;
  languages_checked: string[];
  languages: Record<string, MultiCheckRowResult[]>;
  unrecognized_columns: string[];
}

export interface MultiCheckSummary {
  sheets: number;
  rows_checked: number;
  languages_checked: string[];
  total_findings: number;
}

export interface MultiCheckResponse {
  multi_check_id: number;
  source_lang: string;
  // "processing" means a big job was handed to Anthropic's cheaper-but-slower
  // batch queue — summary/sheets aren't ready yet, poll the detail endpoint.
  status: "processing" | "completed";
  filename?: string;
  summary?: MultiCheckSummary;
  sheets?: MultiCheckSheetResult[];
  // Real Anthropic API cost of this check's AI calls, in USD — only present
  // once status is "completed" (not known yet while "processing").
  cost_usd?: number;
  // Only present while status is "processing" — Anthropic's own count of how
  // many of the batch's per-language requests are done vs. the total, so
  // the UI can show real progress instead of guessing a time estimate
  // (Anthropic doesn't provide an ETA for a batch job).
  progress?: { done: number; total: number } | null;
  // Only present while status is "processing" — when Anthropic's own counts
  // above haven't moved yet, the UI falls back to showing elapsed waiting
  // time (computed from this) instead of a static "0%".
  created_at?: string;
  // Only meaningful while status is "processing" — a rough, non-binding ETA
  // in minutes, learned from how long similarly-sized past batch jobs
  // actually took. null/absent until there's history to learn from.
  estimated_minutes?: number | null;
  // Only present once status is "completed" — together with created_at,
  // lets the UI show how long the check actually took.
  completed_at?: string | null;
  // Only present once status is "completed" — the actual criteria keys
  // this check ran with (e.g. only the free algorithmic ones, or also the
  // AI-based ones), so the UI can show a "Критерии: ..." line and make a
  // $0 cost self-explaining instead of looking like something broke.
  checks_run?: string[];
}

export interface MultiCheckHistoryEntry {
  id: number;
  filename: string;
  source_lang: string;
  status: "processing" | "completed";
  // {} (empty) while status is "processing" — the backend hasn't computed
  // a summary yet at that point, so every field is optional here.
  summary: Partial<MultiCheckSummary>;
  performed_by_name: string;
  created_at: string;
  // 0 while status is "processing" — real cost isn't known until the batch
  // finishes.
  cost_usd: number;
  // Only present while status is "processing" — real done/total counts
  // from Anthropic, refreshed each time the history list is loaded (see
  // MultiCheckResponse.progress for the same shape on the detail screen).
  progress?: { done: number; total: number } | null;
  // Same rough, non-binding ETA as MultiCheckResponse.estimated_minutes,
  // only meaningful while status is "processing".
  estimated_minutes?: number | null;
  // Only present once status is "completed" — together with created_at,
  // lets the history row show how long the check actually took.
  completed_at?: string | null;
}
