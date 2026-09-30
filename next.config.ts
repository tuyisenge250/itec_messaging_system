import type { NextConfig } from "next";
import path from "node:path";

// 'unsafe-inline' on script-src is a deliberate tradeoff for Next.js's inline
// hydration script — a nonce-based CSP would remove it but needs more invasive
// wiring. Still blocks the common case of an XSS payload loading an external
// script/resource, which is the main thing a baseline CSP buys here.
// 'unsafe-eval' is added only outside production — React's dev mode uses eval()
// for Fast Refresh/debugging call-stack reconstruction (never in production builds).
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  // Silences Turbopack's root-detection warning: there's an unrelated package-lock.json
  // in a parent directory (outside this git repo), which Turbopack would otherwise guess
  // as the workspace root.
  turbopack: {
    root: path.resolve(__dirname),
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
        ],
      },
    ];
  },
};

export default nextConfig;
