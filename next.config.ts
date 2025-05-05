import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
      remotePatterns: [
          {
              protocol: 'https',
              hostname: 'storage.googleapis.com',
              port: '',
              pathname: '/**',
          },
      ],
  },
  // Correct placement for allowedDevOrigins
  experimental: {
      allowedDevOrigins: ["https://9003-idx-studio-1745049831961.cluster-3gc7bglotjgwuxlqpiut7yyqt4.cloudworkstations.dev"]
  },
};

export default nextConfig;
