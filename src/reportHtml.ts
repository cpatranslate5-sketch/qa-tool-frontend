// Renders a completed multi-check result as a standalone HTML page and opens
// it in a new browser tab — Александр asked for check reports to open on
// their own page instead of inside the current check screen. Building a
// real static HTML document (rather than adding client-side routing, which
// this project has none of) means no new dependency and no backend route:
// every value the page needs is already in the MultiCheckResponse we
// already fetched.
import { alsoRowsSegments, describeChecksRu, describeModelsRu, findingConfidence, findingCountInRows, flagForLang, formatCostRu, formatDurationRu, realRowCount, registerSummarySegments, SEVERITY_LABEL, TYPE_LABEL } from "./lang";
import { buildFilteredTableHtml } from "./filteredReport";
import { multiCheckReportUrl } from "./api";
import type { Finding, MultiCheckResponse } from "./types";

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// One finding, as HTML — mirrors CheckRunner.tsx's FindingRow: a
// "register_summary" entry (the tone-of-address actually used, see
// app.claude_client.build_register_report) is pure information, not a
// problem the model found, so it's shown as a plain line with no severity/
// type badge instead of going through the normal colored-severity
// template. Its majority word («вы»/«ты») is colorized (blue/orange), and,
// when the finding carries actual exception text, each exception's real
// wording is shown highlighted red instead of just its row number — both
// per Александр's ask (2026-09-17); see lang.ts's registerSummarySegments.
function findingHtml(f: Finding): string {
  if (f.type === "register_summary") {
    const segments = registerSummarySegments(f);
    const inner = segments
      .map(seg => (seg.color ? `<span style="color:${esc(seg.color)};font-weight:600">${esc(seg.text)}</span>` : esc(seg.text)))
      .join("");
    return `<div class="finding finding-info">${inner}</div>`;
  }
  const messageInner = alsoRowsSegments(f.message)
    .map(seg => (seg.color ? `<span style="color:${esc(seg.color)};font-weight:600">${esc(seg.text)}</span>` : esc(seg.text)))
    .join("");
  return `
    <div class="finding finding-${esc(f.severity)}">
      <span class="finding-severity">${esc(SEVERITY_LABEL[f.severity] || f.severity)}</span>
      <span class="finding-type">${esc(TYPE_LABEL[f.type] || f.type)}</span>
      ${findingConfidence(f) != null ? `<span class="finding-type" title="Уверенность модели в этой находке">${findingConfidence(f)}%</span>` : ""}
      <div class="finding-message">${messageInner}</div>
    </div>
  `;
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
  .finding-info { border-left-color: #6366f1; }
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
  .lang-filter-btn.has-findings:not(.active) { border-color: #b45309; color: #b45309; font-weight: 600; }
  .filter-toggle-btn {
    background: #1c2230; border: none; border-radius: 999px; color: #fff;
    cursor: pointer; font-size: 0.85rem; padding: 7px 16px; margin: 4px 0 14px;
  }
  .filter-toggle-btn:hover { opacity: 0.9; }
  .filtered-table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 0.82rem; background: #fff; }
  .filtered-table th, .filtered-table td { border: 1px solid #dde1e7; padding: 6px 8px; text-align: left; vertical-align: top; }
  .filtered-table thead { background: #f0f1f4; }
  .pct-good { color: #17703c; font-weight: 700; }
  .download-link {
    display: inline-block; color: #6366f1; text-decoration: none;
    font-size: 0.85rem; margin: 10px 0 4px; font-weight: 600;
  }
  .download-link:hover { text-decoration: underline; }
`;

// projectId/managerId: only needed for the "Скачать отчёт (Excel)" link
// (Александр's ask, 2026-09-25 — being able to download the Excel version
// from the already-open report tab, not just from the check screen it was
// opened from) — undefined omits that link entirely rather than building a
// broken URL, for any caller that genuinely doesn't have them.
export function buildReportHtml(result: MultiCheckResponse, projectId?: number, managerId?: number): string {
  const summary = result.summary;
  const sheets = result.sheets || [];
  const unrecognized = sheets.flatMap(s => s.unrecognized_columns);
  const titleText = result.filename ? `Отчёт — ${result.filename}` : "Отчёт проверки";

  const sheetsHtml = sheets.map(sheet => {
    const langsHtml = sheet.languages_checked.map(lang => {
      const rows = sheet.languages[lang] || [];
      const realCount = realRowCount(rows);
      const rowsHtml = rows.length === 0
        ? `<div class="muted">Проблем не найдено.</div>`
        : rows.map(row => `
            <div class="multi-row">
              <div class="multi-row-header">Строка ${row.excel_row} — ${esc(row.context || "без контекста")}</div>
              <div class="pair">
                <div><strong>Источник:</strong> ${esc(row.source)}</div>
                <div><strong>Перевод:</strong> ${esc(row.translation)}</div>
              </div>
              ${row.findings.map(findingHtml).join("")}
            </div>
          `).join("");
      return `
        <div class="lang-block" data-lang="${esc(lang)}">
          <h4 class="lang-block-title ${realCount > 0 ? "has-findings" : ""}">${esc(flagForLang(lang))} ${esc(lang)} — ${realCount > 0 ? `${realCount} найдено` : "без проблем"}</h4>
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
  // How many actual findings (not rows) this language has, summed across
  // every sheet it appears in — shown on the filter button ("HI (4)"), so a
  // problem language stands out before scrolling down to it. See
  // lang.ts's findingCountInRows for why this counts findings, not rows.
  const findingsCountByLang: Record<string, number> = {};
  sheets.forEach(sheet => {
    sheet.languages_checked.forEach(lang => {
      const rows = sheet.languages[lang] || [];
      findingsCountByLang[lang] = (findingsCountByLang[lang] || 0) + findingCountInRows(rows);
    });
  });
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
      ${allLangs.map(l => {
        const count = findingsCountByLang[l] || 0;
        const cls = count > 0 ? "lang-filter-btn has-findings" : "lang-filter-btn";
        return `<button type="button" class="${cls}" data-lang="${esc(l)}">${esc(flagForLang(l))} ${esc(l)}${count > 0 ? ` (${count})` : ""}</button>`;
      }).join("")}
    </div>
  ` : "";

  // "Отфильтровать отчёт" — Александр's ask (2026-09-25): a second, more
  // opinionated view of the SAME data, built entirely client-side (the
  // backend already attached sonnet_percent to every finding — see
  // app.claude_client.run_second_opinion, Sonnet-only since 2026-09-27)
  // that collapses the normal per-language blocks into a table of only the
  // findings Claude was convinced by (see filteredReport.ts for the exact
  // rule, plus the Indian-language-only stricter threshold), with columns
  // matching what Александр asked the FINAL report to consist of
  // (2026-09-26, revised 2026-09-27 to drop the averaged-percent column
  // now that only one model's score exists): № ошибки, № строки, Язык, Тон
  // обращения, Источник, Перевод, Процент уверенности ИИ, Комментарий. One
  // <tbody> per language inside it, so the language filter bar (via
  // updateFilteredVisibility in the <script> below) can show just one
  // language's filtered rows at a time, the same way it already narrows
  // the normal blocks view.
  //
  // This is now the view the report OPENS on by default (see
  // isFilteredDefault below) — it's meant to BE the report, not an optional
  // extra a manager has to remember to click into. The old "📋 Скопировать"
  // buttons (copyReport.ts) that used to sit above this — copy the whole
  // report to the clipboard, paste it into any AI chat, get back a hand-
  // built table shaped like this one — are gone (Александр's ask,
  // 2026-09-26: "они больше не нужны, т.к. ты это сам запрашиваешь на
  // этапе разбора отчёта"), since that manual step is now fully redundant
  // with this automatic one: run_second_opinion already IS a real,
  // automated Sonnet pass that reads a whole language's findings at once
  // (the same "avoid row-by-row inconsistency" fix that manual feature
  // existed to work around by hand) and this table already surfaces its
  // result. Toggled with the blocks view purely by hiding/showing two
  // containers — no re-render, no backend call.
  const filteredTableHtml = buildFilteredTableHtml(sheets, allLangs);
  // While the second-opinion percentages are still being computed in the
  // background (see the info-box below), shouldKeepFinding's fail-safe
  // keeps every finding, so the filtered table isn't actually filtering
  // anything yet — opening straight into the normal, familiar blocks view
  // in that case avoids a confusing "everything's still here, did this
  // even do anything?" first impression.
  const isFilteredDefault = !result.second_opinion_pending;

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
    ${summary ? `<p class="muted">Исходный язык: ${esc(result.source_lang)}. Строк проверено: ${summary.rows_checked}. Найдено проблем: ${summary.total_findings} в ${summary.languages_checked.length} языках.${result.cost_usd != null ? ` Стоимость: ${esc(formatCostRu(result.cost_usd))}.` : ""}${(() => { const d = formatDurationRu(result.created_at, result.completed_at); return d ? ` Заняла: ${esc(d)}.` : ""; })()}${(() => { const c = describeChecksRu(result.checks_run); return c ? ` Критерии: ${esc(c)}.` : ""; })()}${(() => { const m = describeModelsRu(summary.models_by_lang); return m ? ` Модели: ${esc(m)}.` : ""; })()}</p>` : ""}
    ${projectId != null && managerId != null
      ? `<div><a class="download-link" href="${esc(multiCheckReportUrl(projectId, result.multi_check_id, managerId))}" target="_blank" rel="noopener noreferrer">⬇ Скачать отчёт (Excel)</a></div>`
      : ""}
    ${unrecognized.length > 0 ? `<div class="info-box">Не распознаны как языки (пропущены): ${esc(unrecognized.join(", "))}</div>` : ""}
    ${filterBarHtml}
    ${result.second_opinion_pending ? `<div class="info-box">Процент уверенности ИИ для находок ещё досчитывается в фоне (обычно не дольше минуты) — пока он не готов, показан обычный (неотфильтрованный) отчёт. Закройте вкладку и откройте отчёт заново через минуту, чтобы увидеть отфильтрованную версию.</div>` : ""}
    <div>
      <button type="button" id="filter-toggle-btn" class="filter-toggle-btn">${isFilteredDefault ? "↩ Показать блоками" : "📋 Показать таблицей"}</button>
    </div>
    <div id="blocks-view" ${isFilteredDefault ? "hidden" : ""}>${sheetsHtml}</div>
    <div id="filtered-view" ${isFilteredDefault ? "" : "hidden"}>${filteredTableHtml}</div>
  </div>
  <script>
    // Narrows the always-visible breakdown down to one language's findings
    // — "Все" (the default, matching the active button on load) shows
    // everything, same as before this existed. Reads the target language
    // from the clicked button's own data-lang attribute (never from a
    // string built server-side and handed to an inline onclick="...") —
    // a language code comes straight from an uploaded file's column
    // header, so it isn't trustworthy enough to interpolate into a script
    // string. Also drives the filtered table's own per-language <tbody>
    // groups (see updateFilteredVisibility below) — Александр's ask
    // (2026-09-25): "Отфильтровать отчёт" should only build/show the
    // currently-open language's filtered rows, not every language at
    // once, so the same language selection that already narrows the
    // normal blocks view now narrows the filtered view too, live —
    // whichever language tab is active when the filter button is
    // clicked (or switched to afterwards) is what the filtered table
    // shows, even if that switch happens while the filtered view is
    // already the one on screen.
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
      updateFilteredVisibility(lang);
    }
    document.querySelectorAll(".lang-filter-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        filterLang(btn.dataset.lang, btn);
      });
    });
    // Shows/hides each language's own <tbody> in the filtered table (see
    // filteredReport.ts — one <tbody data-lang="xx"> per language, so its
    // "Тон обращения" cell always toggles together with the rows it spans,
    // never partially) to match the language currently selected above.
    // Every checked language always has its own <tbody> now (a language
    // with nothing left after filtering still gets one row showing its
    // tone of address — Александр's ask, 2026-09-27), so filtered-empty-row
    // below is only ever a fallback for the degenerate "zero languages
    // checked at all" case.
    function updateFilteredVisibility(lang) {
      var anyVisible = false;
      document.querySelectorAll("#filtered-table tbody[data-lang]").forEach(function (tb) {
        var show = lang === "all" || tb.getAttribute("data-lang") === lang;
        tb.hidden = !show;
        if (show) anyVisible = true;
      });
      var emptyRow = document.getElementById("filtered-empty-row");
      if (emptyRow) emptyRow.hidden = anyVisible;
    }
    updateFilteredVisibility("all");
    // "Отфильтровать отчёт" — a plain visibility toggle between the flat
    // filtered table (the report's default view, see isFilteredDefault
    // above) and the normal per-language blocks (both already fully built
    // above, see filteredTableHtml/sheetsHtml) — reversible, so a manager
    // who wants to double-check something against the full, unfiltered
    // report can still switch to it without reopening the report. Reads
    // which one is currently showing straight off the DOM (rather than a
    // separate JS boolean duplicating the server-rendered "hidden"
    // attributes above), so the two can never disagree.
    (function () {
      var toggleBtn = document.getElementById("filter-toggle-btn");
      var blocksView = document.getElementById("blocks-view");
      var filteredView = document.getElementById("filtered-view");
      if (!toggleBtn || !blocksView || !filteredView) return;
      var filtered = blocksView.hidden;
      toggleBtn.addEventListener("click", function () {
        filtered = !filtered;
        blocksView.hidden = filtered;
        filteredView.hidden = !filtered;
        toggleBtn.textContent = filtered ? "↩ Показать блоками" : "📋 Показать таблицей";
      });
    })();
  </script>
</body>
</html>`;
}

// Opens a blank tab synchronously (so it isn't blocked as a popup — it must
// happen before any `await`), then fills it in once the report data is
// ready. Returns false when the tab couldn't be opened at all (a strict
// popup blocker), so the caller can fall back to showing the report inline
// instead of silently doing nothing. projectId/managerId are passed straight
// through to buildReportHtml, for its "Скачать отчёт (Excel)" link.
export async function openReportInNewTab(
  fetchDetail: () => Promise<MultiCheckResponse>,
  projectId?: number,
  managerId?: number,
): Promise<boolean> {
  const win = window.open("", "_blank");
  if (!win) return false;
  try {
    const result = await fetchDetail();
    win.document.open();
    win.document.write(buildReportHtml(result, projectId, managerId));
    win.document.close();
  } catch {
    win.document.open();
    win.document.write(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8" /><title>Отчёт</title></head><body><p>Не удалось загрузить отчёт.</p></body></html>`);
    win.document.close();
  }
  return true;
}
