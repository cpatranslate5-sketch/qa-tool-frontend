// Renders a completed multi-check result as a standalone HTML page and opens
// it in a new browser tab — Александр asked for check reports to open on
// their own page instead of inside the current check screen. Building a
// real static HTML document (rather than adding client-side routing, which
// this project has none of) means no new dependency and no backend route:
// every value the page needs is already in the MultiCheckResponse we
// already fetched.
import { describeChecksRu, flagForLang, formatCostRu, formatDurationRu, SEVERITY_LABEL, TYPE_LABEL } from "./lang";
import type { MultiCheckResponse } from "./types";

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const REPORT_CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px 16px 60px;
    background: #f5f6f8; color: #1c2230;
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
  }
  .page { max-width: 880px; margin: 0 auto; }
  h1 { font-size: 1.4rem; margin: 0 0 6px; }
  h3 { font-size: 1.05rem; margin: 24px 0 4px; }
  .muted { color: #6b7280; font-size: 0.88rem; }
  .info-box {
    background: #fff7e0; border: 1px solid #f0d98c; color: #6b5600;
    border-radius: 8px; padding: 10px 14px; margin: 14px 0; font-size: 0.85rem;
  }
  .lang-block { margin-top: 16px; }
  .lang-block-title {
    font-size: 0.9rem; font-weight: 700; margin: 0 0 8px;
    padding-bottom: 4px; border-bottom: 1px solid #dde1e7;
  }
  .lang-block-title.has-findings { color: #b45309; }
  .lang-results { display: flex; flex-direction: column; gap: 12px; }
  .multi-row {
    background: #fff; border: 1px solid #dde1e7; border-radius: 10px; padding: 12px 14px;
  }
  .multi-row-header { font-weight: 600; font-size: 0.85rem; margin-bottom: 6px; }
  .pair { font-size: 0.85rem; color: #444b58; margin-bottom: 8px; display: flex; flex-direction: column; gap: 2px; }
  .finding {
    border-left: 3px solid #ccc; padding: 6px 10px; margin-top: 6px; font-size: 0.85rem; background: #fafafa;
  }
  .finding-high { border-left-color: #d64545; }
  .finding-medium { border-left-color: #d98a1f; }
  .finding-low { border-left-color: #8a93a3; }
  .finding-severity { font-weight: 700; margin-right: 8px; }
  .finding-type { color: #6b7280; font-size: 0.75rem; text-transform: uppercase; }
  .finding-message { margin-top: 4px; }
  .lang-filter-bar { display: flex; flex-wrap: wrap; gap: 6px; margin: 14px 0 4px; }
  .lang-filter-btn {
    background: #fff; border: 1px solid #dde1e7; border-radius: 999px; color: #1c2230;
    cursor: pointer; font-size: 0.82rem; padding: 5px 12px;
  }
  .lang-filter-btn:hover { border-color: #6366f1; }
  .lang-filter-btn.active { background: #6366f1; border-color: #6366f1; color: #fff; font-weight: 600; }
`;

export function buildReportHtml(result: MultiCheckResponse): string {
  const summary = result.summary;
  const sheets = result.sheets || [];
  const unrecognized = sheets.flatMap(s => s.unrecognized_columns);
  const titleText = result.filename ? `Отчёт — ${result.filename}` : "Отчёт проверки";

  const sheetsHtml = sheets.map(sheet => {
    const langsHtml = sheet.languages_checked.map(lang => {
      const rows = sheet.languages[lang] || [];
      const rowsHtml = rows.length === 0
        ? `<div class="muted">Проблем не найдено.</div>`
        : rows.map(row => `
            <div class="multi-row">
              <div class="multi-row-header">Строка ${row.excel_row} — ${esc(row.context || "без контекста")}</div>
              <div class="pair">
                <div><strong>Источник:</strong> ${esc(row.source)}</div>
                <div><strong>Перевод:</strong> ${esc(row.translation)}</div>
              </div>
              ${row.findings.map(f => `
                <div class="finding finding-${esc(f.severity)}">
                  <span class="finding-severity">${esc(SEVERITY_LABEL[f.severity] || f.severity)}</span>
                  <span class="finding-type">${esc(TYPE_LABEL[f.type] || f.type)}</span>
                  <div class="finding-message">${esc(f.message)}</div>
                </div>
              `).join("")}
            </div>
          `).join("");
      return `
        <div class="lang-block" data-lang="${esc(lang)}">
          <h4 class="lang-block-title ${rows.length > 0 ? "has-findings" : ""}">${esc(flagForLang(lang))} ${esc(lang)} — ${rows.length > 0 ? `${rows.length} найдено` : "без проблем"}</h4>
          <div class="lang-results">${rowsHtml}</div>
        </div>
      `;
    }).join("");

    return `
      <div class="sheet-block">
        ${sheets.length > 1 ? `<h3>${esc(sheet.sheet_name)}</h3>` : ""}
        ${langsHtml}
      </div>
    `;
  }).join("");

  // Every language checked across every sheet, in first-appearance order —
  // drives the "Все" / per-language filter buttons below, same behavior as
  // the on-screen results in CheckRunner.tsx (this page has no framework,
  // so the filtering itself happens via plain JS at the bottom instead of
  // React state).
  const allLangs = [...new Set(sheets.flatMap(s => s.languages_checked))];
  // Language codes are attacker-reachable (they come straight from a
  // column header in whatever .xlsx someone uploads — excel_multi.py's
  // _normalize_lang_label deliberately keeps almost anything short and
  // space-free rather than validating it against a known set), so the
  // filter value is carried ONLY via the data-lang attribute (HTML-escaped
  // by esc(), which is a value-safe context) and read back in the
  // <script> below through .dataset — never interpolated into an inline
  // onclick="...(...)" string, which would additionally need JS-string
  // escaping (esc() alone doesn't do that: it neutralizes "<>&"'" for HTML
  // parsing, but the attribute is later handed to the JS parser too, and a
  // language code containing e.g. a quote or "//" could break out of the
  // intended call and run arbitrary script in the report page).
  const filterBarHtml = allLangs.length > 1 ? `
    <div class="lang-filter-bar">
      <button type="button" class="lang-filter-btn active" data-lang="all">Все</button>
      ${allLangs.map(l => `<button type="button" class="lang-filter-btn" data-lang="${esc(l)}">${esc(flagForLang(l))} ${esc(l)}</button>`).join("")}
    </div>
  ` : "";

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(titleText)}</title>
<style>${REPORT_CSS}</style>
</head>
<body>
  <div class="page">
    <h1>${esc(titleText)}</h1>
    ${summary ? `<p class="muted">Исходный язык: ${esc(result.source_lang)}. Строк проверено: ${summary.rows_checked}. Найдено проблем: ${summary.total_findings} в ${summary.languages_checked.length} языках.${result.cost_usd != null ? ` Стоимость: ${esc(formatCostRu(result.cost_usd))}.` : ""}${(() => { const d = formatDurationRu(result.created_at, result.completed_at); return d ? ` Заняла: ${esc(d)}.` : ""; })()}${(() => { const c = describeChecksRu(result.checks_run); return c ? ` Критерии: ${esc(c)}.` : ""; })()}</p>` : ""}
    ${unrecognized.length > 0 ? `<div class="info-box">Не распознаны как языки (пропущены): ${esc(unrecognized.join(", "))}</div>` : ""}
    ${filterBarHtml}
    ${sheetsHtml}
  </div>
  <script>
    // Narrows the always-visible breakdown down to one language's findings
    // — "Все" (the default, matching the active button on load) shows
    // everything, same as before this existed. Reads the target language
    // from the clicked button's own data-lang attribute (never from a
    // string built server-side and handed to an inline onclick="...") —
    // a language code comes straight from an uploaded file's column
    // header, so it isn't trustworthy enough to interpolate into a script
    // string.
    function filterLang(lang, btn) {
      document.querySelectorAll(".lang-block").forEach(function (el) {
        el.hidden = lang !== "all" && el.getAttribute("data-lang") !== lang;
      });
      document.querySelectorAll(".sheet-block").forEach(function (el) {
        var anyVisible = Array.prototype.some.call(el.querySelectorAll(".lang-block"), function (lb) {
          return !lb.hidden;
        });
        el.hidden = !anyVisible;
      });
      document.querySelectorAll(".lang-filter-btn").forEach(function (b) {
        b.classList.toggle("active", b === btn);
      });
    }
    document.querySelectorAll(".lang-filter-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        filterLang(btn.dataset.lang, btn);
      });
    });
  </script>
</body>
</html>`;
}

// Opens a blank tab synchronously (so it isn't blocked as a popup — it must
// happen before any `await`), then fills it in once the report data is
// ready. Returns false when the tab couldn't be opened at all (a strict
// popup blocker), so the caller can fall back to showing the report inline
// instead of silently doing nothing.
export async function openReportInNewTab(fetchDetail: () => Promise<MultiCheckResponse>): Promise<boolean> {
  const win = window.open("", "_blank");
  if (!win) return false;
  try {
    const result = await fetchDetail();
    win.document.open();
    win.document.write(buildReportHtml(result));
    win.document.close();
  } catch {
    win.document.open();
    win.document.write(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8" /><title>Отчёт</title></head><body><p>Не удалось загрузить отчёт.</p></body></html>`);
    win.document.close();
  }
  return true;
}
