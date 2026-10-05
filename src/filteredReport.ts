// Manager's review of a report before sending it to translators
// (2026-09-29, redesigned 2026-09-30 — Александр).
//
// The report is shown as blocks only (the table view was removed). Every
// real finding gets a number (per language, 1..N — the translator's page
// shows the same numbers), a green ✓ and a red ✕ in its corner. ✓ tints the
// finding light green and opens "Добавить ссылку(и):" + "Примечание:"
// fields under it; ✕ tints it light red. The "Тон обращения" box (or, when
// a language has none, an "Общее примечание к языку" box) always has link
// and note fields — review key "note|<lang>". Everything is saved to the
// server on every change (see the script in reportHtml.ts).
import type { Finding, ReviewEntry, TranslatorEntry } from "./types";

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Stable id of one finding inside a report — the same across reopenings
// (the report's findings never change after the check). The backend's
// share page (app/share_page.py) builds exactly the same keys and numbers.
export function reviewKey(sheetIdx: number, lang: string, excelRow: number, findingIdx: number): string {
  return `${sheetIdx}|${lang}|${excelRow}|${findingIdx}`;
}

export function toneKey(lang: string): string {
  return `tone|${lang}`;
}

export function generalKey(lang: string): string {
  return `note|${lang}`;
}

export function isReviewable(excelRow: number, f: Finding): boolean {
  return excelRow !== 0 && f.type !== "register_summary" && f.type !== "system" && !f.deleted;
}

// ✓ / ? / ✕ in the finding's top-right corner. «?» = «под вопросом»: the
// finding goes to the translator's page tinted yellow, where whoever opens
// the link first decides «Оставить переводчику» or «Убрать».
export function reviewCornerHtml(): string {
  return `
    <div class="rv-corner">
      <button type="button" class="rv-btn rv-accept" title="Включить для переводчика">✓</button>
      <button type="button" class="rv-btn rv-question" title="Под вопросом — решит тот, кто откроет ссылку">?</button>
      <button type="button" class="rv-btn rv-reject" title="Отклонить">✕</button>
    </div>`;
}

// Link(s) + note fields under a finding (shown once it's accepted) or
// inside the tone / general box (always shown).
export function reviewFieldsHtml(): string {
  return `
    <div class="rv-fields">
      <label class="rv-field">
        <span class="rv-label">Добавить ссылку(и):</span>
        <textarea class="rv-links" rows="1" placeholder="https://crowdin.com/… — каждая ссылка с новой строки"></textarea>
      </label>
      <label class="rv-field">
        <span class="rv-label">Примечание:</span>
        <textarea class="rv-note" rows="1" placeholder="Необязательно"></textarea>
      </label>
    </div>`;
}

// What happened on the share page (read-only here): the head of QA's step
// (sent on / comment for the translator) and the translator's answer.
export function translatorAnswerHtml(tr: TranslatorEntry | undefined, entry?: ReviewEntry): string {
  let out = "";
  const okk = (entry?.okk_comment || "").trim();
  if (entry?.okk_removed) {
    out += `<div class="rv-tr"><strong>ОКК:</strong> <span class="rv-tr-no">убрано из отчёта для переводчика</span></div>`;
  } else if (entry?.sent) {
    out += `<div class="rv-tr"><strong>ОКК:</strong> оставлено переводчику${okk ? ` — «${esc(okk)}»` : ""}</div>`;
  }
  if (!tr || (!tr.decision && !(tr.comment || "").trim())) return out;
  const d = tr.decision === "accept" ? "done" : tr.decision === "reject" ? "na" : tr.decision;
  const verdict = d === "done"
    ? `<span class="rv-tr-yes">✓ правка внесена</span>`
    : d === "na"
      ? `<span class="rv-tr-no">✕ не актуально</span>`
      : "без решения";
  const comment = (tr.comment || "").trim();
  return out + `<div class="rv-tr rv-tr-answer"><strong>Переводчик:</strong> ${verdict}${comment ? ` — «${esc(comment)}»` : ""}${tr.checked ? ` · <span class="rv-tr-yes">☑ проверено</span>` : ""}</div>`;
}
