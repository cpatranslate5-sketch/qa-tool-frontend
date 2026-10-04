export interface Manager {
  id: number;
  name: string;
  is_admin: boolean;
}

export interface Project {
  id: number;
  name: string;
  created_by_name: string;
  // Admin-written project description (subject area, audience, special
  // requirements) — sent to the AI with every check in this project.
  description?: string;
  // «Заказчик» this project belongs to (2026-10-04) — its styleguide applies.
  client_id?: number | null;
}

export interface ClientEntry {
  id: number;
  name: string;
  projects: { id: number; name: string }[];
}

// One styleguide section's value: {text} for AI sections, {level, form,
// avoid, note} for tone, {items} for terms, the switches for "auto".
export type SgValue = Record<string, any>;
export type SgRules = Record<string, Record<string, SgValue>>; // lang -> section -> value

export interface SgChange {
  id: number;
  lang: string;
  lang_label: string;
  section: string;
  section_title: string;
  before: SgValue | null;
  after: SgValue | null;
  changed_by_name: string;
  created_at: string | null;
}

export interface SgMeta {
  langs: { key: string; label: string }[];
  sections: { key: string; title: string; kind: "ai" | "algo" }[];
  tone_levels: Record<string, string>;
  quote_kinds: Record<string, string>;
  range_signs: Record<string, string>;
  range_spaces: Record<string, string>;
  em_dash_modes: Record<string, string>;
  auto_default: SgValue;
}

export interface ClientStyleguide {
  client: ClientEntry;
  rules: SgRules;
  history: SgChange[];
}

export interface ProjectStyleguide {
  project: { id: number; name: string };
  client: ClientEntry | null;
  client_rules: SgRules;
  own: SgRules;
  history: SgChange[];
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
  // Only present on a "register_summary" finding — which tone of address
  // ("вы"/formal or "ты"/informal) is the majority across the checked text,
  // so the UI can colorize that word (blue for formal, orange for informal)
  // instead of just showing the plain message string.
  register_majority?: "formal" | "informal" | null;
  // The project's styleguide requirement for the tone (2026-10-04).
  register_requirement?: string;
  // Only present on a "register_summary" finding, and only when there are
  // MAX_EXCEPTIONS_WITH_TEXT (3) or fewer rows that break from the majority
  // tone — the actual translated text of each exception row, so the UI can
  // show what was actually written (highlighted red) instead of just its
  // row number. null/absent when there are more than 3 exceptions (see
  // register_exception_labels below) or no exceptions at all.
  register_exceptions?: { label: string | number; text: string }[] | null;
  // Only present on a "register_summary" finding, and only when there are
  // MORE than MAX_EXCEPTIONS_WITH_TEXT (3) exception rows — falls back to
  // just the row numbers/labels (the old plain-text behavior), since
  // listing every exception's full text would be unwieldy past that point.
  register_exception_labels?: (string | number)[] | null;
  // Set by the backend's automatic post-check "second opinion" pass (see
  // app.claude_client.run_second_opinion) — Sonnet-only since 2026-09-27
  // — a 0-100 validity percent. Absent (not 0) when that opinion never
  // came through at all (Sonnet's API key isn't configured, or its call
  // failed) — the report page's "Отфильтровать отчёт" filter treats a
  // missing percent as "can't safely judge this, always keep it", never
  // as a low score. Always 100 on an algorithmic finding (type in
  // {numbers, placeholders, max_length, missing, punctuation, emoji,
  // sms_charset}) — set directly by the backend without ever asking a
  // model, so those are guaranteed, not just likely, to survive filtering.
  sonnet_percent?: number;
  // 2026-09-29 redesign: the checking model's OWN confidence (0-100) in
  // this finding — each language is checked by one fixed model, which rates
  // its findings itself; anything under 40 is already dropped by the
  // backend. Always 100 on algorithmic findings. Absent on old reports.
  confidence?: number;
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
  // Which model checked each language, e.g. {"hi": "Claude Opus"}.
  models_by_lang?: Record<string, string>;
  // Cost split per model label, incl. the 18% top-up tax (2026-10-01).
  cost_by_model?: Record<string, number>;
}

