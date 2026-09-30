"use client";

/**
 * Sprint: mini-app-performance, section 5/17 — the SWR cache is one
 * in-memory Map per browser tab, which in normal Telegram Mini App usage
 * already means "one process per account" (each Telegram user opens their
 * own fresh WebView). This module is the DEFENSE-IN-DEPTH layer on top of
 * that assumption, not a replacement for it: every cache key
 * (cache-keys.ts) is prefixed with the current owner key, so even in an
 * unexpected same-tab account-switch scenario, a leftover cached response
 * can never be read back under a different account's key.
 *
 * Set once per app load from the SAME source home-context-storage.ts's own
 * `ownerKey` already uses (the raw Telegram WebApp user id, available
 * client-side independent of the server's auth response) — see
 * AppUserProvider.tsx's own effect. Never the server-issued session/user id
 * (the client is never given one — see AppUserDTO) and never anything from
 * server response content.
 */
let ownerKey = "anon";

export function setOwnerKey(key: string) {
  ownerKey = key;
}

export function getOwnerKey(): string {
  return ownerKey;
}
