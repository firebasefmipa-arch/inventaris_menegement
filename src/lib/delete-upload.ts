import { unlink } from "fs/promises";
import { existsSync } from "fs";
import { uploadPathFromUrl } from "@/lib/upload-dir";

/**
 * Hapus file upload dari disk berdasarkan URL publik (/uploads/...).
 * No-op bila URL null/kosong/"deleted" atau file tak ada. Return true jika terhapus.
 * Dipakai saat pengajuan ditolak/dibatalkan — file tak disimpan, riwayat tetap.
 */
export async function deleteUploadByUrl(url: string | null | undefined): Promise<boolean> {
  if (!url || url === "deleted" || !url.startsWith("/uploads/")) return false;
  const filePath = uploadPathFromUrl(url);
  if (!existsSync(filePath)) return false;
  try {
    await unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Hapus berkas LAMA hanya bila beda dari berkas BARU.
 *
 * Saat dokumen dicetak ulang, berkas lama dibuang supaya tidak menumpuk. Tapi
 * kalau kebetulan nama berkasnya sama (mis. dokumen yang tadinya sudah di
 * folder tujuan), menghapus "yang lama" berarti menghapus berkas yang baru
 * saja ditulis — dokumennya hilang seketika.
 */
export async function deleteUploadIfDifferent(
  urlBaru: string | null | undefined,
  urlLama: string | null | undefined
): Promise<boolean> {
  if (!urlBaru || !urlLama) return false;
  if (uploadPathFromUrl(urlBaru) === uploadPathFromUrl(urlLama)) return false;
  return deleteUploadByUrl(urlLama);
}
