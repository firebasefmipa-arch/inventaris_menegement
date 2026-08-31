import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, transactionItems, items } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || (role !== "admin" && role !== "super_admin"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const txId = parseInt(id, 10);
  if (isNaN(txId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const [tx] = await db.select().from(transactions).where(eq(transactions.id, txId)).limit(1);
  if (!tx) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await db
    .select({
      itemId: transactionItems.itemId,
      quantity: transactionItems.quantity,
      notes: transactionItems.notes,
      itemName: items.name,
      availableQuantity: items.availableQuantity,
      inventoryNumber: items.inventoryNumber,
    })
    .from(transactionItems)
    .leftJoin(items, eq(transactionItems.itemId, items.id))
    .where(eq(transactionItems.transactionId, txId));

  return NextResponse.json({ items: rows });
}
