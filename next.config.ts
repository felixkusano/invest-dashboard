import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (lokale Postgres-Engine in WASM) und postgres-js laufen nur serverseitig.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  poweredByHeader: false,
  // SQL-Migrationen werden zur Laufzeit gelesen und müssen im Serverless-Bundle enthalten sein.
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
