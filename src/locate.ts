import type { Finding } from "./types";

// «Где именно ошибка» (2026-10-05, Александр): a finding's exact place in a
// long text. The model now returns "fragment" — a verbatim quote of the
// wrong spot; older findings fall back to the «…» quotes in the message.

export interface FindingLocation {
  field: "translation" | "source";
  start: number;
  end: number;
  paragraph: number; // 1-based, counting non-empty lines
  paragraphs: number;
  before: string;
  fragment: string;
  after: string;
}

const QUOTE_RE = /«([^«»]{2,200})»|“([^“”]{2,200})”|„([^„“”]{2,200})[“”]|"([^"]{2,200})"/g;

// 2026-10-06 (Александр): exact quotes only used to fail on a curly
// apostrophe, a non-breaking space or «…» inside the quote — no highlight,
// no folding. Now texts are compared loosely (spaces, quotes/apostrophes,
// ё/е, case, &nbsp;) and «…»-split pieces are tried too. Same logic as
// app/share_page.py.
const CHAR_FOLD: Record<string, string> = {
  " ": " ", " ": " ", " ": " ", " ": " ", " ": " ", " ": " ", " ": " ",
  "’": "'", "‘": "'", "ʼ": "'", "ʻ": "'", "`": "'", "´": "'",
  "“": '"', "”": '"', "„": '"', "«": '"', "»": '"',
  "–": "-", "—": "-", "‑": "-",
  "ё": "е", "Ё": "е",
};

function fold(text: string): { s: string; starts: number[]; ends: number[] } {
  let s = "";
  const starts: number[] = [], ends: number[] = [];
  let i = 0, prevSpace = false;
  while (i < text.length) {
    let ch: string, step: number;
    if (text.startsWith("&nbsp;", i)) { ch = " "; step = 6; } else { ch = text[i]; step = 1; }
    let c = (CHAR_FOLD[ch] ?? ch).toLowerCase();
    if (/\s/.test(c)) c = " ";
    if (c === " " && prevSpace) { ends[ends.length - 1] = i + step; i += step; continue; }
    prevSpace = c === " ";
    s += c; starts.push(i); ends.push(i + step);
    i += step;
  }
  return { s, starts, ends };
}

export function findingFragments(f: Finding): string[] {
  const out: string[] = [];
  const frag = (f.fragment || "").trim();
  if (frag) out.push(frag);
  let m: RegExpExecArray | null;
  QUOTE_RE.lastIndex = 0;
  while ((m = QUOTE_RE.exec(f.message || ""))) {
    const q = (m[1] || m[2] || m[3] || m[4] || "").trim().replace(/^…+|…+$/g, "").trim();
    if (q.length >= 2 && !out.includes(q)) out.push(q);
  }
  for (const q of [...out]) {
    for (let piece of q.split(/…|\.\.\./)) {
      piece = piece.replace(/^[\s,;:—–-]+|[\s,;:—–-]+$/g, "");
      if (piece.length >= 4 && !out.includes(piece)) out.push(piece);
    }
  }
  return out;
}

function findSpan(text: string, needle: string): [number, number] | null {
  if (!needle || !text) return null;
  const i = text.indexOf(needle);
  if (i >= 0) return [i, i + needle.length];
  const t = fold(text), n = fold(needle).s.trim();
  if (n.length < 2) return null;
  const j = t.s.indexOf(n);
  if (j < 0) return null;
  return [t.starts[j], t.ends[j + n.length - 1]];
}

function find(text: string, needle: string): number {
  const sp = findSpan(text, needle);
  return sp ? sp[0] : -1;
}

// Each text searched on its own — the spot is marked in both when quoted
// from both.
export function locateFields(f: Finding, source: string, translation: string): { source: [number, number] | null; translation: [number, number] | null } {
  const out = { source: null as [number, number] | null, translation: null as [number, number] | null };
  if (f.type === "register_summary" || f.type === "system") return out;
  const cands = findingFragments(f);
  for (const field of ["translation", "source"] as const) {
    const text = field === "translation" ? translation || "" : source || "";
    for (const c of cands) {
      const sp = findSpan(text, c);
      if (sp) { out[field] = sp; break; }
    }
  }
  return out;
}

