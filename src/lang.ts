// Shared helpers for displaying language codes, and the check-criteria list
// used by the unified check-flow screen (CheckRunner.tsx).
import type { Finding, MultiCheckRowResult } from "./types";

// True for the synthetic tone-of-address report row a language's results
// get exactly once when "register" is selected — see the backend's
// _register_summary_block (excel_row 0, a single register_summary
// finding, no real source/translation). It's a factual "here's the tone
// actually used" note, not a problem, so it must be kept out of every "N
// найдено"/"N problems" count and out of the orange "has findings"
// highlighting — otherwise a language with zero real issues still shows
// as if something needs fixing purely because the register check ran.
export function isRegisterSummaryRow(row: MultiCheckRowResult): boolean {
  return row.findings.length === 1 && row.findings[0].type === "register_summary";
}

// The row count actually shown to the manager ("N найдено") — every row
// EXCEPT the register report row above. Used by both CheckRunner.tsx (the
// on-screen results) and reportHtml.ts (the downloadable/new-tab report),
// so the two stay consistent.
export function realRowCount(rows: MultiCheckRowResult[]): number {
  return rows.filter(r => !isRegisterSummaryRow(r)).length;
}

// Same idea as realRowCount above, but for a standalone text-pair check's
// flat findings list (SingleCheckHistoryList) rather than a file check's
// per-language rows — a history entry that only ran "register" carries
// exactly one register_summary finding and no real ones, and must show
// "без проблем", not "1 найдено".
export function realFindingCount(findings: Finding[]): number {
  return findings.filter(f => f.type !== "register_summary").length;
}

// Turns a two-letter region code ("KZ") into its flag emoji by combining the
// two Unicode "regional indicator symbol" characters — this works for any
// real ISO 3166-1 country code without a hand-maintained table, so it stays
// correct as new languages/regions show up in the project's documents.
function regionFlag(region: string): string {
  const upper = region.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "";
  const codePoints = [...upper].map(c => 0x1f1e6 + (c.charCodeAt(0) - 65));
  return String.fromCodePoint(...codePoints);
}

// A handful of common bare (no-region) language codes that would otherwise
// get no flag at all — picked as the language's most common/original
// country, purely for a recognizable icon, not a political statement.
//
// Every entry here exists for one of two reasons, and both matter: either
// the code's uppercase form isn't a real ISO 3166 country code at all (so
// without an entry here it falls through to the last-resort regionFlag()
// attempt below, which produces a flag emoji sequence with no matching
// glyph — rendered as literal tofu letter-boxes, e.g. Kazakh "kk" showing
// as "KK" in two boxes, which is what sent Александр looking for this in
// the first place), or it IS a real country code but for the WRONG
// country (a coincidence of the alphabet, not a relation to the
// language) — e.g. Kyrgyz "ky" alphabetically collides with the Cayman
// Islands' real country code "KY", Tajik "tg" with Togo's "TG", Marathi
// "mr" with Mauritania's "MR", Bengali "bn" with Brunei's "BN", Tagalog
// "tl" with Timor-Leste's "TL" — each would otherwise silently show a
// real but unrelated country's flag. Every code below was checked against
// the actual language columns seen across Александр's real uploaded
// files, not guessed.
const BASE_LANG_FALLBACK: Record<string, string> = {
  en: "🇬🇧", ru: "🇷🇺", es: "🇪🇸", fr: "🇫🇷", de: "🇩🇪", it: "🇮🇹",
  ar: "🇸🇦", zh: "🇨🇳", ja: "🇯🇵", ko: "🇰🇷", vi: "🇻🇳", th: "🇹🇭", pl: "🇵🇱",
  tr: "🇹🇷", uk: "🇺🇦", id: "🇮🇩", ms: "🇲🇾", hi: "🇮🇳",
  // fixes literal tofu (no real country shares these letters):
  kk: "🇰🇿", el: "🇬🇷", sw: "🇹🇿", te: "🇮🇳", ur: "🇵🇰",
  // fixes a real but wrong country flag (alphabet coincidence):
  bn: "🇧🇩", ky: "🇰🇬", mr: "🇮🇳", tg: "🇹🇯", tl: "🇵🇭",
  // Александр's Portuguese is always Brazilian, never Portugal's — the
  // backend already defaults a bare "pt" column/catalog entry to "pt-br"
  // (app.excel_multi._normalize_lang_label), which gets its flag from the
  // region-code path below ("br" -> 🇧🇷) without ever reaching this table.
  // This entry only matters for a bare "pt" that slips through anyway (an
  // older catalog entry saved before that default existed) — same flag
  // either way, never Portugal's 🇵🇹.
  pt: "🇧🇷",
  // already correct via the region-code fallback below by coincidence —
  // listed explicitly anyway so the table stays the complete reference
  // for every language this project actually handles:
  az: "🇦🇿", uz: "🇺🇿", ro: "🇷🇴",
};

