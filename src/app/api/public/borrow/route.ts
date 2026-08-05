import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, items } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { itemId, name, department, email, phone, quantity, returnDate, notes } = body;

    if (!itemId || !name || !department || !quantity || !returnDate || !phone) {
      return NextResponse.json(
        { error: "Data peminjaman tidak lengkap" },
        { status: 400 }
      );
    }

    // 1. Check if item exists and has enough quantity
    const [item] = await db.select().from(items).where(eq(items.id, itemId));
    
    if (!item) {
      return NextResponse.json({ error: "Barang tidak ditemukan" }, { status: 404 });
    }

    if (item.availableQuantity < quantity) {
      return NextResponse.json(
        { error: `Stok tidak mencukupi. Tersedia: ${item.availableQuantity}` },
        { status: 400 }
      );
    }

    // 2. Create transaction
    const [transaction] = await db
      .insert(transactions)
      .values({
        itemId,
        borrowerName: name,
        borrowerDepartment: department,
        borrowerEmail: email || null,
        borrowerPhone: phone,
        quantity,
        expectedReturnDate: new Date(returnDate),
        notes: notes || null,
        status: "active",
      })
      .$returningId();

    // 4. Update item availability
    const newAvailable = item.availableQuantity - quantity;
    const newStatus = newAvailable === 0 ? "borrowed" : "available";

    await db
      .update(items)
      .set({
        availableQuantity: newAvailable,
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(items.id, itemId));

    return NextResponse.json({ success: true, transaction }, { status: 201 });
  } catch (error) {
    console.error("POST /api/public/borrow error:", error);
    return NextResponse.json(
      { error: "Gagal memproses peminjaman" },
      { status: 500 }
    );
  }
}
