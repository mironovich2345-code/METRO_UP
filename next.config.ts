import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Telegram Mini Apps are served inside a WebView. We keep images unoptimized
  // so the app can be deployed to any static-friendly host without an image proxy.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
