const nextConfig = {
  allowedDevOrigins: ["192.168.0.203", "192.168.0.145"],
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