export interface MultiCheckResponse {
  multi_check_id: number;
  source_lang: string;
  // "processing" covers two different things now (see the "batch" flag
  // below): a big job handed to Anthropic's cheaper-but-slower batch queue,
  // or (added 2026-09-26) a live/"Срочно" check that's simply running in
  // the background instead of blocking the request — summary/sheets aren't
  // ready yet either way, poll the detail endpoint. "failed" is only ever
  // the second kind (a genuine batch failure surfaces per-language inside
  // the findings instead) — an unexpected error while running the check in
  // the background, see the "error" field below.
  status: "processing" | "completed" | "failed";
  filename?: string;
  summary?: MultiCheckSummary;
  sheets?: MultiCheckSheetResult[];
  // Real Anthropic API cost of this check's AI calls, in USD — only present
  // once status is "completed" (not known yet while "processing").
  cost_usd?: number;
  // Only present while status is "processing" — Anthropic's own count of how
  // many of the batch's per-language requests are done vs. the total, so
  // the UI can show real progress instead of guessing a time estimate
  // (Anthropic doesn't provide an ETA for a batch job). Always null for a
  // live/"Срочно" check (see "batch" below) — there's no external queue to
  // report counts for.
  progress?: { done: number; total: number } | null;
  // Only present while status is "processing" — when Anthropic's own counts
  // above haven't moved yet, the UI falls back to showing elapsed waiting
  // time (computed from this) instead of a static "0%".
  created_at?: string;
  // Only meaningful while status is "processing" — a rough, non-binding ETA
  // in minutes, learned from how long similarly-sized past batch jobs
  // actually took. null/absent until there's history to learn from. Always
  // null for a live/"Срочно" check — see "batch" below.
  estimated_minutes?: number | null;
  // Only present while status is "processing" — true for a real Anthropic
  // batch job, false for a live/"Срочно" check that's merely running in the
  // background (added 2026-09-26, see app.main._run_live_check_background).
  // The UI uses this to pick a much faster poll interval and skip the
  // batch-only "обычно занимает до часа" wording for the live case, which
  // is normally done in well under a minute.
  batch?: boolean;
  // Only present once status is "failed" — a short, human-readable reason,
  // for a live/"Срочно" check that raised an unexpected error while running
  // in the background instead of completing.
  error?: string;
  // Only present once status is "completed" — together with created_at,
  // lets the UI show how long the check actually took.
  completed_at?: string | null;
  // Only present once status is "completed" — the actual criteria keys
  // this check ran with (e.g. only the free algorithmic ones, or also the
  // AI-based ones), so the UI can show a "Критерии: ..." line and make a
  // $0 cost self-explaining instead of looking like something broke.
  checks_run?: string[];
  // True right after status flips to "completed" (both the live-check
  // response and a batch just finishing) while the automatic Sonnet-only
  // second-opinion pass (see app.claude_client.run_second_opinion) is still
  // running in the background — it used to run BEFORE the response was
  // sent, which made checks slow enough that the browser's fetch sometimes
  // gave up ("Failed to fetch") even though the check itself had already
  // finished and saved fine. Findings are shown right away without
  // waiting; sonnet_percent on each Finding just arrives a bit
  // later. The UI polls multi-check detail while this is true (same
  // pattern as status=="processing") until it flips to false. Absent/false
  // for an older record from before this existed, or once the pass has
  // finished.
  second_opinion_pending?: boolean;
  // Manager's per-finding review for the translators' table (2026-09-29):
  // key "<sheet index>|<lang>|<excel row>|<finding index>" →
  // decision ("accept"/"reject") + Crowdin link(s). See reportHtml.ts.
  review?: Record<string, ReviewEntry>;
  // Active translator links for this report, {lang: token} (2026-09-29).
  shares?: Record<string, string>;
  // Translators' answers from their share-link pages (2026-09-30), same keys.
  translator_review?: Record<string, TranslatorEntry>;
  // Blocks of this report already in «Сохранённое» ("<sheet>|<lang>|<row>").
  saved_keys?: string[];
}

export interface TranslatorEntry {
  // "done" = «Правка внесена», "na" = «Не актуально» (older: accept/reject).
  decision: "done" | "na" | "accept" | "reject" | null;
  comment?: string;
  // The manager's tick «проверено» on the share page.
  checked?: boolean;
}

export interface SavedCase {
  id: number;
  project_name: string;
  filename: string;
  lang: string;
  excel_row: number;
  context: string;
  source: string;
  translation: string;
  findings: { type: string; severity: string; message: string }[];
  saved_by_name: string;
  created_at: string | null;
}

export interface ReviewEntry {
  decision: "accept" | "question" | "reject" | null;
  links: string;
  note?: string;
  // Set on the share page by the head of QA (2026-10-01).
  sent?: boolean;
  okk_removed?: boolean;
  okk_comment?: string;
}

export interface MultiCheckHistoryEntry {
  id: number;
  filename: string;
  source_lang: string;
  // See MultiCheckResponse.status — "failed" is only ever a live/"Срочно"
  // check that raised in the background (added 2026-09-26).
  status: "processing" | "completed" | "failed";
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
  // Same meaning as MultiCheckResponse.second_opinion_pending — see there.
  second_opinion_pending?: boolean;
}
