/**
 * Pure mapping between an OpenAI vector-store file's INDEXING status and our
 * KnowledgeSyncRecord.status (no server-only import → unit testable).
 *
 * The invariant this enforces: a record is only "SYNCED" when the file has
 * actually finished indexing and is therefore RETRIEVABLE by file_search. A file
 * that merely uploaded/attached is still `in_progress` and must NOT be reported as
 * synced — that false-positive is what made a published document invisible to
 * retrieval while Control showed it as "Синхронизировано".
 */
import type { VectorStoreFileStatus } from "./openai";

export type SyncStatus = "SYNCED" | "PENDING" | "FAILED";

export function indexStatusToSyncStatus(status: VectorStoreFileStatus): SyncStatus {
  if (status === "completed") return "SYNCED";           // indexed → retrievable
  if (status === "failed" || status === "cancelled") return "FAILED"; // terminal, not retrievable
  return "PENDING"; // in_progress / unknown → not retrievable yet, safe to retry
}

/** A source is only usable by retrieval / source-cards when it is SYNCED. */
export function isRetrievableSyncStatus(status: string): boolean {
  return status === "SYNCED";
}
