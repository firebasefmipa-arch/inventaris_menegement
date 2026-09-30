import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { handovers, handoverItems, items } from "@/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { jsonBody } from "@/lib/json-body";
import { periksaAksesUnit } from "@/lib/akses-unit";
import { kembalikanKeStok } from "@/lib/pengembalian";
import { copyFile, mkdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { deleteUploadByUrl, deleteUploadIfDifferent } from "@/lib/delete-upload";
import { uploadPath, uploadPathFromUrl } from "@/lib/upload-dir";
import { buatDokumenSerahTerima } from "@/lib/dokumen-persetujuan";
import { tentukanPenyetuju, type Penyetuju } from "@/lib/penyetuju";
import { kodeBaru } from "@/lib/dokumen-verifikasi";

// PUT /api/admin/handovers/[id] — approve atau reject
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user || (role !== "admin" && role !== "super_admin"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const hvId = parseInt(id, 10);
    if (isNaN(hvId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const body = await jsonBody(req);
    if (!body) return NextResponse.json({ error: "Body permintaan tidak valid" }, { status: 400 });
    const { action, rejectionReason } = body;

    if (!action || !["approve", "reject"].includes(action))
      return NextResponse.json({ error: "Action harus approve atau reject" }, { status: 400 });

    const [hv] = await db.select().from(handovers).where(eq(handovers.id, hvId)).limit(1);
    if (!hv) return NextResponse.json({ error: "Serah terima tidak ditemukan" }, { status: 404 });
    if (hv.status !== "pending_approval")
      return NextResponse.json({ error: "Hanya bisa approve/reject serah terima dengan status menunggu persetujuan" }, { status: 400 });

    // ── Batas unit ──
    // Sejak serah terima dipecah per unit, tiap pecahan punya adminnya sendiri.
    // Diperiksa di server; superadmin lolos. Lihat src/lib/akses-unit.ts.
    const tolak = await periksaAksesUnit(session, hv.unit);
    if (tolak) return NextResponse.json({ error: tolak.pesan }, { status: tolak.status });

    // ── Siapa yang menyetujui? ──
    // Diperiksa SEBELUM status dikunci: admin yang belum mengunggah tanda tangan
    // tidak boleh menyetujui. Superadmin dikecualikan, namanya tak dicetak.
    let penyetuju: Penyetuju = null;
    if (action === "approve") {
      const hasil = await tentukanPenyetuju(String(session.user.id), role);
      if ("tolak" in hasil) return NextResponse.json({ error: hasil.tolak.pesan }, { status: hasil.tolak.status });
      penyetuju = hasil.penyetuju;
    }

    // ── Kunci status di WHERE ──
    // Dulu di sini `WHERE id` saja, jadi tiga klik bersamaan sama-sama lolos:
    // untuk penolakan berarti stok dikembalikan tiga kali (stok jadi melebihi
    // fisik barang); untuk persetujuan berarti stok fisik terpotong tiga kali.
    // Sekarang hanya sah kalau statusnya MASIH `pending_approval`.
    const kunci = await db
      .update(handovers)
      .set(
        action === "approve"
          ? {
              status: "completed",
              approvedBy: penyetuju?.nama ?? null,
              approvedAt: new Date(),
              approvedSignatureUrl: penyetuju?.tandaTangan ?? null,
              verificationCode: kodeBaru(),
            }
          : { status: "rejected" }
      )
      .where(and(eq(handovers.id, hvId), eq(handovers.status, "pending_approval")));

    const baris = (Array.isArray(kunci) ? kunci[0] : kunci) as unknown as { affectedRows?: number };
    if (Number(baris?.affectedRows ?? 0) === 0) {
      return NextResponse.json(
        { error: "Serah terima ini sudah diproses oleh permintaan lain. Muat ulang halamannya." },
        { status: 409 }
      );
    }

    if (action === "approve") {
      // Catatan urutan: dokumen dicetak ulang NANTI, setelah stok dipastikan
      // cukup — supaya dokumen bersetujuan tidak terbentuk untuk serah terima
      // yang ternyata gagal karena stok.

      // Kurangi stok permanen — ATOMIK. Syarat "stok cukup" ada di WHERE
      // supaya stok tak bisa jadi minus.
      const hvItems = await db.select().from(handoverItems).where(eq(handoverItems.handoverId, hvId));
      let stokGagal = false;
      for (const hvItem of hvItems) {
        const hasilStok = await db
          .update(items)
          .set({
            quantity: sql`${items.quantity} - ${hvItem.quantity}`,
            status: sql`CASE WHEN ${items.availableQuantity} <= 0 THEN 'borrowed' ELSE 'available' END`,
            updatedAt: new Date(),
          })
          .where(and(eq(items.id, hvItem.itemId), gte(items.quantity, hvItem.quantity)));

        const r = (Array.isArray(hasilStok) ? hasilStok[0] : hasilStok) as unknown as { affectedRows?: number };
        if (Number(r?.affectedRows ?? 0) === 0) stokGagal = true;
      }

      // Stok tak cukup → JANGAN biarkan status terkunci "selesai": barang akan
      // tercatat sudah diserahkan padahal jumlahnya masih penuh. Kembalikan ke
      // menunggu supaya bisa diperiksa admin.
      if (stokGagal) {
        await db
          .update(handovers)
          .set({
            status: "pending_approval",
            // Catatan penyetuju IKUT dibersihkan: statusnya kembali "menunggu",
            // jadi tidak boleh ada sisa tanda tangan/nama admin di baris ini —
            // kalau tertinggal, dokumen yang dicetak ulang nanti akan mengaku
            // sudah disetujui padahal belum.
            approvedBy: null,
            approvedAt: null,
            approvedSignatureUrl: null,
            verificationCode: null,
          })
          .where(eq(handovers.id, hvId));
        return NextResponse.json(
          { error: "Stok salah satu barang tidak mencukupi. Periksa jumlah barang lalu setujui ulang." },
          { status: 409 }
        );
      }

      // Dokumen dicetak ulang lengkap dengan tanda tangan & nama admin.
      // Dulu berkasnya hanya dipindahkan antar folder, sehingga kolom
      // "Yang menyerahkan" selamanya kosong.
      try {
        const urlBaru = await buatDokumenSerahTerima(hvId, penyetuju);
        await deleteUploadIfDifferent(urlBaru, hv.signedDocumentUrl);
        await db.update(handovers).set({ signedDocumentUrl: urlBaru }).where(eq(handovers.id, hvId));
      } catch (e) {
        console.error("Cetak dokumen persetujuan error:", e);
        // Cadangan: pindahkan saja berkas lamanya supaya dokumen tidak hilang.
        let finalPdfUrl = hv.signedDocumentUrl;
        if (hv.signedDocumentUrl?.startsWith("/uploads/pending/")) {
          try {
            const filename = path.basename(hv.signedDocumentUrl);
            const srcPath  = uploadPathFromUrl(hv.signedDocumentUrl);
            const destDir  = uploadPath("handovers");
            const destPath = path.join(destDir, filename);
            await mkdir(destDir, { recursive: true });
            if (existsSync(srcPath)) {
              await copyFile(srcPath, destPath);
              await unlink(srcPath).catch(() => {});
            }
            finalPdfUrl = `/uploads/handovers/${filename}`;
          } catch (e2) {
            console.error("Pindah PDF handover error:", e2);
          }
        }
        if (finalPdfUrl !== hv.signedDocumentUrl) {
          await db.update(handovers).set({ signedDocumentUrl: finalPdfUrl }).where(eq(handovers.id, hvId));
        }
      }

      return NextResponse.json({ success: true, message: "Serah terima berhasil disetujui" });

    } else {
      if (!rejectionReason?.trim())
        return NextResponse.json({ error: "Alasan penolakan wajib diisi" }, { status: 400 });

      // Hapus PDF di folder mana pun (pending/handovers) — dokumen pengajuan
      // ditolak tidak disimpan; riwayat tetap ada dengan status rejected.
      await deleteUploadByUrl(hv.signedDocumentUrl);

      await db.update(handovers).set({
        rejectionReason: rejectionReason.trim(),
        signedDocumentUrl: null,
      }).where(eq(handovers.id, hvId));

      // Kembalikan stok — atomik, lihat src/lib/pengembalian.ts.
      const hvItems = await db.select().from(handoverItems).where(eq(handoverItems.handoverId, hvId));
      await kembalikanKeStok(hvItems.map((i) => ({ itemId: i.itemId, quantity: i.quantity })));

      return NextResponse.json({ success: true, message: "Serah terima berhasil ditolak" });
    }
  } catch (error) {
    console.error("PUT /api/admin/handovers/[id] error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan" }, { status: 500 });
  }
}
