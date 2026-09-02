import type { NextConfig } from "next";

// Baca basePath dari env — kosong = subdomain langsung, isi = pakai path
// Contoh: NEXT_PUBLIC_BASE_PATH=/inventaris
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  serverExternalPackages: ["bcryptjs", "archiver"],
  allowedDevOrigins: ["10.41.0.5"],

  // basePath otomatis prefix semua <Link>, <Image>, router.push, redirect()
  // Kosongkan env var untuk kembali ke subdomain langsung tanpa path prefix
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
};

export default nextConfig;
