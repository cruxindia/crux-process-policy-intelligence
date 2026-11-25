import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Oracle (D-104) dropped: it needs a payment card (owner, 25-Nov). Hosting stays on Netlify Free (D-114); its runtime builds the server itself.
  // For a self-hosted VM later, add output: "standalone" (deploy/oracle).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
