import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, transactionItems, items } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;

    if (!session?.user || (role !== "admin" && role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const txId = parseInt(id, 10);
    if (isNaN(txId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const body = await request.json();
    const { action, rejectionReason } = body;

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // Alasan wajib diisi saat menolak
    if (action === "reject" && (!rejectionReason || !rejectionReason.trim())) {
      return NextResponse.json({ error: "Alasan penolakan wajib diisi" }, { status: 400 });
    }

    const [tx] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, txId));

    if (!tx) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    if (tx.status !== "pending_approval") {
      return NextResponse.json({ error: "Transaction is not pending approval" }, { status: 400 });
    }

    const newStatus = action === "approve" ? "active" : "rejected";

    await db
      .update(transactions)
      .set({
        status: newStatus,
        ...(action === "reject" && { rejectionReason: rejectionReason.trim() }),
      })
      .where(eq(transactions.id, txId));

    // Jika ditolak, kembalikan stok semua item
    if (action === "reject") {
      // Coba dari transaction_items dulu (multi-item)
      const txItems = await db
        .select()
        .from(transactionItems)
        .where(eq(transactionItems.transactionId, txId));

      if (txItems.length > 0) {
        for (const txItem of txItems) {
          const [item] = await db.select().from(items).where(eq(items.id, txItem.itemId)).limit(1);
          if (item) {
            const newAvailable = item.availableQuantity + txItem.quantity;
            await db.update(items).set({
              availableQuantity: newAvailable,
              status: newAvailable > 0 ? "available" : "borrowed",
              updatedAt: new Date(),
            }).where(eq(items.id, item.id));
          }
        }
      } else if (tx.itemId) {
        // Legacy single-item fallback
        const [item] = await db.select().from(items).where(eq(items.id, tx.itemId)).limit(1);
        if (item) {
          const newAvailable = item.availableQuantity + tx.quantity;
          await db.update(items).set({
            availableQuantity: newAvailable,
            status: newAvailable > 0 ? "available" : "borrowed",
            updatedAt: new Date(),
          }).where(eq(items.id, item.id));
        }
      }
    }

    return NextResponse.json({ success: true, status: newStatus });
  } catch (error) {
    console.error("Approve/Reject error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
