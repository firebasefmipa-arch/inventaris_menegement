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
import { deleteUploadByUrl } from "@/lib/delete-upload";
import { uploadPath, uploadPathFromUrl } from "@/lib/upload-dir";

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

    if (action === "approve") {
      // Pindahkan PDF dari pending/ ke handovers/
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
        } catch (e) {
          console.error("Pindah PDF handover error:", e);
        }
      }

      // Kurangi stok permanen — ATOMIK. Syarat "stok cukup" ada di WHERE
      // supaya dua persetujuan bersamaan tak bisa sama-sama lolos dan
      // menjadikan stok minus.
      const hvItems = await db.select().from(handoverItems).where(eq(handoverItems.handoverId, hvId));
      for (const hvItem of hvItems) {
        await db
          .update(items)
          .set({
            quantity: sql`${items.quantity} - ${hvItem.quantity}`,
            status: sql`CASE WHEN ${items.availableQuantity} <= 0 THEN 'borrowed' ELSE 'available' END`,
            updatedAt: new Date(),
          })
          .where(and(eq(items.id, hvItem.itemId), gte(items.quantity, hvItem.quantity)));
      }

      await db.update(handovers).set({
        status: "completed",
        signedDocumentUrl: finalPdfUrl,
      }).where(eq(handovers.id, hvId));

      return NextResponse.json({ success: true, message: "Serah terima berhasil disetujui" });

    } else {
      if (!rejectionReason?.trim())
        return NextResponse.json({ error: "Alasan penolakan wajib diisi" }, { status: 400 });

      // Hapus PDF di folder mana pun (pending/handovers) — dokumen pengajuan
      // ditolak tidak disimpan; riwayat tetap ada dengan status rejected.
      await deleteUploadByUrl(hv.signedDocumentUrl);

      // Kembalikan stok — atomik, lihat src/lib/pengembalian.ts. Dulu di sini
      // baca-lalu-tulis: dua penolakan bersamaan bisa saling menimpa.
      const hvItems = await db.select().from(handoverItems).where(eq(handoverItems.handoverId, hvId));
      await kembalikanKeStok(hvItems.map((i) => ({ itemId: i.itemId, quantity: i.quantity })));

      await db.update(handovers).set({
        status: "rejected",
        rejectionReason: rejectionReason.trim(),
        signedDocumentUrl: null,
      }).where(eq(handovers.id, hvId));

      return NextResponse.json({ success: true, message: "Serah terima berhasil ditolak" });
    }
  } catch (error) {
    console.error("PUT /api/admin/handovers/[id] error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan" }, { status: 500 });
  }
}
