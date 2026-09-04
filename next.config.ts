import type { NextConfig } from "next";

// basePath dari env (NEXT_PUBLIC_BASE_PATH=/empati) — semua asset/link/redirect
// internal berprefix /empati, karena gateway UII hanya melewatkan path /empati/*
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  serverExternalPackages: ["bcryptjs", "archiver"],
  allowedDevOrigins: ["10.41.0.5"],

  // Workaround bug Next 16: image optimizer 400 "received null" untuk gambar
  // lokal di public/ (regresi 15.4.5+). Logo statis tidak perlu dioptimasi.
  images: { unoptimized: true },

  ...(basePath ? { basePath } : {}),
};

export default nextConfig;
