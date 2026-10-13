/**
 * The Responses API request body (pure; no server-only import, so it is
 * unit-tested). Shared by streaming + non-streaming calls.
 */
import type { CreateResponseInput } from "./openai";

export function buildResponseBody(input: CreateResponseInput, stream: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.model,
    instructions: input.instructions,
    input: input.messages.map((m) => ({ role: m.role, content: m.content })),
    max_output_tokens: input.maxOutputTokens,
  };
  if (input.useFileSearch !== false) {
    const tool: Record<string, unknown> = {
      type: "file_search",
      vector_store_ids: [input.vectorStoreId],
      max_num_results: input.maxNumResults ?? 6,
    };
    if (input.filters) tool.filters = input.filters;
    body.tools = [tool];
  }
  if (input.reasoningEffort) body.reasoning = { effort: input.reasoningEffort };
  if (stream) body.stream = true;
  return body;
}
