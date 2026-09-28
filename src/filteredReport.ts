// The report's TABLE view (toggle "📋 Показать таблицей" on the report page).
//
// 2026-09-29 redesign (Александр): no model filters the report any more on
// the frontend. Each language is checked by one fixed model, which rates
// its own confidence per finding, and the backend already drops everything
// under 40% — so this table simply shows every finding the backend kept,
// with that model's own percent. The old Sonnet "second opinion" threshold
// (40, or 49 for Indian languages) is gone; old reports that only carry
// sonnet_percent show it as-is, unfiltered.
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
export function shouldKeepFinding(_f: Finding): boolean {
  return true;
}

function survivesFilter(_lang: string, _f: Finding): boolean {
  return true;
}

// "Процент уверенности ИИ" cell: the checking model's own percent (older
// reports: the former second-opinion percent), green above 50.
function confidenceCellHtml(f: Finding): string {
  const pct = typeof f.confidence === "number" ? f.confidence : f.sonnet_percent;
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
// filtering for it (an empty `rows` array) — buildFilteredTableHtml still
// renders a <tbody> for it in that case, a single row showing just the
// language and its tone of address (Александр's ask, 2026-09-27: tone of
// address must stay visible for a language even when it has no remaining
// findings — a manager checking a clean language shouldn't lose that fact
// just because there's nothing else to show).
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
    .map(g => {
      // No surviving findings for this language — still show its tone of
      // address rather than dropping the language from the table entirely
      // (Александр's ask, 2026-09-27). One plain row, no rowspan needed
      // since there's nothing else to span it across.
      if (g.rows.length === 0) {
        return `
          <tbody data-lang="${esc(g.lang)}">
            <tr data-lang="${esc(g.lang)}">
              <td>—</td>
              <td>—</td>
              <td>${esc(flagForLang(g.lang))} ${esc(g.lang)}</td>
              <td>${g.toneHtml}</td>
              <td colspan="4" class="muted">Проблем не найдено.</td>
            </tr>
          </tbody>
        `;
      }
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
  // reveal it purely by toggling `hidden`. filtered-empty-row below is now
  // only ever the fallback for the degenerate case of zero checked
  // languages — every real language always has its own <tbody> (with a
  // "Проблем не найдено" row when nothing survived filtering for it), so
  // switching to any real language never falls through to it anymore.
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
          <td colspan="8" class="muted">Проблем не найдено.</td>
        </tr>
      </tbody>
    </table>
  `;
}
