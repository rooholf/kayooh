const nextConfig = {
  transpilePackages: ["@repo/contracts"],
  async rewrites() {
    return [
      {
        source: "/owner/dashboard",
        destination: "/dashboard",
      },
    ];
  },
};

export default nextConfig;
