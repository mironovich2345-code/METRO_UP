/**
 * Pure parsing of OpenAI Responses SSE blocks (no server-only import, unit
 * testable). A raw stream is split on blank lines into blocks; each block is
 * turned into one incremental text delta, the final response object, or an error
 * signal. The transport uses this to stream text and to derive the final state.
 */
export type StreamEvent =
  | { kind: "delta"; text: string }
  | { kind: "final"; response: unknown }
  | { kind: "error" };

export function parseSSEBlock(block: string): StreamEvent | null {
  const dataLines = block
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trimStart());
  if (dataLines.length === 0) return null;
  const payload = dataLines.join("\n");
  if (payload === "[DONE]") return null;

  let evt: { type?: string; delta?: unknown; response?: unknown };
  try {
    evt = JSON.parse(payload);
  } catch {
    return null;
  }
  const type = evt.type;
  if (type === "response.output_text.delta" && typeof evt.delta === "string") return { kind: "delta", text: evt.delta };
  if (type === "response.completed" || type === "response.incomplete") return { kind: "final", response: evt.response ?? evt };
  if (type === "response.failed" || type === "error") return { kind: "error" };
  return null;
}

/** Split a growing buffer into complete SSE blocks + the unconsumed remainder. */
export function splitSSE(buffer: string): { blocks: string[]; rest: string } {
  const parts = buffer.split(/\n\n/);
  const rest = parts.pop() ?? "";
  return { blocks: parts, rest };
}
