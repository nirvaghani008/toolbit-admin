import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async redirects() {
    return [
      {
        source: '/admin/login',
        destination: '/login',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
