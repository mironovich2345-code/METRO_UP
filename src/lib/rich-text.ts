import type { RichDoc } from "@/lib/server/content-schemas";

/**
 * Lightweight plain-text ⇄ structured RichDoc conversion for the CMS editor.
 * Authors type a compact markup; we store STRUCTURED JSON (never raw HTML):
 *   # / ## / ###  headings   ·   -  bullet list   ·   > quote
 *   **bold**   ·   *italic*   ·   blank line = new paragraph
 */

type Span = { text: string; bold?: boolean; italic?: boolean };

function parseInline(text: string): Span[] {
  const spans: Span[] = [];
  const re = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) spans.push({ text: text.slice(last, m.index) });
    if (m[2] !== undefined) spans.push({ text: m[2], bold: true });
    else if (m[4] !== undefined) spans.push({ text: m[4], italic: true });
    last = re.lastIndex;
  }
  if (last < text.length) spans.push({ text: text.slice(last) });
  return spans.length ? spans : [{ text }];
}

export function plainToRichDoc(input: string): RichDoc {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const doc: RichDoc = [];
  let bullets: { spans: Span[] }[] = [];

  const flushBullets = () => {
    if (bullets.length) {
      doc.push({ type: "bulletList", items: bullets });
      bullets = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("- ")) {
      bullets.push({ spans: parseInline(line.slice(2)) });
      continue;
    }
    flushBullets();
    if (!line.trim()) continue;
    if (line.startsWith("### ")) doc.push({ type: "heading", level: 3, spans: parseInline(line.slice(4)) });
    else if (line.startsWith("## ")) doc.push({ type: "heading", level: 2, spans: parseInline(line.slice(3)) });
    else if (line.startsWith("# ")) doc.push({ type: "heading", level: 1, spans: parseInline(line.slice(2)) });
    else if (line.startsWith("> ")) doc.push({ type: "quote", spans: parseInline(line.slice(2)) });
    else doc.push({ type: "paragraph", spans: parseInline(line) });
  }
  flushBullets();
  return doc;
}

function spansToPlain(spans: Span[]): string {
  return spans
    .map((s) => (s.bold ? `**${s.text}**` : s.italic ? `*${s.text}*` : s.text))
    .join("");
}

export function richDocToPlain(doc: RichDoc): string {
  if (!Array.isArray(doc)) return "";
  const out: string[] = [];
  for (const node of doc) {
    switch (node.type) {
      case "heading":
        out.push(`${"#".repeat(node.level)} ${spansToPlain(node.spans)}`);
        break;
      case "quote":
        out.push(`> ${spansToPlain(node.spans)}`);
        break;
      case "bulletList":
      case "numberedList":
        for (const it of node.items) out.push(`- ${spansToPlain(it.spans)}`);
        break;
      case "paragraph":
      default:
        out.push(spansToPlain(node.spans));
        break;
    }
  }
  return out.join("\n");
}