export function flagForLang(code: string): string {
  const parts = code.split("-");
  // Prefer a real region subtag (2-letter alphabetic, not a 4-letter script
  // tag like "Latn" and not a numeric UN region like "001") — usually last.
  for (let i = parts.length - 1; i >= 1; i--) {
    const flag = regionFlag(parts[i]);
    if (flag) return flag;
  }
  const base = parts[0].toLowerCase();
  if (BASE_LANG_FALLBACK[base]) return BASE_LANG_FALLBACK[base];
  // A bare code with no region part at all, and not one of the common
  // languages above, is very likely one of the agency's country-code-style
  // labels (Александр's own files name Kazakh "KZ", Tajik "TJ", Bengali
  // "BD" — the COUNTRY code, not the ISO language subtag). Since removing
  // the Numerals document (which used to carry the real "kk-KZ"-style
  // codes and let merge_lang_codes bridge "kz" into it) took away that
  // bridging, a bare label like this now reaches here as-is — try it
  // directly as a region code before giving up, since for these it
  // already IS one.
  if (parts.length === 1) {
    const flag = regionFlag(base);
    if (flag) return flag;
  }
  return "🌐";
}

export function langLabel(code: string): string {
  return `${flagForLang(code)} ${code.toUpperCase()}`;
}

// The exact criteria list from Александр's spec (point 9) — "ИИ" items run
// through the AI, "алгоритм" items are free, instant rule checks. Two extra
// free rule checks ("numbers" — digit mismatch between source/translation,
// "max_length" — Crowdin "Max length" column) aren't shown as their own
// checkboxes since he didn't ask for them as separate items, but they're
// folded silently into "Оформление" / always-on respectively (see
// CheckRunner's buildChecksToSend) rather than dropped — they're free and
// already useful, no reason to lose them over a labeling choice.
// "defaultOn: false" marks a criterion that must stay UNTICKED unless the
// manager deliberately turns it on for a given check — right now only the
// SMS/GSM-7bit charset check (Александр's ask, 2026-09-17): it's only
// relevant for an actual SMS deliverable, and would otherwise flag nearly
// every non-Latin-only translation (Cyrillic, Arabic, CJK, ...) as "wrong",
// so it must never be on by default the way every other criterion is. See
// CheckRunner's initial `checks` state, which reads this flag.
export const CHECK_OPTIONS: { key: string; label: string; kind: "ai" | "algo"; defaultOn?: boolean }[] = [
  { key: "register", label: "Тон обращения (ИИ)", kind: "ai" },
  { key: "untranslatable", label: "Непереводимые термины (ИИ)", kind: "ai" },
  { key: "completeness", label: "Неполнота перевода, лишний текст (ИИ)", kind: "ai" },
  { key: "typo", label: "Опечатки и ошибки (ИИ)", kind: "ai" },
  { key: "punctuation", label: "Оформление (алгоритм)", kind: "algo" },
  { key: "placeholders", label: "Теги/плейсхолдеры (алгоритм)", kind: "algo" },
  { key: "sms_charset", label: "Латиница для SMS, GSM 7-bit (алгоритм)", kind: "algo", defaultOn: false },
];

// Expands the user's checkbox selection into the actual list sent to the
// backend — folds in the two free rule checks that aren't shown as their
// own checkboxes (see CHECK_OPTIONS above).
export function buildChecksToSend(selected: string[]): string[] {
  const out = new Set(selected);
  if (out.has("punctuation")) out.add("numbers");
  out.add("max_length"); // no-op unless the file actually has a Max length column
  return [...out];
}

