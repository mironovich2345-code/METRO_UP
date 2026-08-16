/**
 * Pure consumer of an OpenAI Responses SSE byte stream (no server-only import →
 * unit testable). Reads a byte reader, emits text deltas, and returns the final
 * response object.
 *
 * Two safety invariants are the whole point of this module (they are what the
 * v2 CPU incident violated):
 *  1. STOP reading the moment the final event arrives — never keep pulling a
 *     stream the upstream leaves open after `response.completed`. Doing so pegged
 *     the CPU and starved the Node event loop.
 *  2. ALWAYS cancel the reader in `finally` — release the socket whether we broke
 *     early, finished, or threw.
 * Overall duration / client-disconnect are bounded by the caller via an
 * AbortController on the fetch (which makes `read()` reject and unwinds here).
 */
import { parseSSEBlock, splitSSE } from "./stream-parse";

/** Minimal reader shape — matches ReadableStreamDefaultReader<Uint8Array>. */
export interface ByteReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel(reason?: unknown): Promise<void>;
}

export class SSEStreamError extends Error {
  constructor() {
    super("openai_stream_error");
    this.name = "SSEStreamError";
  }
}

/**
 * Drain `reader`, calling `onDelta` for each incremental text chunk. Returns the
 * final response object, or `null` if the stream ended without one. Throws
 * `SSEStreamError` on an upstream error event. The reader is always cancelled.
 */
export async function consumeSSEStream(reader: ByteReader, onDelta: (text: string) => void): Promise<unknown> {
  const decoder = new TextDecoder();
  let buf = "";
  let finalResponse: unknown = null;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) buf += decoder.decode(value, { stream: true });
      const { blocks, rest } = splitSSE(buf);
      buf = rest;
      for (const block of blocks) {
        const evt = parseSSEBlock(block);
        if (!evt) continue;
        if (evt.kind === "delta") onDelta(evt.text);
        else if (evt.kind === "final") finalResponse = evt.response;
        else if (evt.kind === "error") throw new SSEStreamError();
      }
      // Invariant #1: stop as soon as the answer is complete.
      if (finalResponse) break;
    }
    if (!finalResponse) {
      const tail = parseSSEBlock(buf);
      if (tail?.kind === "final") finalResponse = tail.response;
    }
    return finalResponse;
  } finally {
    // Invariant #2: release the connection no matter how we leave.
    try { await reader.cancel(); } catch { /* already released */ }
  }
}
