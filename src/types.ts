export interface Manager {
  id: number;
  name: string;
  is_admin: boolean;
}

export interface Project {
  id: number;
  name: string;
  glossary_filename: string;
  glossary_uploaded_at: string | null;
  tone_filename: string;
  tone_uploaded_at: string | null;
  created_by_name: string;
}

export interface GlossaryStatus {
  filename: string;
  uploaded_at: string | null;
  term_count: number;
}

export interface ToneStatus {
  filename: string;
  uploaded_at: string | null;
  rule_count: number;
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
}
