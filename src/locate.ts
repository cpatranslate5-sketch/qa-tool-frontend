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
  for (const cand of findingFragments(f)) {
    for (const field of ["translation", "source"] as const) {
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
