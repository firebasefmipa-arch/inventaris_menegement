import { unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

/**
 * Hapus file upload dari disk berdasarkan URL publik (/uploads/...).
 * No-op bila URL null/kosong/"deleted" atau file tak ada. Return true jika terhapus.
 * Dipakai saat pengajuan ditolak/dibatalkan — file tak disimpan, riwayat tetap.
 */
export async function deleteUploadByUrl(url: string | null | undefined): Promise<boolean> {
  if (!url || url === "deleted" || !url.startsWith("/uploads/")) return false;
  const filePath = path.join(process.cwd(), "public", url);
  if (!existsSync(filePath)) return false;
  try {
    await unlink(filePath);
    return true;
  } catch {
    return false;
  }
}
