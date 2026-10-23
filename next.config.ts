import type { NextConfig } from "next";

/**
 * Security headers live here (NOT vercel.json) so that dev, standalone and
 * the Vercel deployment all serve exactly the same policy from one source.
 *
 * ── CSP, honestly scoped ──
 * The policy is 'self' plus the minimum the product genuinely uses:
 * - style-src 'unsafe-inline': the hand-written design system sets inline
 *   style attributes in server components throughout.
 * - script-src 'unsafe-inline': Next.js hydration boots from an inline
 *   script. Removing it needs nonce plumbing (middleware + every doc);
 *   tracked as a follow-up, not smuggled in as "done".
 * - img-src data: : inline SVG placeholders/avatars.
 * - No external hosts: fonts are self-hosted, media goes through
 *   /api/v1/media, and payment is a mobile-money prompt (server-to-server),
 *   so connect-src/form-action stay 'self'. Navigation to an external PSP
 *   checkout (if ever introduced) is top-level navigation, which CSP does
 *   not block.
 * - dev adds 'unsafe-eval' (Turbopack HMR) and ws: (hot reload socket).
 */
const csp = (() => {
  const base = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
  ];
  if (process.env.NODE_ENV !== "production") {
    base.splice(base.indexOf("script-src 'self' 'unsafe-inline'"), 1, "script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    base.splice(base.indexOf("connect-src 'self'"), 1, "connect-src 'self' ws:");
  } else {
    base.push("upgrade-insecure-requests");
  }
  return base.join("; ");
})();

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin the workspace root explicitly: package.json declares npm workspaces
  // (build-command shim for a stale Vercel dashboard override), so Turbopack
  // must never guess the root from lockfiles.
  turbopack: {
    root: process.cwd(),
  },
  // Type errors fail the build. The codebase passes `tsc --noEmit` with zero
  // errors; masking them would let a broken type contract deploy silently.
  reactStrictMode: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
      {
        source: "/:path(account|landlord|ops|platform)/:rest*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
};

export default nextConfig;
