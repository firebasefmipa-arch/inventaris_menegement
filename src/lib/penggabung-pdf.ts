// Menggabungkan beberapa berkas PDF menjadi satu.
//
// Dipakai supaya peminjam tetap melihat SATU dokumen meski di belakang layar
// pengajuannya dipecah per unit: peminjam menandatangani satu pengajuan, jadi
// dokumennya pun satu. Yang dipecah hanya kewenangan menyetujuinya.
//
// Sengaja memakai pdf-lib yang sudah terpasang (dipakai generator dokumen),
// bukan menambah pustaka baru.
import { PDFDocument } from "pdf-lib";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { uploadPathFromUrl } from "@/lib/upload-dir";

/**
 * Gabungkan PDF dari daftar URL unggahan (urut sesuai daftar).
 * Berkas yang tak ada di disk dilewati — dokumen gabungan tetap terbentuk dari
 * bagian yang tersedia, bukan gagal total karena satu bagian hilang.
 */
export async function gabungPdfDariUrl(urls: (string | null | undefined)[]): Promise<Buffer | null> {
  const berkas: Buffer[] = [];

  for (const url of urls) {
    if (!url || url === "deleted") continue;
    try {
      const path = uploadPathFromUrl(url);
      if (!existsSync(path)) continue;
      berkas.push(await readFile(path));
    } catch (e) {
      console.error("Gabung PDF — gagal baca", url, e);
    }
  }

  if (berkas.length === 0) return null;
  if (berkas.length === 1) return berkas[0];

  const hasil = await PDFDocument.create();
  for (const buf of berkas) {
    try {
      const sumber = await PDFDocument.load(buf, { ignoreEncryption: true });
      const halaman = await hasil.copyPages(sumber, sumber.getPageIndices());
      for (const h of halaman) hasil.addPage(h);
    } catch (e) {
      console.error("Gabung PDF — berkas dilewati (rusak?)", e);
    }
  }

  const bytes = await hasil.save();
  return Buffer.from(bytes);
}
