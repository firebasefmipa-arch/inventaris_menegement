import { NextResponse } from "next/server";
import { db } from "@/db";
import { items, transactions } from "@/db/schema";
import { eq, sql, count } from "drizzle-orm";

export async function GET() {
  try {
    const [totalItems] = await db.select({ count: count() }).from(items);
    const [availableItems] = await db
      .select({ count: count() })
      .from(items)
      .where(eq(items.status, "available"));
    const [borrowedItems] = await db
      .select({ count: count() })
      .from(items)
      .where(eq(items.status, "borrowed"));

    // Count unique borrowers from transactions
    const [totalBorrowers] = await db
      .select({
        count: sql<number>`COUNT(DISTINCT ${transactions.borrowerName})`,
      })
      .from(transactions);

    const [activeTransactions] = await db
      .select({ count: count() })
      .from(transactions)
      .where(eq(transactions.status, "active"));
    const [overdueTransactions] = await db
      .select({ count: count() })
      .from(transactions)
      .where(
        sql`${transactions.status} = 'active' AND ${transactions.expectedReturnDate} < NOW()`
      );

    const categoriesResult = await db
      .select({
        category: items.category,
        count: count(),
      })
      .from(items)
      .groupBy(items.category);

    const recentTransactions = await db
      .select({
        id: transactions.id,
        itemId: transactions.itemId,
        status: transactions.status,
        borrowDate: transactions.borrowDate,
        expectedReturnDate: transactions.expectedReturnDate,
        itemName: items.name,
        borrowerName: transactions.borrowerName,
      })
      .from(transactions)
      .leftJoin(items, eq(transactions.itemId, items.id))
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
