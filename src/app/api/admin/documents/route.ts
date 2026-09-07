import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { readdir, stat } from "fs/promises";
import path from "path";
import { db } from "@/db";
import { handovers, transactions } from "@/db/schema";
import { ne } from "drizzle-orm";

export interface DocumentFile {
  name: string;
  folder: "signed_forms" | "handovers";
  url: string;
  size: number;
  createdAt: number;
  uploaderName: string; // diekstrak dari nama file: NamaPeminjam_DDMMYYYY.pdf
}

/**
 * Ekstrak nama dari format: NamaPeminjam_DDMMYYYY.ext
 * Contoh: Sabil_Hudek_14082026.pdf → "Sabil Hudek"
 * File lama (signed_16_1234567.pdf) → "Tidak diketahui"
 */
function extractNameFromFilename(filename: string): string {
  const noExt = filename.replace(/\.[^.]+$/, ""); // hapus ekstensi
  // Format lama: signed_16_1234567 atau handover_16_1234567
  if (/^(signed|handover)_\d+_\d+$/.test(noExt)) return "Tidak diketahui";
  // Format baru: Nama_Lengkap_DDMMYYYY — hapus bagian tanggal di akhir (8 digit angka)
  const withoutDate = noExt.replace(/_\d{8}$/, "");
  // Ganti underscore dengan spasi
  return withoutDate.replace(/_/g, " ").trim() || "Tidak diketahui";
}

async function getFilesFromFolder(
  folderName: "signed_forms" | "handovers"
): Promise<DocumentFile[]> {
  const folderPath = path.join(
    process.cwd(),
    "public",
    "uploads",
    folderName
  );

  try {
    const files = await readdir(folderPath);
    const result: DocumentFile[] = [];

    for (const file of files) {
      if (file.startsWith(".")) continue; // skip hidden files
      const filePath = path.join(folderPath, file);
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) continue;

      result.push({
        name: file,
        folder: folderName,
        url: `/uploads/${folderName}/${file}`,
        size: fileStat.size,
        createdAt: fileStat.birthtimeMs || fileStat.ctimeMs,
        uploaderName: extractNameFromFilename(file),
      });
    }

    return result.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return []; // folder tidak ada atau kosong
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user || role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [signedForms, handoverFiles, validHvUrls, validTxUrls] = await Promise.all([
      getFilesFromFolder("signed_forms"),
      getFilesFromFolder("handovers"),
      // URL dokumen milik handover yang TIDAK rejected (ditolak → dokumen tak sah,
      // tak boleh tampil di tab dokumen walau file fisiknya ada)
      db
        .select({ url: handovers.signedDocumentUrl })
        .from(handovers)
        .where(ne(handovers.status, "rejected")),
      // Sama utk transaksi peminjaman
      db
        .select({ url: transactions.signedDocumentUrl })
        .from(transactions)
        .where(ne(transactions.status, "rejected")),
    ]);

    const validHvSet = new Set(validHvUrls.map((r) => r.url).filter((u): u is string => !!u));
    const validTxSet = new Set(validTxUrls.map((r) => r.url).filter((u): u is string => !!u));
    const handoverFilesFiltered = handoverFiles.filter((f) => validHvSet.has(f.url));
    const signedFormsFiltered = signedForms.filter((f) => validTxSet.has(f.url));

    const allFiles = [...signedFormsFiltered, ...handoverFilesFiltered];
    const totalSize = allFiles.reduce((sum, f) => sum + f.size, 0);

    return NextResponse.json({
      signedForms: signedFormsFiltered,
      handovers: handoverFilesFiltered,
      totalFiles: allFiles.length,
      totalSize,
    });
  } catch (error) {
    console.error("GET /api/admin/documents error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan" }, { status: 500 });
  }
}
