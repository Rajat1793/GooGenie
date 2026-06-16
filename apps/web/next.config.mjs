import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Smaller Render deploy artifact + works with monorepo file tracing.
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),

  // Source-level imports from our workspace packages.
  transpilePackages: ["@googenie/server", "@googenie/db", "@googenie/contracts"],

  // CJS / native packages that should not be bundled into the server runtime.
  // Keep this list in sync with `instrumentation.ts` imports.
  serverExternalPackages: [
    "pg",
    "pg-native",
    "pg-connection-string",
    "pgpass",
    "corsair",
    "@corsair-dev/gmail",
    "@corsair-dev/googlecalendar",
    "kysely",
    "better-sqlite3",
    "jsonwebtoken",
    "jwks-rsa",
    "openai",
    "drizzle-orm",
    "bcryptjs",
    "dotenv",
  ],

  experimental: {
    // `instrumentation.ts` (register hook) is GA in Next 15.1+, no flag needed.
    serverActions: { bodySizeLimit: "64kb" },
  },

  // Webpack config for both server and client bundles.
  webpack(config, { isServer }) {
    config.resolve = config.resolve || {};
    if (!isServer) {
      // Client bundle: never reach Node builtins (transpiled package source
      // references them through unreachable code paths).
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        fs: false, net: false, tls: false, dns: false, http: false, https: false,
        os: false, path: false, crypto: false, stream: false, util: false, zlib: false,
        url: false, querystring: false, child_process: false, "fs/promises": false,
        string_decoder: false, buffer: false,
        "node:fs": false, "node:net": false, "node:tls": false, "node:dns": false,
        "node:http": false, "node:https": false, "node:os": false, "node:path": false,
        "node:crypto": false, "node:stream": false, "node:util": false,
      };
    } else {
      // Server bundle: keep Node builtins external (CJS require) so webpack
      // doesn't try to inline them when reached through nested CJS deps like
      // `pgpass → split2 → stream`.
      const NODE_BUILTINS =
        /^(?:node:)?(?:assert|async_hooks|buffer|child_process|cluster|console|constants|crypto|dgram|diagnostics_channel|dns|domain|events|fs|http|http2|https|inspector|module|net|os|path|perf_hooks|process|punycode|querystring|readline|repl|stream|string_decoder|sys|timers|tls|trace_events|tty|url|util|v8|vm|wasi|worker_threads|zlib)(?:\/.*)?$/;
      const existing = Array.isArray(config.externals)
        ? config.externals
        : config.externals
          ? [config.externals]
          : [];
      existing.push(({ request }, callback) => {
        if (request && NODE_BUILTINS.test(request)) {
          return callback(null, "commonjs " + request);
        }
        callback();
      });
      config.externals = existing;
    }
    return config;
  },

  // CORS for the mobile app is handled in middleware.ts.
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
