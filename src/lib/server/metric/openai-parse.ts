/**
 * Pure parsing of an OpenAI Responses payload (no server-only import, so it is
 * unit testable). Aggregates the assistant text and collects file-citation ids
 * used to map answers back to internal sources.
 */
export interface CreateResponseResult {
  text: string;
  responseId: string;
  citedFileIds: string[];
  usage: { inputTokens: number; outputTokens: number } | null;
  /** True when OpenAI reports the answer was cut off by the output-token limit. */
  truncated: boolean;
}

export function parseResponsePayload(data: unknown): CreateResponseResult {
  const d = data as {
    id?: string;
    status?: string;
    incomplete_details?: { reason?: string } | null;
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string; annotations?: Array<{ type?: string; file_id?: string }> }>;
    }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const cited = new Set<string>();
  let text = "";
  for (const item of d.output ?? []) {
    if (item.type !== "message") continue;
    for (const c of item.content ?? []) {
      if (c.type === "output_text" && typeof c.text === "string") text += c.text;
      for (const a of c.annotations ?? []) {
        if (a.type === "file_citation" && a.file_id) cited.add(a.file_id);
      }
    }
  }
  if (!text && typeof d.output_text === "string") text = d.output_text;
  const truncated = d.status === "incomplete" && d.incomplete_details?.reason === "max_output_tokens";
  return {
    text: text.trim(),
    responseId: d.id ?? "",
    citedFileIds: [...cited],
    usage: d.usage ? { inputTokens: d.usage.input_tokens ?? 0, outputTokens: d.usage.output_tokens ?? 0 } : null,
    truncated,
  };
}
