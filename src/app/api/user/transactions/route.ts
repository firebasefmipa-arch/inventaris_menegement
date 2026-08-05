import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { transactions, transactionItems, items } from "@/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const conditions = [eq(transactions.userId, userId)];
    if (status) {
      conditions.push(
        eq(transactions.status, status as any)
      );
    }

    // Ambil semua transaksi user
    const txList = await db
      .select({
        id: transactions.id,
        quantity: transactions.quantity,
        status: transactions.status,
        signedDocumentUrl: transactions.signedDocumentUrl,
        borrowDate: transactions.borrowDate,
        expectedReturnDate: transactions.expectedReturnDate,
        actualReturnDate: transactions.actualReturnDate,
        notes: transactions.notes,
        rejectionReason: transactions.rejectionReason,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .where(and(...conditions))
      .orderBy(desc(transactions.createdAt));

    if (txList.length === 0) return NextResponse.json([]);

    const txIds = txList.map((t) => t.id);

    // Ambil semua transaction_items beserta item detail
    const txItemRows = await db
      .select({
        transactionId: transactionItems.transactionId,
        itemId: transactionItems.itemId,
        quantity: transactionItems.quantity,
        notes: transactionItems.notes,
        itemName: items.name,
        itemCategory: items.category,
        itemLocation: items.location,
        itemInventoryNumber: items.inventoryNumber,
      })
      .from(transactionItems)
      .leftJoin(items, eq(transactionItems.itemId, items.id))
      .where(inArray(transactionItems.transactionId, txIds));

    // Group transaction_items per transaction id
    const itemsByTx = new Map<number, typeof txItemRows>();
    for (const row of txItemRows) {
      const existing = itemsByTx.get(row.transactionId) ?? [];
      existing.push(row);
      itemsByTx.set(row.transactionId, existing);
    }

    // Gabungkan transaksi dengan item-itemnya
    const result = txList.map((tx) => {
      const txItems = itemsByTx.get(tx.id) ?? [];
      return {
        ...tx,
        // Nama barang pertama untuk tampilan ringkas
        itemName: txItems[0]?.itemName ?? null,
        itemCategory: txItems[0]?.itemCategory ?? null,
        itemLocation: txItems[0]?.itemLocation ?? null,
        // Semua barang dalam transaksi ini
        items: txItems.map((i) => ({
          itemId: i.itemId,
          itemName: i.itemName,
          itemCategory: i.itemCategory,
          itemLocation: i.itemLocation,
          itemInventoryNumber: i.itemInventoryNumber,
          quantity: i.quantity,
          notes: i.notes,
        })),
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/user/transactions error:", error);
    return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 });
  }
}
