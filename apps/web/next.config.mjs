import path from "node:path";

const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname ?? ".", "..", ".."),
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
