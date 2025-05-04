import type {NextConfig} from 'next';

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
              // You can be more specific with the pathname if needed,
              // but often allowing the whole hostname is sufficient for Firebase Storage.
              pathname: '/**', 
          },
          // Add other allowed hostnames here if needed
          // e.g., for user profile pictures from other sources
      ],
  },
};

export default nextConfig;
