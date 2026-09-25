// Builds the plain-text "numbered findings report" Александр copies out of
// the report page and pastes into a chat with any AI model to get a second
// opinion on which findings are actually worth acting on — his own ask,
// 2026-09-25, built specifically as an alternative to automating that same
// judgment ON the platform: adding it as another paid pipeline step was too
// expensive, and an earlier attempt at exactly that (the backend's old
// "Step 3" — see app.claude_client.FINDINGS_VALIDITY_PROMPT's own comment)
// had already been rolled back that same day because isolated per-row
// processing for hard languages made its own validity percentages
// inconsistent for the same repeated problem (one occurrence scored 20%,
// another 55%, no memory of each other). Pasting a WHOLE language's
// numbered list into one chat message sidesteps that same trap on its own:
// whichever model reads it sees every finding for that language at once,
// not one isolated row at a time, so it can actually notice and score
// repeats consistently.
//
// The instructions travel WITH the report data in a single clipboard
// payload (see buildCopyPayload) rather than living as a saved Claude
// skill or any other tool-specific mechanism — deliberately, since
// Александр wants to paste this into any AI chat, not just one that has
// this project's own tooling installed.
import { flagForLang, isRegisterSummaryRow, SEVERITY_LABEL, TYPE_LABEL } from "./lang";
import type { Finding, MultiCheckRowResult, MultiCheckSheetResult } from "./types";

// Wording agreed with Александр 2026-09-25 before shipping.
export const COPY_REPORT_PROMPT = `Ниже — отчёт по проверке качества перевода. Для каждого языка приведён список пронумерованных находок (нумерация начинается заново для каждого языка) — по каждой указаны контекст, исходный текст, перевод и описание проблемы. Также для каждого языка может быть указан общий факт «Тон обращения» («Вы»/«ты») — это не ошибка, а справочная информация, относящаяся ко всему языку целиком, а не к конкретной находке.

Разбери отчёт и по каждому языку выведи таблицу с колонками: № | Тон обращения | Вероятность ошибки (%) | Нужна ли правка.

Правила:
- «Тон обращения» — одинаковое значение для всех строк одного языка. Если в языке вообще нет находок — всё равно включи его отдельной строкой с заполненным тоном обращения и пометкой «ошибок нет».
- «Вероятность ошибки (%)» — твоя собственная оценка от 0 до 100, насколько находка похожа на настоящую проблему, а не на нормальный вариант перевода, устоявшийся термин, региональную особенность или ошибку самой проверки.
- «Нужна ли правка»: ✅ — правка точно нужна; ⚠️ — есть нюанс, зависит от контекста; ❌ — ложное срабатывание.
- Находки по числам, плейсхолдерам и пунктуации — результат работы алгоритма, не ИИ. Их не перепроверяй по смыслу — всегда ✅ и 100%, чтобы случайно не отбросить настоящую ошибку.
- Остальные находки (опечатки, непереведённые термины, полнота перевода и т.п.) — оценивай по существу, своим суждением, как переводчик-эксперт.

Дальше идёт сам отчёт:`;

// The "Тон обращения" fact for one language — the register_summary row's
// own message when the register check found one, "не проверялся" when the
// check wasn't run at all (or ran but found nothing classifiable — same
// user-facing meaning to Александр: no tone fact available either way).
// Mirrors isRegisterSummaryRow (the same synthetic-row shape it already
// recognizes) rather than needing a checks-run list passed in.
function toneOfAddressText(rows: MultiCheckRowResult[]): string {
  const row = rows.find(isRegisterSummaryRow);
  return row ? row.findings[0].message : "не проверялся";
}

function findingLine(n: number, f: Finding): string {
  const severity = SEVERITY_LABEL[f.severity] || f.severity;
  const type = TYPE_LABEL[f.type] || f.type;
  return `${n}. ${severity} ${type}: ${f.message}`;
}

// One language's section of the plain-text report: a "Тон обращения" line
// (see toneOfAddressText), then every real finding numbered in appearance
// order starting at 1 — register_summary itself and any "system"/meta
// warning (excel_row 0, e.g. a truncation or duplicate-language notice) are
// never numbered, since a validity percentage has nothing meaningful to
// say about either; system warnings are still listed, just separately and
// unnumbered, so nothing silently disappears from what Александр sees. A
// language with no real findings at all still gets its own section — with
// "Ошибок не найдено." in place of a numbered list — exactly so it still
// carries its "Тон обращения" line even when there's nothing else to
// report (Александр's explicit ask).
export function buildLanguageReportText(lang: string, rows: MultiCheckRowResult[]): string {
  const tone = toneOfAddressText(rows);
  const realRows = rows.filter(r => !isRegisterSummaryRow(r) && r.excel_row !== 0);
  const systemRows = rows.filter(r => r.excel_row === 0 && !isRegisterSummaryRow(r));

  const parts: string[] = [`=== ${flagForLang(lang)} ${lang.toUpperCase()} ===`, `Тон обращения: ${tone}`];

  if (systemRows.length > 0) {
    parts.push(
      "Системные предупреждения (не находки, не нумеруются):",
      ...systemRows.flatMap(r => r.findings.map(f => `— ${f.message}`)),
    );
  }

  if (realRows.length === 0) {
    parts.push("Ошибок не найдено.");
    return parts.join("\n");
  }

  let n = 0;
  for (const row of realRows) {
    parts.push(
      "",
      `Строка ${row.excel_row} — ${row.context || "без контекста"}`,
      `Источник: ${row.source}`,
      `Перевод: ${row.translation}`,
      ...row.findings.map(f => findingLine(++n, f)),
    );
  }
  return parts.join("\n");
}

// The full plain-text report for one language ("langFilter" is that
// language's code) or every checked language at once ("langFilter" is
// "all") — sheet headers only appear when the upload actually had more
// than one sheet, same threshold reportHtml.ts's own filter bar uses, so a
// single-sheet upload (the overwhelming majority) doesn't carry a
// pointless "Sheet1" heading into the copied text.
export function buildReportText(sheets: MultiCheckSheetResult[], langFilter: string): string {
  const blocks: string[] = [];
  for (const sheet of sheets) {
    const langs = langFilter === "all"
      ? sheet.languages_checked
      : sheet.languages_checked.filter(l => l === langFilter);
    if (langs.length === 0) continue;
    const langBlocks = langs.map(l => buildLanguageReportText(l, sheet.languages[l] || []));
    blocks.push(sheets.length > 1 ? [`## ${sheet.sheet_name}`, ...langBlocks].join("\n\n") : langBlocks.join("\n\n"));
  }
  return blocks.join("\n\n");
}

// The single string a "Copy" button puts on the clipboard — instructions
// first, then the report data, as one ready-to-paste chat message.
export function buildCopyPayload(sheets: MultiCheckSheetResult[], langFilter: string): string {
  return `${COPY_REPORT_PROMPT}\n\n${buildReportText(sheets, langFilter)}`;
}
