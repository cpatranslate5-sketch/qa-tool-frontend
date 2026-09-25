// Builds the "Отфильтровать отчёт" table — Александр's ask, 2026-09-25,
// the second half of the automatic-second-opinion feature (see
// app.claude_client.run_second_opinion on the backend, which attaches
// sonnet_percent/gpt_percent to every real finding before the report ever
// reaches the frontend). Clicking the button on the report page swaps the
// normal per-language block view for a table of only the findings worth a
// translator's attention, dropping the ones neither model was convinced by.
//
// Filtering rule (confirmed with Александр step by step, 2026-09-25): a
// finding is REMOVED only when the average of the two percents is below
// 49 AND the lower of the two is below 40 — UNLESS the higher of the two
// is above 69, which overrides removal (one model being confident enough
// is enough to keep it, even if the other disagrees). Anything else stays.
// A finding missing either model's percent at all (that model's key
// wasn't configured, or its call failed — see run_second_opinion) is
// ALWAYS kept — there's no safe basis to remove something neither model
// actually got to judge.
//
// A second, stricter rule was added the same day for Indian-language rows
// specifically (Александр's follow-up ask): for hi/mr/te/hing/bd, a finding
// is ALSO removed whenever Claude's own sonnet_percent is under 49 — even
// if the rule above would otherwise have kept it (e.g. a high GPT score
// clearing the max>69 override). Only Claude's score triggers this — GPT's
// doesn't — and, same fail-safe as above, a finding with no sonnet_percent
// at all is never removed by this rule (nothing safe to compare 49 against).
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
// module's own top comment for the exact rule. Algorithmic findings
// always have sonnet_percent === gpt_percent === 100 (set directly in
// backend code, never by asking a model — see rule_checks.RULE_BASED_TYPES
// and run_second_opinion's own comment), so avg=100 always clears the
// keep threshold on its own; no special-casing needed here for them.
export function shouldKeepFinding(f: Finding): boolean {
  const { sonnet_percent: s, gpt_percent: g } = f;
  if (s == null || g == null) return true;
  const avg = (s + g) / 2;
  const min = Math.min(s, g);
  const max = Math.max(s, g);
  if (avg < 49 && min < 40 && !(max > 69)) return false;
  return true;
}

// Александр's ask (2026-09-25, same day as the button itself): for these
// specific target languages, additionally require Claude's OWN score to
// clear 49 — see this module's top comment for the exact scope. Matched by
// base subtag (before any "-region"), same normalization the backend uses
// for its own hard-language list (claude_client.HARD_LANGUAGE_BASES), so a
// regional variant of one of these still counts.
const INDIAN_LANG_BASES = new Set(["hi", "mr", "te", "hing", "bd"]);

function isIndianLang(lang: string): boolean {
  return INDIAN_LANG_BASES.has(lang.trim().toLowerCase().split("-")[0]);
}

// Combines the general keep rule above with the Indian-language-only
// stricter one — the single predicate buildFilteredGroups actually filters
// by, so the two rules can never accidentally be applied out of order or
// only partially.
function survivesFilter(lang: string, f: Finding): boolean {
  if (!shouldKeepFinding(f)) return false;
  if (isIndianLang(lang) && f.sonnet_percent != null && f.sonnet_percent < 49) return false;
  return true;
}

// The single number shown in "Ср. вероятность ошибки" — the average of
// whichever percent(s) are actually available. null when NEITHER model's
// opinion came through at all (both branches failed) — shouldKeepFinding
// above still keeps such a finding (fail-safe), but there's nothing
// meaningful to average, so the column shows "нет данных" instead of a
// number (see buildFilteredTableHtml).
export function avgPercent(f: Finding): number | null {
  const { sonnet_percent: s, gpt_percent: g } = f;
  if (s == null && g == null) return null;
  if (s == null) return g!;
  if (g == null) return s;
  return Math.round((s + g) / 2);
}

// "Claude – 85%; GPT – 20%" — whichever side is above 50 shown in green
// (Александр's ask), a missing side shown as "нет данных" instead of a
// guessed number.
function confidenceCellHtml(f: Finding): string {
  const part = (label: string, pct: number | undefined): string => {
    if (pct == null) return `${label} — нет данных`;
    const cls = pct > 50 ? ' class="pct-good"' : "";
    return `${label} — <span${cls}>${pct}%</span>`;
  };
  return `${part("Claude", f.sonnet_percent)}; ${part("GPT", f.gpt_percent)}`;
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
  avg: number | null;
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
            avg: avgPercent(f),
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
          <td>${r.avg == null ? "нет данных" : `${r.avg}%`}</td>
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
          <th>Ср. вероятность ошибки</th>
          <th>Процент уверенности ИИ</th>
          <th>Комментарий</th>
        </tr>
      </thead>
      ${bodyHtml}
      <tbody>
        <tr id="filtered-empty-row" hidden>
          <td colspan="9" class="muted">После фильтрации не осталось находок, требующих внимания.</td>
        </tr>
      </tbody>
    </table>
  `;
}
