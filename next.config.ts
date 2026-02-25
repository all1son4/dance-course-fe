const createNextIntlPlugin = require("next-intl/plugin");

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  compiler: {
    styledComponents: true,
  },
  images: {
    // We serve pre-compressed local assets from /public to avoid runtime optimization latency.
    unoptimized: true,
  },
  turbopack: {
    root: path.join(__dirname),
  },
};

module.exports = withNextIntl(nextConfig);
