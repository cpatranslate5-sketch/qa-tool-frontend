export interface Manager {
  id: number;
  name: string;
  is_admin: boolean;
}

export interface Project {
  id: number;
  name: string;
  glossary: string;
  created_by_name: string;
}

export interface Language {
  id: number;
  lang_code: string;
}

export interface Finding {
  type: string;
  severity: "low" | "medium" | "high";
  message: string;
}

export interface SingleCheckHistoryEntry {
  id: number;
  source: string;
  translation: string;
  checks_run: string[];
  findings: Finding[];
  performed_by_name: string;
  created_at: string;
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
  summary: MultiCheckSummary;
  sheets: MultiCheckSheetResult[];
}

export interface MultiCheckHistoryEntry {
  id: number;
  filename: string;
  source_lang: string;
  summary: MultiCheckSummary;
  performed_by_name: string;
  created_at: string;
}