// Turns the raw checks_run keys a completed check ran with (e.g.
// ["punctuation", "numbers", "max_length"]) into the same Russian labels
// shown on the checkbox screen ("Оформление (алгоритм)", ...), so a
// completed check's summary can say exactly which criteria were used —
// makes a $0 cost self-explaining (only the free "(алгоритм)" ones were
// ticked) instead of looking like a glitch. Silently drops the
// behind-the-scenes keys buildChecksToSend adds on top ("numbers",
// "max_length") since they're not user-facing choices of their own.
export function describeChecksRu(checksRun?: string[]): string {
  if (!checksRun || checksRun.length === 0) return "";
  const set = new Set(checksRun);
  return CHECK_OPTIONS.filter(c => set.has(c.key)).map(c => c.label).join(", ");
}

export const SEVERITY_LABEL: Record<string, string> = { high: "Важно", medium: "Средне", low: "Мелочь" };

// Real check-type keys ("typo", "register", ...) are shown as-is — no
// mapping needed, that's familiar to Александр already. The one exception
// is "system": a synthetic finding the backend injects itself (not from
// the model or a rule check) when something about the CHECK ITSELF went
// wrong — the AI's response got cut off, or a batch request errored — so
// it needs a label that reads as "something's off with the check", not as
// a translation problem type.
//
// "register_summary" — the other synthetic type the backend can inject
// (the tone-of-address actually used, per app.claude_client.
// summarize_register_values) — isn't in this map at all: its message is
// already self-explanatory ("Тон: Вы." — shortened from "Тон обращения:
// везде на «вы»." on 2026-09-18), so CheckRunner renders it plainly,
// without a severity or type badge (see the "finding-info" CSS class),
// instead of looking it up here.
export const TYPE_LABEL: Record<string, string> = {
  system: "⚠ Внимание",
  sms_charset: "SMS-алфавит",
  // Unlike "register_summary" (the document-wide majority-tone report,
  // handled specially below — see registerSummarySegments), "register_mixed"
  // IS a genuine, ordinary finding on one specific row: that row's own
  // translation switches between «ты» and «вы» within itself (Александр's
  // ask, 2026-09-17 — a cell can hold several sentences/paragraphs, and the
  // tone can drift mid-cell), so it renders through the normal severity/type
  // badge template like any other problem, just with a friendly label here.
  register_mixed: "Тон обращения",
};

// Colors for the register_summary majority word — Александр's ask
// (2026-09-17): «вы» (formal) in blue, «ты» (informal) in orange.
const REGISTER_WORD_COLOR: Record<string, string> = {
  formal: "#4C6FCE",
  informal: "#E08A2E",
};

// Highlight color for an exception row's actual (wrongly-toned) text —
// matches the app's --danger red already used elsewhere for real problems,
// repeated here as a literal since this module has no access to CSS
// custom properties.
const REGISTER_EXCEPTION_COLOR = "#C1503A";

export interface RegisterSegment {
  text: string;
  color?: string;
}

