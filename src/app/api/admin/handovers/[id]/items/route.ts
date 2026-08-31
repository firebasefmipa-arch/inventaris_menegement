import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { handovers, handoverItems, items } from "@/db/schema";
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
  const hvId = parseInt(id, 10);
  if (isNaN(hvId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const [hv] = await db.select().from(handovers).where(eq(handovers.id, hvId)).limit(1);
  if (!hv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await db
    .select({
      itemId: handoverItems.itemId,
      quantity: handoverItems.quantity,
      notes: handoverItems.notes,
      itemName: items.name,
      availableQuantity: items.availableQuantity,
      inventoryNumber: items.inventoryNumber,
      assetNumber: items.assetNumber,
    })
    .from(handoverItems)
    .leftJoin(items, eq(handoverItems.itemId, items.id))
    .where(eq(handoverItems.handoverId, hvId));

  return NextResponse.json({ items: rows });
}
