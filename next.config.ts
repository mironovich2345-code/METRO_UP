import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Build identifier exposed to the client for bootstrap telemetry — proves which
  // JS a device is actually running. Prefer an explicit value, else Railway's git
  // SHA at build time; empty (→ "unknown") locally.
  env: {
    NEXT_PUBLIC_BUILD_SHA:
      process.env.NEXT_PUBLIC_BUILD_SHA ??
      process.env.RAILWAY_GIT_COMMIT_SHA ??
      "",
  },
  // Telegram Mini Apps are served inside a WebView and only render small avatar
  // images (Telegram photo URLs / initials fallback). We disable Next's Image
  // Optimization API entirely: images load directly, no `sharp` native binary is
  // needed at runtime, and the optimizer attack surface is removed — a good fit
  // for a lightweight Railway deployment.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
