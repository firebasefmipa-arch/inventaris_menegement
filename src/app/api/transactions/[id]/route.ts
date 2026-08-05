import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, transactionItems, items } from "@/db/schema";
import { eq, and, count } from "drizzle-orm";
import { auth } from "@/auth";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth guard — hanya admin/super_admin
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user || (role !== "admin" && role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const txId = parseInt(id);
    if (isNaN(txId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const body = await request.json();
    const { status, notes } = body;

    const [transaction] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, txId));

    if (!transaction) {
      return NextResponse.json(
        { error: "Transaksi tidak ditemukan" },
        { status: 404 }
      );
    }

    if (status === "returned" && transaction.status !== "returned") {
      // Kembalikan stok dari transaction_items (multi-item)
      const txItems = await db
        .select()
        .from(transactionItems)
        .where(eq(transactionItems.transactionId, txId));

      if (txItems.length > 0) {
        for (const txItem of txItems) {
          const [item] = await db
            .select()
            .from(items)
            .where(eq(items.id, txItem.itemId))
            .limit(1);

          if (item) {
            const newAvailable = item.availableQuantity + txItem.quantity;
            // Cek apakah masih ada transaksi aktif lain untuk item ini
            const [{ activeCount }] = await db
              .select({ activeCount: count() })
              .from(transactionItems)
              .where(
                and(
                  eq(transactionItems.itemId, item.id),
                )
              );
            await db
              .update(items)
              .set({
                availableQuantity: newAvailable,
                status: newAvailable >= item.quantity ? "available" : "available",
                updatedAt: new Date(),
              })
              .where(eq(items.id, item.id));
          }
        }
      } else if (transaction.itemId) {
        // Legacy single-item fallback
        const [item] = await db
          .select()
          .from(items)
          .where(eq(items.id, transaction.itemId))
          .limit(1);

        if (item) {
          const newAvailable = item.availableQuantity + transaction.quantity;
          await db
            .update(items)
            .set({
              availableQuantity: newAvailable,
              status: "available" as const,
              updatedAt: new Date(),
            })
            .where(eq(items.id, item.id));
        }
      }

      await db
        .update(transactions)
        .set({
          status: "returned" as const,
          actualReturnDate: new Date(),
          ...(notes !== undefined && { notes }),
        })
        .where(eq(transactions.id, txId));
    } else if (status !== undefined || notes !== undefined) {
      // Hanya update kalau ada yang berubah — hindari empty set
      await db
        .update(transactions)
        .set({
          ...(status !== undefined && { status }),
          ...(notes !== undefined && { notes }),
        })
        .where(eq(transactions.id, txId));
    }

    const [updated] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, txId));

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/transactions/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update transaction" },
      { status: 500 }
    );
  }
}
