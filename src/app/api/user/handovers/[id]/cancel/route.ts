import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { handovers, handoverItems, items } from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { deleteUploadByUrl } from "@/lib/delete-upload";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const hvId = parseInt(id, 10);
    if (isNaN(hvId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const [hv] = await db.select().from(handovers).where(eq(handovers.id, hvId)).limit(1);
    if (!hv) return NextResponse.json({ error: "Serah terima tidak ditemukan" }, { status: 404 });

    if (hv.userId !== session.user.id) {
      return NextResponse.json({ error: "Tidak memiliki akses" }, { status: 403 });
    }

    // ── Satu kelompok = satu pengajuan dari sisi user ──
    // Serah terima juga dipecah per unit; membatalkan berarti membatalkan
    // seluruh pecahannya, bukan satu potong saja.
    const pecahan = hv.grupId
      ? await db
          .select()
          .from(handovers)
          .where(and(eq(handovers.grupId, hv.grupId), eq(handovers.userId, session.user.id)))
      : [hv];

    const semuaId = pecahan.map((p) => p.id);

    const belumProses = pecahan.filter(
      (p) => p.status === "pending_signature" || p.status === "pending_approval"
    );
    if (belumProses.length !== pecahan.length) {
      return NextResponse.json(
        { error: "Pengajuan ini sudah diproses sebagian, jadi tidak bisa dibatalkan lagi." },
        { status: 400 }
      );
    }

    // ── Kunci status DULU, baru sentuh stok ──
    // Dulu stok dikembalikan lebih dulu; dua pembatalan bersamaan sama-sama
    // menambah stok. Sekarang hanya satu yang boleh lanjut; yang kalah 409.
    const kunci = await db
      .update(handovers)
      .set({ status: "rejected", rejectionReason: "Dibatalkan oleh pemohon" })
      .where(
        and(
          inArray(handovers.id, semuaId),
          inArray(handovers.status, ["pending_signature", "pending_approval"])
        )
      );
    const terkunci = (Array.isArray(kunci) ? kunci[0] : kunci) as unknown as { affectedRows?: number };
    if (Number(terkunci?.affectedRows ?? 0) !== semuaId.length) {
      return NextResponse.json(
        { error: "Pengajuan ini sudah dibatalkan/diproses oleh permintaan lain." },
        { status: 409 }
      );
    }

    // Kembalikan stok — ATOMIK: penambahan dihitung database.
    const baris = await db
      .select()
      .from(handoverItems)
      .where(inArray(handoverItems.handoverId, semuaId));

    for (const b of baris) {
      await db.update(items).set({
        availableQuantity: sql`${items.availableQuantity} + ${b.quantity}`,
        status: sql`CASE WHEN ${items.availableQuantity} + ${b.quantity} > 0 THEN 'available' ELSE 'borrowed' END`,
        updatedAt: new Date(),
      }).where(eq(items.id, b.itemId));
    }

    // Belum upload dokumen → hapus total
    const belumAdaDokumen = pecahan.every(
      (p) => p.status === "pending_signature" && !p.signedDocumentUrl
    );

    if (belumAdaDokumen) {
      await db.delete(handoverItems).where(inArray(handoverItems.handoverId, semuaId));
      await db.delete(handovers).where(inArray(handovers.id, semuaId));
      return NextResponse.json({ success: true, message: "Permintaan serah terima dibatalkan dan dihapus" });
    }

    // Sudah upload → status sudah "rejected" dari penguncian; di sini hanya
    // membuang berkasnya (dokumen batal tak disimpan).
    for (const p of pecahan) await deleteUploadByUrl(p.signedDocumentUrl);
    await db.update(handovers).set({
      signedDocumentUrl: null,
    }).where(inArray(handovers.id, semuaId));

    return NextResponse.json({ success: true, message: "Permintaan serah terima berhasil dibatalkan" });
  } catch (error) {
    console.error("Cancel handover error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan" }, { status: 500 });
  }
}
