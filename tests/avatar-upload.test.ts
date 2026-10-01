import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { validateUpload, randomStorageKey, mediaKindForMime, MEDIA_RULES } from "../src/lib/storage/validation";
import { avatarKeyPrefix, isOwnAvatarKey, extForAvatarMime } from "../src/lib/server/avatar-core";
import { baseScaleFor, clampPan, computeCropRect } from "../src/lib/client/avatar-crop-math";

/**
 * METRO UP ROUND 1, Milestone 1 — avatar upload.
 *
 * Pure, DB/storage-free coverage below: the AVATAR validation rule,
 * ownership-key derivation (avatar-core.ts), and the crop-sheet's pan/zoom/
 * crop-rect geometry (avatar-crop-math.ts). The actual signed-upload/
 * headObject/Prisma-write flow (avatar.ts's requestAvatarUpload/
 * completeAvatarUpload) requires a live Postgres + configured S3-compatible
 * storage — not available under node:test, matching this repo's established
 * convention — covered by named, traceable skip stubs instead.
 */
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const skipNoDb = { skip: "integration: requires Postgres + configured S3-compatible storage (not available under node:test)" } as const;

/* ============================ AVATAR validation rule ============================ */

test("AVATAR-RULE-A: accepts jpeg/png/webp within the 3 MB ceiling", () => {
  for (const mime of MEDIA_RULES.AVATAR.mimes) {
    assert.deepEqual(validateUpload("AVATAR", mime, 500_000), { ok: true });
  }
});

test("AVATAR-RULE-B: rejects an unsupported MIME (e.g. a disguised HTML/executable upload)", () => {
  const result = validateUpload("AVATAR", "text/html", 1000);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "UNSUPPORTED_MIME");
});

test("AVATAR-RULE-C: rejects a file over the 3 MB ceiling", () => {
  const result = validateUpload("AVATAR", "image/jpeg", 4 * 1024 * 1024);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "FILE_TOO_LARGE");
});

test("AVATAR-RULE-D: rejects an invalid/non-positive declared size", () => {
  const result = validateUpload("AVATAR", "image/jpeg", 0);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "INVALID_SIZE");
});

test("AVATAR-RULE-E: the AVATAR rule is STRICTER than the generic IMAGE rule (3 MB vs 10 MB) — a real avatar is small, this is a safety ceiling not a target", () => {
  assert.ok(MEDIA_RULES.AVATAR.maxBytes < MEDIA_RULES.IMAGE.maxBytes);
});

test("AVATAR-RULE-F: randomStorageKey for AVATAR uses the 'avatars/' prefix and derives extension from MIME only (never a client-supplied filename)", () => {
  const key = randomStorageKey("AVATAR", "image/webp");
  assert.match(key, /^avatars\/[0-9a-f-]+\.webp$/);
});

test("AVATAR-RULE-G: mediaKindForMime (the GENERIC admin media-upload auto-detector) never returns AVATAR — avatars have their own dedicated, non-MediaAsset upload path", () => {
  for (const mime of ["video/mp4", "image/jpeg", "application/pdf", "image/webp"]) {
    assert.notEqual(mediaKindForMime(mime), "AVATAR");
  }
});

/* ============================ ownership (avatar-core.ts) ============================ */

test("AVATAR-OWN-A: a user's own freshly-issued key is recognized as their own", () => {
  const key = `${avatarKeyPrefix("user-1")}abc123.jpg`;
  assert.equal(isOwnAvatarKey("user-1", key), true);
});

test("AVATAR-OWN-B: user A can never complete with user B's key — the exact 'userId=<another user>' attack section 7 calls out", () => {
  const userBsKey = `${avatarKeyPrefix("user-B")}abc123.jpg`;
  assert.equal(isOwnAvatarKey("user-A", userBsKey), false);
});

test("AVATAR-OWN-C: a key with no namespace at all (malformed/legacy) is never treated as anyone's own", () => {
  assert.equal(isOwnAvatarKey("user-1", "abc123.jpg"), false);
});

test("AVATAR-OWN-D: a key under a DIFFERENT top-level prefix (e.g. a lesson image) is never mistaken for an avatar key", () => {
  assert.equal(isOwnAvatarKey("user-1", "images/abc123.jpg"), false);
});

