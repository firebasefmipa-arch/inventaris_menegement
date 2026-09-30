import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { handovers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { existsSync } from "fs";
import { uploadPathFromUrl } from "@/lib/upload-dir";
import { periksaAksesUnit } from "@/lib/akses-unit";
import { buatDokumenSerahTerima } from "@/lib/dokumen-persetujuan";
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
    const hvId = parseInt(id, 10);
    if (isNaN(hvId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const [hv] = await db.select().from(handovers).where(eq(handovers.id, hvId)).limit(1);
    if (!hv) return NextResponse.json({ error: "Serah terima tidak ditemukan" }, { status: 404 });

    const role = (session.user as any)?.role;
    const pemilik = hv.userId === session.user.id;
    if (!pemilik && role !== "admin" && role !== "super_admin") {
      return NextResponse.json({ error: "Tidak memiliki akses" }, { status: 403 });
    }
    // Admin yang bukan pemilik hanya boleh menyentuh pecahan unitnya sendiri.
    if (!pemilik) {
      const tolak = await periksaAksesUnit(session, hv.unit);
      if (tolak) return NextResponse.json({ error: tolak.pesan }, { status: tolak.status });
    }

    // Hanya bisa regenerate jika status 'deleted' ATAU file fisik tidak ada (rusak/hilang)
    const fileMissing =
      hv.signedDocumentUrl &&
      hv.signedDocumentUrl !== "deleted" &&
      hv.signedDocumentUrl.startsWith("/uploads/") &&
      !existsSync(uploadPathFromUrl(hv.signedDocumentUrl));
    if (hv.signedDocumentUrl !== "deleted" && !fileMissing) {
      return NextResponse.json({ error: "Dokumen belum dihapus atau sudah ada" }, { status: 400 });
    }

    // Memakai data penyetuju TERSIMPAN — pengajuan lama tetap tanpa nama.
    // Lihat src/lib/dokumen-persetujuan.ts.
    //
    // Dokumen lama yang sudah disetujui belum punya kode pemeriksaan; karena
    // sedang dicetak ulang, sekalian diberi kode supaya ikut bisa diperiksa.
    if (hv.approvedAt && !hv.verificationCode) {
      await db.update(handovers).set({ verificationCode: kodeBaru() }).where(eq(handovers.id, hvId));
    }
    const newUrl = await buatDokumenSerahTerima(hvId, penyetujuDari(hv));

    // Update DB — set URL baru saja, status tidak berubah
    await db.update(handovers).set({
      signedDocumentUrl: newUrl,
    }).where(eq(handovers.id, hvId));

    return NextResponse.json({ success: true, url: newUrl, message: "Dokumen berhasil digenerate ulang" });
  } catch (error) {
    console.error("Regenerate handover doc error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan" }, { status: 500 });
  }
}
