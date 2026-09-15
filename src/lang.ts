// Shared helpers for displaying language codes, and the check-criteria list
// used by the unified check-flow screen (CheckRunner.tsx).

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
  // labels (the real Tone doc names Kazakh "KZ", Tajik "TJ", Bengali "BD" —
  // the COUNTRY code, not the ISO language subtag). Since removing the
  // Numerals document (which used to carry the real "kk-KZ"-style codes and
  // let merge_lang_codes bridge "kz" into it) took away that bridging, a
  // bare label like this now reaches here as-is — try it directly as a
  // region code before giving up, since for these it already IS one.
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
export const CHECK_OPTIONS: { key: string; label: string; kind: "ai" | "algo" }[] = [
  { key: "register", label: "Тон обращения (ИИ)", kind: "ai" },
  { key: "untranslatable", label: "Непереводимые термины (ИИ)", kind: "ai" },
  { key: "completeness", label: "Неполнота перевода, лишний текст (ИИ)", kind: "ai" },
  { key: "typo", label: "Опечатки и ошибки (ИИ)", kind: "ai" },
  { key: "punctuation", label: "Оформление (алгоритм)", kind: "algo" },
  { key: "placeholders", label: "Теги/плейсхолдеры (алгоритм)", kind: "algo" },
];

// Which uploaded doc (if any) a check requires — mirrors the backend's
// _require_doc, so the UI can warn before the user even presses start
// rather than only after a 400 comes back.
export const CHECK_DOC_REQUIREMENT: Record<string, "tone"> = {
  register: "tone",
};

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
export const TYPE_LABEL: Record<string, string> = { system: "⚠ Внимание" };

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
