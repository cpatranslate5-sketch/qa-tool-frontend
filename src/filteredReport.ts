// Builds the "Отфильтровать отчёт" table — Александр's ask, 2026-09-25,
// the second half of the automatic-second-opinion feature (see
// app.claude_client.run_second_opinion on the backend, which attaches
// sonnet_percent/gpt_percent to every real finding before the report ever
// reaches the frontend). Clicking the button on the report page swaps the
// normal per-language block view for a single flat table of only the
// findings worth a translator's attention, dropping the ones neither
// model was convinced by.
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

// The single number shown in "Ср. вероятность ошибки" — the average of
// whichever percent(s) are actually available. null when NEITHER model's
// opinion came through at all (both branches failed) — shouldKeepFinding
// above still keeps such a finding (fail-safe), but there's nothing
// meaningful to average, so the column shows "нет данных" instead of a
// number (see buildFilteredRowHtml).
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
  lang: string;
  toneHtml: string;
  excelRow: number;
  source: string;
  translation: string;
  avg: number | null;
  confidenceHtml: string;
  comment: string;
}

// One row per surviving finding, grouped by language (in the order given,
// normally first-appearance order — same as the rest of the report) then
// by its original row number. A language contributing zero surviving
// findings gets no rows at all here — every finding it had is already
// visible in the normal block view above the button, so nothing is lost,
// just not repeated in this "what's actually worth fixing" table.
function buildFilteredRows(sheets: MultiCheckSheetResult[], langs: string[]): FilteredRow[] {
  const out: FilteredRow[] = [];
  for (const lang of langs) {
    for (const sheet of sheets) {
      const rows = sheet.languages[lang];
      if (!rows) continue;
      const toneFinding = toneFindingForLang(rows);
      const toneHtml = toneCellHtml(toneFinding);
      for (const row of rows) {
        if (row.excel_row === 0) continue; // system/meta rows, never a real finding
        for (const f of row.findings) {
          if (isRegisterSummary(f)) continue;
          if (!shouldKeepFinding(f)) continue;
          out.push({
            lang,
            toneHtml,
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
  }
  return out;
}

export function buildFilteredTableHtml(sheets: MultiCheckSheetResult[], langs: string[]): string {
  const rows = buildFilteredRows(sheets, langs);
  if (rows.length === 0) {
    return `<p class="muted">После фильтрации не осталось находок, требующих внимания.</p>`;
  }
  const body = rows.map(r => `
    <tr>
      <td>${esc(flagForLang(r.lang))} ${esc(r.lang)}</td>
      <td>${r.toneHtml}</td>
      <td>${r.excelRow}</td>
      <td>${esc(r.source)}</td>
      <td>${esc(r.translation)}</td>
      <td>${r.avg == null ? "нет данных" : `${r.avg}%`}</td>
      <td>${r.confidenceHtml}</td>
      <td>${esc(r.comment)}</td>
    </tr>
  `).join("");
  return `
    <table class="filtered-table">
      <thead>
        <tr>
          <th>Язык</th>
          <th>Тон обращения</th>
          <th>№ строки</th>
          <th>Источник</th>
          <th>Перевод</th>
          <th>Ср. вероятность ошибки</th>
          <th>Процент уверенности ИИ</th>
          <th>Комментарий</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}
