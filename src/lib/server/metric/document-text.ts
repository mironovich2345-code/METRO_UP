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

/*
 * Extraction guards. PDF content is untrusted binary: a stream that is not clean
 * FlateDecode falls back to raw bytes, and any operator scan must stay LINEAR and
 * BOUNDED so a malformed / Google-generated PDF can never peg the CPU or block the
 * event loop. These caps are the safety net on top of the (now linear) regexes.
 */
const PDF_BUDGET_MS = 2000;          // hard wall-clock ceiling for a single PDF
const PDF_MAX_STREAMS = 5000;        // stop after this many content streams
const PDF_MAX_STREAM_CHARS = 200_000; // chars of one stream fed to the regexes
const PDF_MAX_TEXT_CHARS = 5_000_000;   // total extracted text ceiling
// Upper bound on a single string/array operator. Real PDF text operators are far
// shorter; capping the quantifier keeps each match O(1) so the overall scan is
// linear even on adversarial binary (no O(n^2) from a group swallowing '[').
const PDF_MAX_OP_CHARS = 2000;

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

/*
 * Characters that must be stripped before text is stored / indexed: NUL (U+0000,
 * fatal for PostgreSQL TEXT — SQLSTATE 22021) plus the other non-printable C0
 * control characters and DEL (U+007F). TAB (9), LF (10) and CR (13) are KEPT so
 * line breaks and tabs survive. The class is built from code points so the source
 * file contains no literal control bytes and no fragile escape sequences.
 */
const cc = String.fromCharCode;
const CONTROL_CHARS_RE = new RegExp(
  `[${cc(0)}-${cc(8)}${cc(11)}${cc(12)}${cc(14)}-${cc(31)}${cc(127)}]`,
  "g",
);

/**
 * The SINGLE normalization every extracted document passes through before it is
 * stored (PostgreSQL) and later indexed (RAG). It is PostgreSQL-safe: PostgreSQL
 * TEXT rejects the NUL byte, which routinely appears in text extracted from PDFs
 * that encode strings as 2-byte / Identity font codes (e.g. Google Sheets exports).
 * Every real Unicode character (Cyrillic, Latin, punctuation, emoji, …) is left
 * untouched — this is NOT an ASCII-only filter.
 */
export function sanitizeExtractedText(text: string): string {
  return text
    .replace(CONTROL_CHARS_RE, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
    // Sanitize BEFORE the emptiness check so a document that is only NUL/control
    // noise is correctly rejected as no_text (never stored, never indexed).
    text = sanitizeExtractedText(text);
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

/**
 * Pull text-showing operator strings from a decoded PDF content stream.
 *
 * Every quantifier here must have DISJOINT alternatives so the regex stays linear
 * on adversarial input. The `\\.` branch consumes an escaped pair; the negated
 * class must therefore EXCLUDE the backslash, otherwise a run of backslashes can
 * be partitioned two ways and the engine backtracks exponentially (the ReDoS that
 * hung PDF uploads). Output is also capped so a huge stream can't blow up memory.
 */
export function pdfContentToText(content: string): string {
  let out = "";
  // (string) Tj | (string) ' | (string) "   — '\\.' vs '[^\\()]' are disjoint,
  // and the bounded quantifier keeps each match O(PDF_MAX_OP_CHARS).
  const tj = new RegExp(`\\(((?:\\\\.|[^\\\\()]){0,${PDF_MAX_OP_CHARS}})\\)\\s*(?:Tj|'|")`, "g");
  let m: RegExpExecArray | null;
  while ((m = tj.exec(content))) {
    out += unescapePdf(m[1]);
    if (out.length > PDF_MAX_TEXT_CHARS) return out.slice(0, PDF_MAX_TEXT_CHARS);
  }
  // [ (a) -10 (b) ] TJ → concatenate the string parts. '[^\\[\]]' EXCLUDES the
  // backslash (disjoint from '\\.', no exponential backtracking) and the bounded
  // quantifier stops a group from scanning to end-of-buffer (no O(n^2)).
  const tjArr = new RegExp(`\\[((?:\\\\.|[^\\\\[\\]]){0,${PDF_MAX_OP_CHARS}})\\]\\s*TJ`, "g");
  while ((m = tjArr.exec(content))) {
    const parts = m[1].match(/\(((?:\\.|[^\\()])*)\)/g) ?? [];
    for (const p of parts) out += unescapePdf(p.slice(1, -1));
    if (out.length > PDF_MAX_TEXT_CHARS) return out.slice(0, PDF_MAX_TEXT_CHARS);
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
  const deadline = Date.now() + PDF_BUDGET_MS;
  let out = "";
  let streams = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    // Bounded loop: cap the number of streams and the total time. The per-stream
    // regexes are linear, so this clock check is always reached promptly.
    if (++streams > PDF_MAX_STREAMS || Date.now() > deadline) break;
    let content: string;
    try {
      content = inflateSync(Buffer.from(m[1], "latin1")).toString("latin1");
    } catch {
      content = m[1];
    }
    // Never feed an unbounded raw stream to the regexes.
    if (content.length > PDF_MAX_STREAM_CHARS) content = content.slice(0, PDF_MAX_STREAM_CHARS);
    out += pdfContentToText(content);
    if (out.length > PDF_MAX_TEXT_CHARS) break;
  }
  return out;
}
