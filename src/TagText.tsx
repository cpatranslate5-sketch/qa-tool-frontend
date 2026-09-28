// Renders text with its tags ({name}, <b>, %s, [link]…) colored — see
// lang.ts tagSegments.
import { TAG_COLOR, tagSegments } from "./lang";

export default function TagText({ text }: { text: string }) {
  return (
    <>
      {tagSegments(text).map((seg, i) =>
        seg.tag
          ? <span key={i} style={{ color: TAG_COLOR, fontWeight: 600 }}>{seg.text}</span>
          : <span key={i}>{seg.text}</span>,
      )}
    </>
  );
}
