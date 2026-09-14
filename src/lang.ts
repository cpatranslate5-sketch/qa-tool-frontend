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
const BASE_LANG_FALLBACK: Record<string, string> = {
  en: "🇬🇧", ru: "🇷🇺", es: "🇪🇸", fr: "🇫🇷", de: "🇩🇪", it: "🇮🇹", pt: "🇵🇹",
  ar: "🇸🇦", zh: "🇨🇳", ja: "🇯🇵", ko: "🇰🇷", vi: "🇻🇳", th: "🇹🇭", pl: "🇵🇱",
  tr: "🇹🇷", uk: "🇺🇦", id: "🇮🇩", ms: "🇲🇾", hi: "🇮🇳",
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
