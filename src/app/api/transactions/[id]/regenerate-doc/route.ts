import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { existsSync } from "fs";
import { uploadPathFromUrl } from "@/lib/upload-dir";
import { periksaAksesUnit } from "@/lib/akses-unit";
import { buatDokumenPinjam } from "@/lib/dokumen-persetujuan";
import { penyetujuDari } from "@/lib/penyetuju";
import { kodeBaru } from "@/lib/dokumen-verifikasi";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const txId = parseInt(id, 10);
    if (isNaN(txId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const [tx] = await db.select().from(transactions).where(eq(transactions.id, txId)).limit(1);
    if (!tx) return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });

    const role = (session.user as any)?.role;
    // User hanya bisa regenerate miliknya, admin bisa semua
    const pemilik = tx.userId === session.user.id;
    if (!pemilik && role !== "admin" && role !== "super_admin") {
      return NextResponse.json({ error: "Tidak memiliki akses" }, { status: 403 });
    }
    // Admin yang bukan pemilik hanya boleh menyentuh pecahan unitnya sendiri.
    if (!pemilik) {
      const tolak = await periksaAksesUnit(session, tx.unit);
      if (tolak) return NextResponse.json({ error: tolak.pesan }, { status: tolak.status });
    }

    // Hanya bisa regenerate jika status 'deleted' ATAU file fisik tidak ada (rusak/hilang)
    const fileMissing =
      tx.signedDocumentUrl &&
      tx.signedDocumentUrl !== "deleted" &&
      tx.signedDocumentUrl.startsWith("/uploads/") &&
      !existsSync(uploadPathFromUrl(tx.signedDocumentUrl));
    if (tx.signedDocumentUrl !== "deleted" && !fileMissing) {
      return NextResponse.json({ error: "Dokumen belum dihapus atau sudah ada" }, { status: 400 });
    }

    // Dokumen dicetak ulang memakai data penyetuju TERSIMPAN di baris pengajuan.
    // Untuk pengajuan lama (sebelum fitur persetujuan) kolomnya kosong, jadi
    // dokumen tetap tercetak tanpa nama — persis seperti aslinya dulu.
    // Lihat src/lib/dokumen-persetujuan.ts.
    //
    // Pengajuan lama yang SUDAH disetujui belum punya kode pemeriksaan (kolomnya
    // baru ada belakangan). Karena dokumennya toh sedang dicetak ulang, sekalian
    // diberi kode — supaya ikut bisa diperiksa lewat kotak QR.
    if (tx.approvedAt && !tx.verificationCode) {
      await db.update(transactions).set({ verificationCode: kodeBaru() }).where(eq(transactions.id, txId));
    }
    const newUrl = await buatDokumenPinjam(txId, penyetujuDari(tx));

    // Update DB — set URL baru saja, status tidak berubah
    await db.update(transactions).set({
      signedDocumentUrl: newUrl,
    }).where(eq(transactions.id, txId));

    return NextResponse.json({ success: true, url: newUrl, message: "Dokumen berhasil digenerate ulang" });
  } catch (error) {
    console.error("Regenerate doc error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan" }, { status: 500 });
  }
}
