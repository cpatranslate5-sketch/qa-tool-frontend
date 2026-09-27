// Builds the "Отфильтровать отчёт" table — Александр's ask, 2026-09-25,
// the second half of the automatic-second-opinion feature (see
// app.claude_client.run_second_opinion on the backend, which attaches
// sonnet_percent to every real finding before the report ever reaches the
// frontend). Clicking the button on the report page swaps the normal
// per-language block view for a table of only the findings worth a
// translator's attention, dropping the ones Claude wasn't convinced by.
//
// Filtering rule, Sonnet-only since 2026-09-27 (Александр removed GPT from
// this step entirely — Step 1's search still uses GPT, this filtering pass
// no longer does): a finding is REMOVED when sonnet_percent is below 40.
// This is the original two-model rule (average below 49 AND the lower of
// the two below 40, unless the higher was above 69) reduced to a single
// score — plugging the same value in for both models collapses that
// formula to exactly "below 40", so the threshold carries over unchanged
// rather than being picked fresh. A finding missing sonnet_percent
// entirely (Sonnet's key wasn't configured, or its call failed — see
// run_second_opinion) is ALWAYS kept — there's no safe basis to remove
// something Claude never got to judge.
//
// A second, stricter rule was added 2026-09-25 for Indian-language rows
// specifically (Александр's follow-up ask): for hi/mr/te/hing/bd, a finding
// is instead removed whenever sonnet_percent is under 49 (still only
// Claude's score — that part of the rule never depended on GPT to begin
// with), same fail-safe for a missing percent.
//
// Each language's rows render in their own <tbody data-lang="xx"> (see
// buildFilteredTableHtml) so reportHtml.ts's language filter bar can show
// or hide one language's findings at a time in this table too, not just
// the normal blocks view — Александр's ask: "Отфильтровать отчёт" should
// only build the currently-open language's table, and the whole report's
// when "Все" is selected. "№ ошибки" is numbered per language (starting
// over at 1 for each one) precisely so switching between "Все" and a single
// language never makes the numbers jump around — a given finding's number
// is fixed at build time, independent of what's currently shown/hidden.
import { flagForLang, registerSummarySegments } from "./lang";
import type { Finding, MultiCheckRowResult, MultiCheckSheetResult } from "./types";

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isRegisterSummary(f: Finding): boolean {
  return f.type === "register_summary";
}

// Whether a finding should survive "Отфильтровать отчёт" — see this
// module's own top comment for the exact rule. Algorithmic findings always
// have sonnet_percent === 100 (set directly in backend code, never by
// asking a model — see rule_checks.RULE_BASED_TYPES and run_second_
// opinion's own comment), so they always clear the keep threshold on their
// own; no special-casing needed here for them.
export function shouldKeepFinding(f: Finding): boolean {
  const s = f.sonnet_percent;
  if (s == null) return true;
  return s >= 40;
}

// Александр's ask (2026-09-25, same day as the button itself): for these
// specific target languages, require Claude's score to clear 49 instead of
// 40 — see this module's top comment for the exact scope. Matched by base
// subtag (before any "-region"), same normalization the backend uses for
// its own hard-language list (claude_client.HARD_LANGUAGE_BASES), so a
// regional variant of one of these still counts.
const INDIAN_LANG_BASES = new Set(["hi", "mr", "te", "hing", "bd"]);

function isIndianLang(lang: string): boolean {
  return INDIAN_LANG_BASES.has(lang.trim().toLowerCase().split("-")[0]);
}

// Combines the general keep rule above with the Indian-language-only
// stricter threshold — the single predicate buildFilteredGroups actually
// filters by, so the two rules can never accidentally be applied out of
// order or only partially.
function survivesFilter(lang: string, f: Finding): boolean {
  const s = f.sonnet_percent;
  if (s == null) return true;
  const threshold = isIndianLang(lang) ? 49 : 40;
  return s >= threshold;
}

// "Процент уверенности ИИ" cell content — Claude's own percent, shown in
// green above 50 (Александр's ask), or "нет данных" when it never came
// through (Sonnet's key wasn't configured, or its call failed).
function confidenceCellHtml(f: Finding): string {
  const pct = f.sonnet_percent;
  if (pct == null) return "нет данных";
  const cls = pct > 50 ? ' class="pct-good"' : "";
  return `<span${cls}>${pct}%</span>`;
}

function toneFindingForLang(rows: MultiCheckRowResult[]): Finding | null {
  const row = rows.find(r => r.findings.length === 1 && isRegisterSummary(r.findings[0]));
  return row ? row.findings[0] : null;
}

