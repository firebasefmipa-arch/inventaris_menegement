import { NextResponse } from "next/server";
import { db } from "@/db";
import { items, transactions } from "@/db/schema";
import { eq, and, sql, count, gt, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { sqlTerlambat } from "@/lib/tanggal";
import { batasUnit } from "@/lib/akses-unit";

export async function GET() {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user || (role !== "admin" && role !== "super_admin"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ── Batas unit ──
    // Angka ringkasan admin hanya menghitung unit yang dikelolanya; kalau tidak,
    // dashboard-nya membocorkan jumlah barang unit lain.
    const batas = await batasUnit(session);
    const kosong = batas !== null && batas.length === 0;
    const saringBarang = () => {
      if (batas === null) return undefined;
      return kosong ? sql`1 = 0` : inArray(items.unit, batas);
    };
    const saringTx = () => {
      if (batas === null) return undefined;
      return kosong ? sql`1 = 0` : inArray(transactions.unit, batas);
    };

    const [totalItems] = await db
      .select({ count: count() })
      .from(items)
      .where(and(gt(items.quantity, 0), saringBarang()));
    const [availableItems] = await db
      .select({ count: count() })
      .from(items)
      .where(and(eq(items.status, "available"), gt(items.quantity, 0), saringBarang()));
    const [borrowedItems] = await db
      .select({ count: count() })
      .from(items)
      .where(and(eq(items.status, "borrowed"), gt(items.quantity, 0), saringBarang()));

    // Count unique borrowers from transactions
    const [totalBorrowers] = await db
      .select({
        count: sql<number>`COUNT(DISTINCT ${transactions.borrowerName})`,
      })
      .from(transactions)
      .where(saringTx());

    const [activeTransactions] = await db
      .select({ count: count() })
      .from(transactions)
      .where(and(eq(transactions.status, "active"), saringTx()));
    const [overdueTransactions] = await db
      .select({ count: count() })
      .from(transactions)
      .where(and(sqlTerlambat(), saringTx()));

    const categoriesResult = await db
      .select({
        category: items.category,
        count: count(),
      })
      .from(items)
      .where(and(gt(items.quantity, 0), saringBarang()))
      .groupBy(items.category);

    const recentTransactions = await db
      .select({
        id: transactions.id,
        itemId: transactions.itemId,
        status: transactions.status,
        borrowDate: transactions.borrowDate,
        expectedReturnDate: transactions.expectedReturnDate,
        // Snapshot ada di transaction_items (transactions tidak punya kolomnya).
        // Tautan barang ada di PIVOT, bukan di transactions.item_id (yang selalu
        // NULL) — jadi pasangkan lewat transaction_id, bukan item_id.
        itemName: sql<string>`COALESCE(${items.name}, (SELECT ti.item_name FROM transaction_items ti WHERE ti.transaction_id = ${transactions.id} LIMIT 1))`,
        borrowerName: transactions.borrowerName,
      })
      .from(transactions)
      .leftJoin(items, eq(transactions.itemId, items.id))
      .where(saringTx())
      .orderBy(sql`${transactions.createdAt} DESC`)
      .limit(5);

    return NextResponse.json({
      totalItems: totalItems?.count || 0,
      availableItems: availableItems?.count || 0,
      borrowedItems: borrowedItems?.count || 0,
      totalBorrowers: totalBorrowers?.count || 0,
      activeTransactions: activeTransactions?.count || 0,
      overdueTransactions: overdueTransactions?.count || 0,
      categories: categoriesResult,
      recentTransactions,
    });
  } catch (error) {
    console.error("GET /api/stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