export function locateFinding(f: Finding, source: string, translation: string): FindingLocation | null {
  if (f.type === "register_summary" || f.type === "system") return null;
  // The translation first with every quote, only then the source.
  for (const field of ["translation", "source"] as const) {
    for (const cand of findingFragments(f)) {
      const text = field === "translation" ? translation || "" : source || "";
      const sp = findSpan(text, cand);
      if (!sp) continue;
      const [start, end] = sp;
      const lines = text.split("\n");
      let pos = 0, paragraph = 0, count = 0;
      for (const line of lines) {
        const nonEmpty = line.trim() !== "";
        if (nonEmpty) count++;
        if (paragraph === 0 && start < pos + line.length + 1 && nonEmpty) paragraph = count;
        pos += line.length + 1;
      }
      const lineStart = text.lastIndexOf("\n", start - 1) + 1;
      const lineEndRaw = text.indexOf("\n", end);
      const lineEnd = lineEndRaw < 0 ? text.length : lineEndRaw;
      const from = Math.max(lineStart, start - 60);
      const to = Math.min(lineEnd, end + 60);
      return {
        field, start, end, paragraph: paragraph || 1, paragraphs: count,
        before: (from > lineStart ? "…" : "") + text.slice(from, start),
        fragment: text.slice(start, end),
        after: text.slice(end, to) + (to < lineEnd ? "…" : ""),
      };
    }
  }
  return null;
}

// Worth showing a «📍 Где» line: the text is long or has several paragraphs.
export function isLongText(text: string): boolean {
  return (text || "").length > 160 || (text || "").trim().includes("\n");
}

export function locationLabel(loc: FindingLocation): string {
  const where = loc.field === "translation" ? "Перевод" : "Оригинал";
  return loc.paragraphs > 1 ? `${where}, абзац ${loc.paragraph} из ${loc.paragraphs}` : where;
}


// «Только нужная часть» (2026-10-05): for a long text, the paragraph (or a
// few sentences of it) with the error, in both the source and the
// translation — same logic as the translator page (app/share_page.py).
export interface ExcerptPart { text: string; mark: [number, number] | null; para: number; paras: number; cutStart: boolean; cutEnd: boolean }
export interface Excerpt { source: ExcerptPart; translation: ExcerptPart; field: "source" | "translation"; start: number; end: number; located: boolean }

function paraSpans(text: string): [number, number][] {
  const spans: [number, number][] = [];
  let pos = 0;
  for (const line of text.split("\n")) {
    if (line.trim()) spans.push([pos, pos + line.length]);
    pos += line.length + 1;
  }
  return spans;
}

function paraIndex(spans: [number, number][], pos: number): number {
  for (let i = 0; i < spans.length; i++) if (pos <= spans[i][1]) return i;
  return Math.max(0, spans.length - 1);
}

function windowAround(text: string, a: number, b: number, limit = 500): [number, number] {
  if (text.length <= limit) return [0, text.length];
  const lo = Math.max(0, a - limit / 2), hi = Math.min(text.length, b + limit / 2);
  const re = /[.!?…。！？]\s/g;
  let start = lo, m: RegExpExecArray | null;
  while ((m = re.exec(text)) && m.index < lo) if (m.index + m[0].length <= a) start = m.index + m[0].length;
  re.lastIndex = b;
  const m2 = re.exec(text);
  const end = m2 && m2.index + 1 <= hi + 100 ? m2.index + 1 : hi;
  return [start, end];
}

export function excerptFor(f: Finding, source: string, translation: string): Excerpt | null {
  source = source || ""; translation = translation || "";
  if (!(isLongText(source) || isLongText(translation))) return null;
  const texts = { source, translation };
  const spans = { source: paraSpans(source), translation: paraSpans(translation) };
  const found = locateFields(f, source, translation);
  const main = found.translation ? "translation" : found.source ? "source" : null;
  const part = (name: "source" | "translation"): ExcerptPart => {
    if (!spans[name].length) return { text: texts[name], mark: null, para: 1, paras: 1, cutStart: false, cutEnd: false };
    let idx = 0;
    const own = found[name];
    if (own) idx = paraIndex(spans[name], own[0]);
    else if (main && found[main] && spans[main].length) {
      const k = paraIndex(spans[main], found[main]![0]);
      const nM = spans[main].length, nO = spans[name].length;
      idx = nM === nO ? k : Math.min(nO - 1, Math.round((k * (nO - 1)) / Math.max(1, nM - 1)));
    }
    const [ps, pe] = spans[name][idx];
    const para = texts[name].slice(ps, pe);
    const mark: [number, number] | null = own && ps <= own[0] && own[1] <= pe ? [own[0] - ps, own[1] - ps] : null;
    const [ws, we] = mark ? windowAround(para, mark[0], mark[1]) : windowAround(para, 0, 0);
    return {
      text: para.slice(ws, we), mark: mark ? [mark[0] - ws, mark[1] - ws] : null,
      para: idx + 1, paras: spans[name].length, cutStart: ws > 0, cutEnd: we < para.length,
    };
  };
  const m = main ? found[main]! : [0, 0];
  return { source: part("source"), translation: part("translation"), field: main || "translation", start: m[0], end: m[1], located: !!main };
}

export function excerptLabel(title: string, p: ExcerptPart): string {
  return p.paras > 1 ? `${title} (абзац ${p.para} из ${p.paras}):` : `${title}:`;
}
