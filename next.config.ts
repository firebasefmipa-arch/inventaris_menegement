import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["bcryptjs", "archiver"],

  // Izinkan akses HMR dari device lain di jaringan lokal (misalnya HP/tablet)
  allowedDevOrigins: ["10.41.0.5"],
};

export default nextConfig;
