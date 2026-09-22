import path from "path";

/**
 * Satu-satunya sumber lokasi fisik berkas unggahan.
 *
 * Folder ini sengaja DI LUAR `public/` supaya Next.js TIDAK melayaninya sebagai
 * berkas statis. Semua akses harus lewat route `src/app/uploads/[...path]/route.ts`
 * yang memeriksa sesi + kepemilikan.
 *
 * URL yang disimpan di DB tetap berbentuk `/uploads/...` (dilayani route itu),
 * jadi data lama tidak perlu diubah. Ganti lokasi fisik tanpa ubah kode:
 * set `UPLOAD_DIR` di .env.local.
 */
export const UPLOAD_ROOT = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), "uploads");

/** Jalur fisik dari potongan nama, mis. uploadPath("pending") atau uploadPath("signed_forms", f). */
export function uploadPath(...segmen: string[]): string {
  return path.join(UPLOAD_ROOT, ...segmen);
}

/** Jalur fisik dari URL DB: "/uploads/pending/a.pdf" -> <root>/pending/a.pdf. */
export function uploadPathFromUrl(url: string): string {
  return path.join(UPLOAD_ROOT, url.replace(/^\/uploads\//, ""));
}

/**
 * True bila URL menunjuk berkas di dalam UPLOAD_ROOT (cegah `../` keluar folder).
 * Dipakai route penyaji sebelum menyentuh disk.
 */
export function isInsideUploadRoot(filePath: string): boolean {
  const abs = path.resolve(filePath);
  return abs === UPLOAD_ROOT || abs.startsWith(UPLOAD_ROOT + path.sep);
}
