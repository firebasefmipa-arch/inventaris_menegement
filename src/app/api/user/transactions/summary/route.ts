import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { transactions, transactionItems, items } from "@/db/schema";
import { eq, and, count, inArray, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const [{ total }] = await db
      .select({ total: count() })
      .from(transactions)
      .where(eq(transactions.userId, userId));

    const [{ active }] = await db
      .select({ active: count() })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.status, "active")));

    const [{ pendingSignature }] = await db
      .select({ pendingSignature: count() })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.status, "pending_signature")));

    const [{ pendingApproval }] = await db
      .select({ pendingApproval: count() })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.status, "pending_approval")));

    const pending = pendingSignature + pendingApproval;

    // ── Terlambat: dihitung dari TANGGAL, bukan kolom status. ──
    // Status "overdue" tidak pernah ditulis oleh kode mana pun, jadi
    // menghitungnya dari kolom status selalu menghasilkan 0.
    const [{ overdue }] = await db
      .select({ overdue: count() })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.status, "active"),
          sql`${transactions.expectedReturnDate} < NOW()`
        )
      );

    // ── Segera dikembalikan: aktif yang sudah lewat tenggat ATAU <= 24 jam. ──
    const dueSoonRaw = await db
      .select({
        id: transactions.id,
        expectedReturnDate: transactions.expectedReturnDate,
        quantity: transactions.quantity,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.status, "active"),
          sql`${transactions.expectedReturnDate} <= DATE_ADD(NOW(), INTERVAL 24 HOUR)`
        )
      )
      .orderBy(transactions.expectedReturnDate);

    // Nama barang lengkap dari pivot transaction_items
    let dueSoon: {
      id: number;
      itemNames: string[];
      quantity: number;
      expectedReturnDate: Date;
    }[] = [];

    if (dueSoonRaw.length > 0) {
      const rows = await db
        .select({
          transactionId: transactionItems.transactionId,
          itemName: items.name,
        })
        .from(transactionItems)
        .leftJoin(items, eq(transactionItems.itemId, items.id))
        .where(inArray(transactionItems.transactionId, dueSoonRaw.map((t) => t.id)));

      const namesByTx = new Map<number, string[]>();
      for (const r of rows) {
        const list = namesByTx.get(r.transactionId) ?? [];
        list.push(r.itemName ?? "Barang");
        namesByTx.set(r.transactionId, list);
      }

      dueSoon = dueSoonRaw.map((t) => ({
        id: t.id,
        itemNames: namesByTx.get(t.id) ?? [],
        quantity: t.quantity,
        expectedReturnDate: t.expectedReturnDate,
      }));
    }

    return NextResponse.json({
      total,
      active,
      pending,
      pendingSignature, // untuk badge sidebar
      pendingApproval,
      overdue,
      dueSoon,
    });
  } catch (error) {
    console.error("GET /api/user/transactions/summary error:", error);
    return NextResponse.json({ error: "Failed to fetch summary" }, { status: 500 });
  }
}
