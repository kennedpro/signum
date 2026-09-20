import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * Cabeceras de seguridad.
 *
 * En DESARROLLO React necesita eval() para el refresco rápido y la
 * reconstrucción de callstacks, por eso se permite 'unsafe-eval'.
 * En PRODUCCIÓN la política es estricta: React nunca usa eval() ahí.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      isProd
        ? "script-src 'self' 'unsafe-inline'"
        : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      isProd ? "connect-src 'self' https:" : "connect-src 'self' https: ws: wss:",
      "frame-ancestors 'self'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,
  // Incluye el SQL idempotente en la salida standalone/Docker.
  outputFileTracingIncludes: {
    "/*": ["./scripts/schema.sql"],
  },
  poweredByHeader: false,
  // pdfmake/pdfkit cargan sus métricas de fuente desde node_modules en tiempo de ejecución:
  // no deben empaquetarse con Turbopack.
  serverExternalPackages: ["pdfmake"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
