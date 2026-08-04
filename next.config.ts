import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