test("AVATAR-OWN-E: extForAvatarMime maps every allowed AVATAR mime to a real extension, and falls back safely for an unexpected mime", () => {
  assert.equal(extForAvatarMime("image/jpeg"), "jpg");
  assert.equal(extForAvatarMime("image/png"), "png");
  assert.equal(extForAvatarMime("image/webp"), "webp");
  assert.equal(extForAvatarMime("application/octet-stream"), "jpg"); // safe fallback, never undefined/crash
});

/* ============================ crop math (avatar-crop-math.ts) ============================ */

test("CROP-MATH-A: baseScaleFor fits the SHORTER natural dimension exactly to the viewport (cover-fit) at zoom=1", () => {
  const scale = baseScaleFor({ w: 1000, h: 2000 }, 300);
  assert.equal(scale, 300 / 1000);
});

test("CROP-MATH-B: at zoom=1 with no pan, the crop rect is centered on the shorter dimension and spans exactly that dimension (a square from the middle of a portrait photo)", () => {
  const rect = computeCropRect({ w: 1000, h: 2000 }, 300, 1, { x: 0, y: 0 });
  assert.equal(Math.round(rect.srcSize), 1000);
  assert.equal(Math.round(rect.srcX), 0);
  // vertically centered: (2000 - 1000) / 2 = 500
  assert.equal(Math.round(rect.srcY), 500);
});

test("CROP-MATH-C: zooming in shrinks the source crop size proportionally (2x zoom -> half the natural pixels captured)", () => {
  const rect1 = computeCropRect({ w: 1000, h: 1000 }, 300, 1, { x: 0, y: 0 });
  const rect2 = computeCropRect({ w: 1000, h: 1000 }, 300, 2, { x: 0, y: 0 });
  assert.ok(Math.abs(rect2.srcSize - rect1.srcSize / 2) < 0.01);
});

test("CROP-MATH-D: clampPan never lets the image's edge expose a gap inside the viewport — panning far beyond the image's bounds is clamped back to the max valid offset", () => {
  const natural = { w: 1000, h: 1000 };
  const viewport = 300;
  const zoom = 2; // rendered image is 600x600, viewport is 300x300 -> max pan is 150 each way
  const clamped = clampPan({ x: 10_000, y: -10_000 }, natural, viewport, zoom);
  assert.equal(clamped.x, 150);
  assert.equal(clamped.y, -150);
});

test("CROP-MATH-E: at zoom=1 on a perfectly square image, pan is always clamped to exactly 0 in both axes (rendered size equals viewport, no room to pan)", () => {
  const clamped = clampPan({ x: 500, y: 500 }, { w: 800, h: 800 }, 300, 1);
  assert.equal(clamped.x, 0);
  assert.equal(clamped.y, 0);
});

test("CROP-MATH-F: a crop rect's source coordinates are always within the natural image bounds, even at extreme pan/zoom combinations (defensive clamp inside computeCropRect itself)", () => {
  const natural = { w: 400, h: 300 };
  const rect = computeCropRect(natural, 300, 3, { x: 9999, y: 9999 });
  assert.ok(rect.srcX >= 0 && rect.srcX + rect.srcSize <= natural.w + 0.01);
  assert.ok(rect.srcY >= 0 && rect.srcY + rect.srcSize <= natural.h + 0.01);
});

/* ============================ DTO wiring (source-text) ============================ */

