import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { handovers, handoverItems, items } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";

// PUT /api/admin/handovers/[id] — approve atau reject
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user || (role !== "admin" && role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const hvId = parseInt(id, 10);
    if (isNaN(hvId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const body = await req.json();
    const { action, rejectionReason } = body;

    if (!action || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "Action harus approve atau reject" }, { status: 400 });
    }

    const [hv] = await db.select().from(handovers).where(eq(handovers.id, hvId)).limit(1);
    if (!hv) return NextResponse.json({ error: "Serah terima tidak ditemukan" }, { status: 404 });

    if (hv.status !== "pending_approval") {
      return NextResponse.json(
        { error: "Hanya bisa approve/reject serah terima dengan status menunggu persetujuan" },
        { status: 400 }
      );
    }

    if (action === "approve") {
      // Kurangi stok permanen (qty & availableQuantity)
      const hvItems = await db.select().from(handoverItems).where(eq(handoverItems.handoverId, hvId));

      for (const hvItem of hvItems) {
        const [item] = await db.select().from(items).where(eq(items.id, hvItem.itemId)).limit(1);
        if (item) {
          // Saat pending, stok sudah dikurangi sementara (availableQuantity).
          // Saat approved, kurangi quantity (total stok) secara permanen.
          const newQty = Math.max(0, item.quantity - hvItem.quantity);
          await db.update(items).set({
            quantity: newQty,
            status: item.availableQuantity === 0 ? "borrowed" : "available",
            updatedAt: new Date(),
          }).where(eq(items.id, item.id));
        }
      }

      await db.update(handovers).set({ status: "completed" }).where(eq(handovers.id, hvId));

      return NextResponse.json({ success: true, message: "Serah terima berhasil disetujui" });

    } else {
      // Reject — kembalikan stok availableQuantity
      if (!rejectionReason?.trim()) {
        return NextResponse.json({ error: "Alasan penolakan wajib diisi" }, { status: 400 });
      }

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

      await db.update(handovers).set({
        status: "rejected",
        rejectionReason: rejectionReason.trim(),
      }).where(eq(handovers.id, hvId));

      return NextResponse.json({ success: true, message: "Serah terima berhasil ditolak" });
    }
  } catch (error) {
    console.error("PUT /api/admin/handovers/[id] error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan" }, { status: 500 });
  }
}
