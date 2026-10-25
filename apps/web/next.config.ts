import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The "N" badge sat on top of the bottom-left HUD; errors still surface without it.
  devIndicators: false,
  transpilePackages: ["@ludo/engine", "@ludo/themepack"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
