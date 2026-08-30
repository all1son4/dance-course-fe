const createNextIntlPlugin = require("next-intl/plugin");

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const path = require("path");
const isProduction = process.env.NODE_ENV === "production";
const vercelLiveSource = "https://vercel.live";
const mixpanelRecorderSource = "https://cdn.mxpnl.com";
const mixpanelEuApiSource = "https://api-eu.mixpanel.com";
const publicReleaseId =
  process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
  process.env.NEXT_PUBLIC_APP_VERSION?.trim() ||
  process.env.npm_package_version?.trim() ||
  "";
const scriptSources = [
  "'self'",
  "'unsafe-inline'",
  ...(isProduction ? [] : ["'unsafe-eval'"]),
  "https://js.stripe.com",
  "https://telegram.org",
  mixpanelRecorderSource,
  ...(isProduction ? [] : [vercelLiveSource]),
].join(" ");
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  `script-src ${scriptSources}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  `connect-src 'self' https://api.stripe.com https://r.stripe.com https://js.stripe.com https://hooks.stripe.com ${mixpanelEuApiSource} https://fonts.googleapis.com ${
    isProduction ? "" : vercelLiveSource
  }`.trim(),
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://www.youtube.com https://www.youtube-nocookie.com",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

// Public assets are not content-hashed, so they must not be `immutable`:
// browsers keep them for a day, the edge for a week, and either may serve a
// stale copy while revalidating. Long enough that a repeat visit never
// re-downloads the hero photo; short enough that a replaced file lands.
const publicAssetCacheControl =
  "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800";

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_APP_RELEASE_ID: publicReleaseId,
  },
  compiler: {
    // Readable class names are a dev-time aid; in production they only add
    // ~14 KB of `page-styles__Foo-sc-…` to every HTML response.
    styledComponents: { displayName: !isProduction, ssr: true },
  },
  async headers() {
    return [
      ...["/svg/:path*", "/images/:path*", "/videos/:path*"].map((source) => ({
        source,
        headers: [{ key: "Cache-Control", value: publicAssetCacheControl }],
      })),
      {
        source: "/:path*",
        headers: [
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          ...(isProduction
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains; preload",
                },
              ]
            : []),
        ],
      },
    ];
  },
  images: {
    // Favor faster on-demand transformations on first hit.
    formats: ["image/webp"],
    // The widest rendered image is ~800 CSS px; the default ladder went up to
    // 3840w and put eight candidates into every srcset.
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    qualities: [75],
    // Optimized variants are served for 30 days instead of the 4h default.
    minimumCacheTTL: 2_592_000,
  },
  turbopack: {
    root: path.join(__dirname),
  },
};

module.exports = withNextIntl(nextConfig);
