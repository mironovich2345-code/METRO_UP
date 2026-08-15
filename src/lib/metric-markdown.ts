import type { RichDoc } from "@/lib/server/content-schemas";

/**
 * Safe, limited Markdown → structured RichDoc for Metric assistant messages
 * (pure — unit testable). Supports paragraphs, line breaks, bold, italic, bullet
 * lists and numbered lists. NO raw HTML is ever produced — the output is rendered
 * by the RichText component as plain text nodes, so it is XSS-safe by construction.
 */
type Span = { text: string; bold?: boolean; italic?: boolean };

function parseInline(text: string): Span[] {
  const spans: Span[] = [];
  const re = /(\*\*([^*]+)\*\*)|(__([^_]+)__)|(\*([^*]+)\*)|(_([^_]+)_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) spans.push({ text: text.slice(last, m.index) });
    if (m[2] !== undefined || m[4] !== undefined) spans.push({ text: m[2] ?? m[4], bold: true });
    else spans.push({ text: m[6] ?? m[8], italic: true });
    last = re.lastIndex;
  }
  if (last < text.length) spans.push({ text: text.slice(last) });
  return spans.length ? spans : [{ text }];
}

export function metricMarkdownToRichDoc(input: string): RichDoc {
  const lines = (input ?? "").replace(/\r\n/g, "\n").split("\n");
  const doc: RichDoc = [];
  let bullets: { spans: Span[] }[] = [];
  let numbers: { spans: Span[] }[] = [];
  const flushBullets = () => { if (bullets.length) { doc.push({ type: "bulletList", items: bullets }); bullets = []; } };
  const flushNumbers = () => { if (numbers.length) { doc.push({ type: "numberedList", items: numbers }); numbers = []; } };
  const flush = () => { flushBullets(); flushNumbers(); };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet) { flushNumbers(); bullets.push({ spans: parseInline(bullet[1]) }); continue; }
    if (numbered) { flushBullets(); numbers.push({ spans: parseInline(numbered[1]) }); continue; }
    flush();
    if (!line.trim()) continue;
    if (/^###\s+/.test(line)) doc.push({ type: "heading", level: 3, spans: parseInline(line.replace(/^###\s+/, "")) });
    else if (/^##\s+/.test(line)) doc.push({ type: "heading", level: 2, spans: parseInline(line.replace(/^##\s+/, "")) });
    else if (/^#\s+/.test(line)) doc.push({ type: "heading", level: 1, spans: parseInline(line.replace(/^#\s+/, "")) });
    else if (/^>\s+/.test(line)) doc.push({ type: "quote", spans: parseInline(line.replace(/^>\s+/, "")) });
    else doc.push({ type: "paragraph", spans: parseInline(line) });
  }
  flush();
  return doc.length ? doc : [{ type: "paragraph", spans: [{ text: input ?? "" }] }];
}