// Splits a register_summary finding's message into colored segments for
// CheckRunner/HistoryLists (on-screen) and reportHtml.ts (the downloadable
// report) to render consistently — Александр's ask (2026-09-17): color the
// majority word («вы» blue / «ты» orange), and, when the finding carries
// each exception's actual translated text (register_exceptions — capped at
// MAX_EXCEPTIONS_WITH_TEXT on the backend), show that text highlighted red
// INSTEAD of the plain row-number list, closing the sentence with a period.
//
// Deliberately colors the word actually found inside f.message (rather
// than rebuilding the sentence from scratch) — the backend's exact Russian
// phrasing differs between a single-pair check ("Тон: Вы.") and a
// multi-row file check ("Тон: Вы, кроме: строка 3." — shortened on
// 2026-09-18 from the old "Тон обращения: везде на «вы», кроме: ....";
// the backend now returns the bare word with no guillemets, capitalized
// "Вы" for formal), and there's no flag on the finding itself saying which
// framing this is, so locating the known word/phrase inside the real
// message and only swapping what's needed (the row-number tail, when
// actual exception text is available) stays correct either way instead of
// guessing at which framing to reconstruct.
//
// Falls back to the whole message as one plain, uncolored segment for an
// older history record saved before this structure existed (no
// register_majority field at all) and for the (now-impossible, but kept as
// a safe fallback) case of a majority word not actually found in the text.
export function registerSummarySegments(f: Finding): RegisterSegment[] {
  const majority = f.register_majority;
  if (!majority) return [{ text: f.message }];

  const color = REGISTER_WORD_COLOR[majority];
  const word = majority === "formal" ? "Вы" : "ты";
  const idx = f.message.indexOf(word);
  if (idx === -1) return [{ text: f.message }];

  const before = f.message.slice(0, idx);
  const afterWord = f.message.slice(idx + word.length);

  const exceptions = f.register_exceptions;
  if (exceptions && exceptions.length > 0) {
    const kromeMarker = "кроме: ";
    const kromeIdx = afterWord.indexOf(kromeMarker);
    const prefix = kromeIdx === -1 ? afterWord : afterWord.slice(0, kromeIdx + kromeMarker.length);
    const segs: RegisterSegment[] = [{ text: before }, { text: word, color }, { text: prefix }];
    exceptions.forEach((exc, i) => {
      if (i > 0) segs.push({ text: "; " });
      segs.push({ text: exc.text, color: REGISTER_EXCEPTION_COLOR });
    });
    segs.push({ text: "." });
    return segs;
  }

  return [{ text: before }, { text: word, color }, { text: afterWord }];
}

// Matches the trailing "(также в строках: N, M, ...)" tag app.excel_multi's
// _resolve_repeated_findings appends (always exactly this shape, always at
// the very end — see that function) when the same problem repeats across
// several Excel rows and gets reported once. Александр's ask (2026-09-17):
// this tag is easy to miss buried in a long sentence, so it's split out and
// colored red (same REGISTER_EXCEPTION_COLOR already used for a wrongly-
// toned exception's text) instead of showing as plain, same-color text.
const ALSO_ROWS_RE = /(\s\(также в строках: \d+(?:,\s*\d+)*\))$/;

export function alsoRowsSegments(message: string): RegisterSegment[] {
  const m = ALSO_ROWS_RE.exec(message);
  if (!m) return [{ text: message }];
  const idx = m.index;
  return [
    { text: message.slice(0, idx) },
    { text: m[1], color: REGISTER_EXCEPTION_COLOR },
  ];
}

// Standard Russian count-noun pluralization (1 минута, 2 минуты, 5 минут,
// 11 минут, 21 минута, ...) — used by formatElapsedMinutesRu below.
function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

// How long a batch job has genuinely been waiting — shown as a fallback
// while Anthropic's own done/total counts haven't moved yet, so the
// "processing" screen still visibly changes over time instead of sitting
// on a static "0%" (Александр's complaint). This is real, measured elapsed
// time, not a guessed ETA.
export function formatElapsedMinutesRu(minutes: number): string {
  if (minutes < 1) return "меньше минуты";
  return `${minutes} ${pluralRu(minutes, "минута", "минуты", "минут")}`;
}

// How long a COMPLETED check actually took, from created_at to completed_at
// — distinct from formatElapsedMinutesRu above, which is for a check still
// in progress. Rounds to the nearest minute (a finished duration reads more
// naturally rounded than floored). Returns null when either timestamp is
// missing (an older record from before this was tracked), so callers can
// simply omit the line rather than showing a misleading duration.
export function formatDurationRu(createdAt?: string | null, completedAt?: string | null): string | null {
  if (!createdAt || !completedAt) return null;
  const ms = Date.parse(completedAt) - Date.parse(createdAt);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return formatElapsedMinutesRu(Math.round(ms / 60000));
}

// Real AI cost of a check, in USD — displayed in ru-RU style ("0,0031 $")
// per Александр's request. Costs are often tiny (a few tenths of a cent),
// so a fixed 2-decimal format would round almost everything down to
// "0,00 $" and make the feature look broken — the precision is widened for
// smaller amounts instead, so a genuine (if small) cost is always visible.
export function formatCostRu(usd: number): string {
  if (!usd || usd <= 0) return "0 $";
  let decimals = 2;
  if (usd < 0.01) decimals = 4;
  if (usd < 0.0001) decimals = 6;
  return `${usd.toFixed(decimals).replace(".", ",")} $`;
}
