import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, transactionItems, items } from "@/db/schema";
import { inArray, eq } from "drizzle-orm";
import { auth } from "@/auth";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user || (role !== "admin" && role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "Invalid or empty IDs array" },
        { status: 400 }
      );
    }

    // Ambil semua transaksi yang akan dihapus
    const txsToDelete = await db
      .select()
      .from(transactions)
      .where(inArray(transactions.id, ids));

    if (txsToDelete.length === 0) {
      return NextResponse.json({ message: "No transactions found" });
    }

    // Ambil semua transaction_items sekaligus (satu query, bukan N+1)
    const allTxItems = await db
      .select()
      .from(transactionItems)
      .where(inArray(transactionItems.transactionId, ids));

    // Hitung delta stok per item dari transaksi yang perlu dikembalikan
    // (active dan pending_approval sudah mengurangi stok)
    const stockDeltaMap = new Map<number, number>();

    for (const tx of txsToDelete) {
      if (tx.status === "active" || tx.status === "pending_approval" || tx.status === "pending_signature") {
        // Dari transaction_items
        const txItems = allTxItems.filter((ti) => ti.transactionId === tx.id);
        for (const ti of txItems) {
          stockDeltaMap.set(ti.itemId, (stockDeltaMap.get(ti.itemId) ?? 0) + ti.quantity);
        }

        // Legacy fallback jika tidak ada transaction_items
        if (txItems.length === 0 && tx.itemId !== null) {
          stockDeltaMap.set(tx.itemId, (stockDeltaMap.get(tx.itemId) ?? 0) + tx.quantity);
        }
      }
    }

    // Update stok semua item yang terdampak — batch, bukan N+1
    if (stockDeltaMap.size > 0) {
      const affectedItemIds = Array.from(stockDeltaMap.keys());
      const affectedItems = await db
        .select()
        .from(items)
        .where(inArray(items.id, affectedItemIds));

      for (const item of affectedItems) {
        const delta = stockDeltaMap.get(item.id) ?? 0;
        if (delta === 0) continue;
        const newAvailable = Math.min(item.availableQuantity + delta, item.quantity);
        await db
          .update(items)
          .set({
            availableQuantity: newAvailable,
            status: newAvailable > 0 ? ("available" as const) : ("borrowed" as const),
            updatedAt: new Date(),
          })
          .where(eq(items.id, item.id));
      }
    }

    // Hapus semua transaksi (cascade ke transaction_items)
    await db.delete(transactions).where(inArray(transactions.id, ids));

    return NextResponse.json({ message: `${txsToDelete.length} transaksi berhasil dihapus` });
  } catch (error) {
    console.error("POST /api/transactions/bulk-delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete transactions" },
      { status: 500 }
    );
  }
}
