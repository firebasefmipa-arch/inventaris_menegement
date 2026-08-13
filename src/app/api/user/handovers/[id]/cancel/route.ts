import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { handovers, handoverItems, items } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";

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

    if (hv.status !== "pending_signature" && hv.status !== "pending_approval") {
      return NextResponse.json(
        { error: "Hanya bisa dibatalkan jika belum diproses" },
        { status: 400 }
      );
    }

    // Kembalikan stok availableQuantity
    const hvItems = await db.select().from(handoverItems).where(eq(handoverItems.handoverId, hvId));
    for (const hvItem of hvItems) {
      const [item] = await db.select().from(items).where(eq(items.id, hvItem.itemId)).limit(1);
      if (item) {
        const newAvailable = item.availableQuantity + hvItem.quantity;
        await db.update(items).set({
          availableQuantity: newAvailable,
          status: "available",
          updatedAt: new Date(),
        }).where(eq(items.id, item.id));
      }
    }

    // Belum upload dokumen → hapus total
    if (hv.status === "pending_signature" && !hv.signedDocumentUrl) {
      await db.delete(handoverItems).where(eq(handoverItems.handoverId, hvId));
      await db.delete(handovers).where(eq(handovers.id, hvId));
      return NextResponse.json({ success: true, message: "Permintaan serah terima dibatalkan dan dihapus" });
    }

    // Sudah upload → set rejected
    await db.update(handovers).set({
      status: "rejected",
      rejectionReason: "Dibatalkan oleh pemohon",
    }).where(eq(handovers.id, hvId));

    return NextResponse.json({ success: true, message: "Permintaan serah terima berhasil dibatalkan" });
  } catch (error) {
    console.error("Cancel handover error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan" }, { status: 500 });
  }
}
