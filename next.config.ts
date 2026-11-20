import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  staticPageGenerationTimeout: 180,
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.ytimg.com",
        pathname: "/vi/**",
      },
    ],
  },
  experimental: {
    viewTransition: true,
  },
};

export default nextConfig;
