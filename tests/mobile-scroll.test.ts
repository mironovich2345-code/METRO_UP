import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Regression guard for the Android Telegram Mini App scroll bug.
 *
 * Root cause: `overflow-x: hidden` on <html>/<body> forces overflow-y to compute
 * to `auto` (CSS Overflow spec), turning both into nested scroll containers. iOS
 * tolerated it; the Android Telegram WebView did not scroll. The fix keeps the
 * document (viewport) as the single vertical scroll owner via `overflow-x: clip`.
 * These assertions fail if that regresses.
 */
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const css = read("src/app/globals.css");

/** Extract the declaration body of a top-level CSS rule (no nested braces). */
function ruleBody(source: string, selector: string): string {
  const re = new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`);
  const m = source.match(re);
  assert.ok(m, `CSS rule not found: ${selector}`);
  return m![1];
}

const htmlRule = ruleBody(css, "html");
const bodyRule = ruleBody(css, "body");
const shellRule = ruleBody(css, ".app-shell");

test("scroll: <html> and <body> use overflow-x: clip (single document scroll owner)", () => {
  assert.match(htmlRule, /overflow-x:\s*clip/);
  assert.match(bodyRule, /overflow-x:\s*clip/);
});

test("scroll: the document scroller is never vertically clipped or viewport-locked", () => {
  for (const [name, rule] of [["html", htmlRule], ["body", bodyRule]] as const) {
    assert.doesNotMatch(rule, /overflow-y:\s*hidden/, `${name} must not clip vertical scroll`);
    assert.doesNotMatch(rule, /overflow:\s*hidden/, `${name} must not clip scroll`);
    // A fixed 100vh height on the scroller is the other classic mobile scroll trap.
    assert.doesNotMatch(rule, /height:\s*100vh/, `${name} must not lock height to 100vh`);
  }
});

test("scroll: .app-shell is a plain flow container (min-height only, no clip/fixed height)", () => {
  assert.match(shellRule, /min-height:\s*100dvh/);
  assert.doesNotMatch(shellRule, /overflow:\s*hidden/);
  assert.doesNotMatch(shellRule, /overflow-y:\s*hidden/);
  assert.doesNotMatch(shellRule, /(^|[^-])height:\s*100vh/);
});

test("scroll: Telegram viewport is expanded and swipe-to-close is disabled (Android)", () => {
  const provider = read("src/providers/TelegramProvider.tsx");
  assert.match(provider, /\.expand\(\)/);
  assert.match(provider, /disableVerticalSwipes/);
});