function toneCellHtml(toneFinding: Finding | null): string {
  if (!toneFinding) return "не проверялся";
  return registerSummarySegments(toneFinding)
    .map(seg => (seg.color ? `<span style="color:${esc(seg.color)};font-weight:600">${esc(seg.text)}</span>` : esc(seg.text)))
    .join("");
}

interface FilteredRow {
  errorNumber: number;
  excelRow: number;
  source: string;
  translation: string;
  confidenceHtml: string;
  comment: string;
}

// One group per language, each holding only its own surviving findings —
// Александр's ask (2026-09-25): "Тон обращения" merges into a single cell
// spanning all of a language's rows (see buildFilteredTableHtml's rowspan),
// and the table itself is split into one <tbody> per language so the
// report page's language filter can show/hide one at a time. Every
// language in `langs` gets computed here even when nothing survives
// filtering for it (an empty `rows` array) — buildFilteredTableHtml then
// simply renders no <tbody> for it, and the shared "nothing survived" row
// covers that language same as it covers the whole table being empty.
interface FilteredLangGroup {
  lang: string;
  toneHtml: string;
  rows: FilteredRow[];
}

function buildFilteredGroups(sheets: MultiCheckSheetResult[], langs: string[]): FilteredLangGroup[] {
  return langs.map(lang => {
    const rows: FilteredRow[] = [];
    let toneHtml: string | null = null;
    let n = 0;
    for (const sheet of sheets) {
      const sheetRows = sheet.languages[lang];
      if (!sheetRows) continue;
      // Only the FIRST sheet that actually has a tone finding for this
      // language sets the group's one merged cell — in the overwhelming
      // majority of uploads there's exactly one sheet per language to
      // begin with, so this only matters at all for a rare multi-sheet
      // file, and even then a single merged cell has to pick one value.
      if (toneHtml === null) {
        const toneFinding = toneFindingForLang(sheetRows);
        if (toneFinding) toneHtml = toneCellHtml(toneFinding);
      }
      for (const row of sheetRows) {
        if (row.excel_row === 0) continue; // system/meta rows, never a real finding
        for (const f of row.findings) {
          if (isRegisterSummary(f)) continue;
          if (!survivesFilter(lang, f)) continue;
          n += 1;
          rows.push({
            errorNumber: n,
            excelRow: row.excel_row,
            source: row.source,
            translation: row.translation,
            confidenceHtml: confidenceCellHtml(f),
            comment: f.message,
          });
        }
      }
    }
    return { lang, toneHtml: toneHtml ?? "не проверялся", rows };
  });
}

export function buildFilteredTableHtml(sheets: MultiCheckSheetResult[], langs: string[]): string {
  const groups = buildFilteredGroups(sheets, langs);
  const bodyHtml = groups
    .filter(g => g.rows.length > 0)
    .map(g => {
      const trs = g.rows.map((r, i) => `
        <tr data-lang="${esc(g.lang)}">
          <td>${r.errorNumber}</td>
          <td>${r.excelRow}</td>
          <td>${esc(flagForLang(g.lang))} ${esc(g.lang)}</td>
          ${i === 0 ? `<td rowspan="${g.rows.length}">${g.toneHtml}</td>` : ""}
          <td>${esc(r.source)}</td>
          <td>${esc(r.translation)}</td>
          <td>${r.confidenceHtml}</td>
          <td>${esc(r.comment)}</td>
        </tr>
      `).join("");
      return `<tbody data-lang="${esc(g.lang)}">${trs}</tbody>`;
    }).join("");
  // Always shown in the DOM (never a separate early-return paragraph the
  // way this used to work) so reportHtml.ts's updateFilteredVisibility can
  // reveal it purely by toggling `hidden`, whether NOTHING survived
  // filtering anywhere, or just nothing survived for whichever single
  // language is currently selected.
  return `
    <table class="filtered-table" id="filtered-table">
      <thead>
        <tr>
          <th>№ ошибки</th>
          <th>№ строки</th>
          <th>Язык</th>
          <th>Тон обращения</th>
          <th>Источник</th>
          <th>Перевод</th>
          <th>Процент уверенности ИИ</th>
          <th>Комментарий</th>
        </tr>
      </thead>
      ${bodyHtml}
      <tbody>
        <tr id="filtered-empty-row" hidden>
          <td colspan="8" class="muted">После фильтрации не осталось находок, требующих внимания.</td>
        </tr>
      </tbody>
    </table>
  `;
}
