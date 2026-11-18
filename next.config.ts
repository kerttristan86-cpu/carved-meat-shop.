import type { NextConfig } from "next";
const config: NextConfig = {
  allowedDevOrigins: ["192.168.254.164"],
  experimental: {
    agentUpgrade: false,
  },
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  poweredByHeader: false,
};
export default config;