test("AVATAR-DTO-A: meDTO derives avatarUrl from the uploaded avatarStorageKey, never from telegramPhotoUrl — no accidental Telegram-photo fallback", () => {
  const src = read("src/lib/server/dto.ts");
  assert.match(src, /avatarUrl: avatarUrlForKey\(user\.avatarStorageKey/);
});

test("AVATAR-DTO-B: AppUserDTO declares avatarUrl as string | null (never optional/undefined) — every consumer can rely on the field always being present", () => {
  const src = read("src/lib/api/types.ts");
  assert.match(src, /avatarUrl: string \| null;/);
});

/* ============================ client rendering (source-text) ============================ */

test("AVATAR-RENDER-A: Home and Profile pass the custom avatarUrl to <Avatar>, never telegramUser.photoUrl — the product rule is initials-or-custom-photo, never Telegram photo as a silent fallback", () => {
  for (const file of ["src/app/home/page.tsx", "src/app/profile/page.tsx"]) {
    const src = read(file);
    assert.doesNotMatch(src, /<Avatar[^/]*src=\{telegramUser\.photoUrl\}/s, `${file} must not pass telegramUser.photoUrl to <Avatar>`);
  }
});

test("AVATAR-RENDER-B: the Avatar component itself shows initials whenever src is absent/falsy or fails to load — no custom avatar is the ONLY no-photo state (no Telegram-photo intermediate fallback exists anywhere in the component)", () => {
  const src = read("src/components/ui/avatar.tsx");
  assert.match(src, /const showImage = src && !failed;/);
  assert.doesNotMatch(src, /telegram/i);
});

/* ============================ security (source-text) ============================ */

test("AVATAR-SEC-A: both avatar API routes derive the acting user from the session (requireActiveAccess) and never accept a client-supplied userId", () => {
  for (const file of ["src/app/api/profile/avatar/upload-url/route.ts", "src/app/api/profile/avatar/complete/route.ts"]) {
    const src = read(file);
    assert.match(src, /requireActiveAccess\(\)/, `${file} must derive identity from the session`);
    assert.doesNotMatch(src, /body\.userId|params\.userId|searchParams\.get\(.userId.\)/, `${file} must never accept a client-supplied userId`);
  }
});

test("AVATAR-SEC-B: completeAvatarUpload enforces isOwnAvatarKey BEFORE touching storage/DB — ownership is checked first, not as an afterthought", () => {
  const src = read("src/lib/server/avatar.ts");
  const fnStart = src.indexOf("export async function completeAvatarUpload");
  const ownCheckIdx = src.indexOf("isOwnAvatarKey(userId, storageKey)", fnStart);
  const headObjectIdx = src.indexOf("storage.headObject(storageKey)", fnStart);
  assert.ok(ownCheckIdx > fnStart && headObjectIdx > ownCheckIdx, "expected the ownership check before any storage access");
});

test("AVATAR-SEC-C: completeAvatarUpload re-validates the REAL mime/size storage reports (never trusts the client's original declared values at upload-url time)", () => {
  const src = read("src/lib/server/avatar.ts");
  assert.match(src, /validateUpload\("AVATAR", head\.mimeType/);
});

/* ============================ schema (additive, nullable) ============================ */

test("AVATAR-SCHEMA-A: User.avatarStorageKey is nullable (no default needed) — additive, non-destructive, every existing row is unaffected", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /avatarStorageKey\s+String\?/);
});

test("AVATAR-SCHEMA-B: the migration only ADDs a column, never drops/alters an existing one", () => {
  const migration = read("prisma/migrations/20261001000000_user_avatar/migration.sql");
  assert.match(migration, /ADD COLUMN\s+"avatarStorageKey" TEXT;/);
  assert.doesNotMatch(migration, /DROP|ALTER COLUMN.*SET NOT NULL/i);
});

/* ===================== DB/storage-dependent integration (traceable skip stubs) ===================== */

test("AVATAR-INT-A: self upload — a user's own upload-url + PUT + complete flow sets their User.avatarStorageKey", skipNoDb, () => {});
test("AVATAR-INT-B: other-user upload denied — completing with a storageKey under a DIFFERENT user's namespace is rejected 403, their avatarStorageKey is untouched", skipNoDb, () => {});
test("AVATAR-INT-C: replace — uploading a second avatar updates avatarStorageKey and best-effort deletes the previous object from storage", skipNoDb, () => {});
test("AVATAR-INT-D: no photo — a user with avatarStorageKey=null renders initials everywhere the Avatar component is used", skipNoDb, () => {});
test("AVATAR-INT-E: persistence — avatarUrl survives /api/auth/me across a fresh session (close/reopen), sourced from the DB column, not any client-side cache", skipNoDb, () => {});
test("AVATAR-INT-F: invalid file rejected safely — a PUT whose actual Content-Type (per storage headObject) is not jpeg/png/webp is rejected at complete-time and the object is deleted, never committed as an avatar", skipNoDb, () => {});
