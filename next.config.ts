import type { NextConfig } from "next";

import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());

type WebpackConfig = Parameters<NonNullable<NextConfig["webpack"]>>[0];

const nextConfig: NextConfig = {
  webpack(config: WebpackConfig) {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };

    return config;
  },
};

export default nextConfig;
