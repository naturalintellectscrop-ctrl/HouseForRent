import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin the workspace root explicitly: package.json declares npm workspaces
  // (build-command shim for a stale Vercel dashboard override), so Turbopack
  // must never guess the root from lockfiles.
  turbopack: {
    root: process.cwd(),
  },
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
