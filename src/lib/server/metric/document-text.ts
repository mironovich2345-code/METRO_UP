import { inflateRawSync, inflateSync } from "node:zlib";

/**
 * Dependency-free text extraction for Metric documents (pure — unit testable; no
 * server-only import). TXT/MD are decoded directly; DOCX and PDF are extracted
 * best-effort with Node's built-in zlib (no OCR). If no usable text is found the
 * caller surfaces a clear "no extractable text" message instead of indexing an
 * empty/scanned file. The extracted text is what gets indexed — the original
 * binary stays in object storage.
 */
export type DocFormat = "txt" | "md" | "docx" | "pdf";
export type ExtractOutcome =
  | { ok: true; text: string }
  | { ok: false; reason: "unsupported" | "empty" | "no_text" };

export const DOC_MAX_BYTES = 20 * 1024 * 1024; // 20 MB

const MIME: Record<string, DocFormat> = {
  "text/plain": "txt",
  "text/markdown": "md",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};
const EXT: Record<string, DocFormat> = { txt: "txt", md: "md", markdown: "md", pdf: "pdf", docx: "docx" };

export function detectFormat(mime: string, filename: string): DocFormat | null {
  const byMime = MIME[mime.toLowerCase().split(";")[0].trim()];
  if (byMime) return byMime;
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  return EXT[ext] ?? null;
}

/** Safe filename: strip path, keep a conservative charset, cap length. */
export function sanitizeFilename(name: string): string {
  const base = name.replace(/^.*[\\/]/, "").replace(/[^\p{L}\p{N}._ -]/gu, "_").trim();
  return (base || "document").slice(0, 200);
}

function normalize(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function extractDocumentText(mime: string, filename: string, buf: Buffer): ExtractOutcome {
  const fmt = detectFormat(mime, filename);
  if (!fmt) return { ok: false, reason: "unsupported" };
  if (buf.length === 0) return { ok: false, reason: "empty" };
  try {
    let text = "";
    if (fmt === "txt" || fmt === "md") text = buf.toString("utf8");
    else if (fmt === "docx") text = extractDocx(buf);
    else text = extractPdf(buf);
    text = normalize(text);
    if (!text.trim()) return { ok: false, reason: "no_text" };
    return { ok: true, text };
  } catch {
    return { ok: false, reason: "no_text" };
  }
}

/* -------------------------------- docx ---------------------------------- */

/** Convert the WordprocessingML body XML to plain text. */
export function docxXmlToText(xml: string): string {
  return xml
    .replace(/<w:tab\b[^>]*\/>/g, "\t")
    .replace(/<w:br\b[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}

function extractDocx(buf: Buffer): string {
  // Minimal ZIP local-header scan for word/document.xml (deflate).
  let off = 0;
  while (off + 30 <= buf.length && buf.readUInt32LE(off) === 0x04034b50) {
    const method = buf.readUInt16LE(off + 8);
    const compSize = buf.readUInt32LE(off + 18);
    const nameLen = buf.readUInt16LE(off + 26);
    const extraLen = buf.readUInt16LE(off + 28);
    const name = buf.toString("utf8", off + 30, off + 30 + nameLen);
    const dataStart = off + 30 + nameLen + extraLen;
    if (name === "word/document.xml") {
      const comp = buf.subarray(dataStart, dataStart + compSize);
      const xml = method === 8 ? inflateRawSync(comp).toString("utf8") : comp.toString("utf8");
      return docxXmlToText(xml);
    }
    off = dataStart + compSize;
  }
  return "";
}

/* --------------------------------- pdf ---------------------------------- */

/** Pull text-showing operator strings from a decoded PDF content stream. */
export function pdfContentToText(content: string): string {
  let out = "";
  // (string) Tj | (string) ' | (string) "
  const tj = /\(((?:\\.|[^\\()])*)\)\s*(?:Tj|'|")/g;
  let m: RegExpExecArray | null;
  while ((m = tj.exec(content))) out += unescapePdf(m[1]);
  // [ (a) -10 (b) ] TJ  → concatenate the string parts
  const tjArr = /\[((?:[^\][]|\\.)*)\]\s*TJ/g;
  while ((m = tjArr.exec(content))) {
    const parts = m[1].match(/\(((?:\\.|[^\\()])*)\)/g) ?? [];
    for (const p of parts) out += unescapePdf(p.slice(1, -1));
  }
  return out ? out + "\n" : "";
}

function unescapePdf(s: string): string {
  return s
    .replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(").replace(/\\\)/g, ")").replace(/\\\\/g, "\\");
}

function extractPdf(buf: Buffer): string {
  const s = buf.toString("latin1");
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let out = "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    let content: string;
    try {
      content = inflateSync(Buffer.from(m[1], "latin1")).toString("latin1");
    } catch {
      content = m[1];
    }
    out += pdfContentToText(content);
  }
  return out;
}
