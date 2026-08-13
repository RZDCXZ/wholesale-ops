import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["@prisma/adapter-pg", "pg", "pino"],
};

export default nextConfig;
