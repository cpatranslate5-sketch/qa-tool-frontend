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

const QUOTE_RE = /«([^«»]{2,200})»|“([^“”]{2,200})”|"([^"]{2,200})"/g;

export function findingFragments(f: Finding): string[] {
  const out: string[] = [];
  const frag = (f.fragment || "").trim();
  if (frag) out.push(frag);
  let m: RegExpExecArray | null;
  QUOTE_RE.lastIndex = 0;
  while ((m = QUOTE_RE.exec(f.message || ""))) {
    const q = (m[1] || m[2] || m[3] || "").trim().replace(/^…|…$/g, "").trim();
    if (q.length >= 2 && !out.includes(q)) out.push(q);
  }
  return out;
}

function find(text: string, needle: string): number {
  if (!needle || !text) return -1;
  const i = text.indexOf(needle);
  if (i >= 0) return i;
  return text.toLowerCase().indexOf(needle.toLowerCase());
}

export function locateFinding(f: Finding, source: string, translation: string): FindingLocation | null {
  if (f.type === "register_summary" || f.type === "system") return null;
  // The translation first with every quote, only then the source.
  for (const field of ["translation", "source"] as const) {
    for (const cand of findingFragments(f)) {
      const text = field === "translation" ? translation || "" : source || "";
      const start = find(text, cand);
      if (start < 0) continue;
      const end = start + cand.length;
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
export interface Excerpt { source: ExcerptPart; translation: ExcerptPart; field: "source" | "translation"; start: number; end: number }

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
  const loc = locateFinding(f, source, translation);
  if (!loc) return null;
  const texts = { source, translation };
  const spans = { source: paraSpans(source), translation: paraSpans(translation) };
  const field = loc.field;
  const other = field === "translation" ? "source" : "translation";
  const k = paraIndex(spans[field], loc.start);
  const nF = spans[field].length, nO = spans[other].length;
  if (nO === 0) return null;
  const kO = nF === nO ? k : Math.min(nO - 1, Math.round((k * (nO - 1)) / Math.max(1, nF - 1)));
  const part = (name: "source" | "translation", idx: number): ExcerptPart => {
    const [ps, pe] = spans[name][idx];
    const para = texts[name].slice(ps, pe);
    let mark: [number, number] | null = null;
    if (name === field) mark = [loc.start - ps, loc.end - ps];
    else for (const cand of findingFragments(f)) { const i = find(para, cand); if (i >= 0) { mark = [i, i + cand.length]; break; } }
    const [ws, we] = mark ? windowAround(para, mark[0], mark[1]) : windowAround(para, 0, 0);
    return {
      text: para.slice(ws, we), mark: mark ? [mark[0] - ws, mark[1] - ws] : null,
      para: idx + 1, paras: spans[name].length, cutStart: ws > 0, cutEnd: we < para.length,
    };
  };
  return { source: part("source", field === "source" ? k : kO), translation: part("translation", field === "translation" ? k : kO), field, start: loc.start, end: loc.end };
}

export function excerptLabel(title: string, p: ExcerptPart): string {
  return p.paras > 1 ? `${title} (абзац ${p.para} из ${p.paras}):` : `${title}:`;
}
