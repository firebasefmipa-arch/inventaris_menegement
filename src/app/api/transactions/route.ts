import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, items } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "";

    const conditions = [];
    if (status) {
      conditions.push(
        eq(transactions.status, status as "active" | "returned" | "overdue")
      );
    }

    const data = await db
      .select({
        id: transactions.id,
        itemId: transactions.itemId,
        quantity: transactions.quantity,
        status: transactions.status,
        borrowDate: transactions.borrowDate,
        expectedReturnDate: transactions.expectedReturnDate,
        actualReturnDate: transactions.actualReturnDate,
        notes: transactions.notes,
        createdAt: transactions.createdAt,
        itemName: items.name,
        itemCategory: items.category,
        borrowerName: transactions.borrowerName,
        borrowerDepartment: transactions.borrowerDepartment,
        borrowerEmail: transactions.borrowerEmail,
        borrowerPhone: transactions.borrowerPhone,
      })
      .from(transactions)
      .leftJoin(items, eq(transactions.itemId, items.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(transactions.createdAt));

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/transactions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { itemId, borrowerName, borrowerDepartment, borrowerEmail, borrowerPhone, quantity, expectedReturnDate, notes } = body;

    if (!itemId || !borrowerName || !expectedReturnDate) {
      return NextResponse.json(
        { error: "Item, peminjam, dan tanggal kembali wajib diisi" },
        { status: 400 }
      );
    }

    // Check availability
    const [item] = await db.select().from(items).where(eq(items.id, itemId));
    if (!item) {
      return NextResponse.json(
        { error: "Item tidak ditemukan" },
        { status: 404 }
      );
    }

    const qty = quantity || 1;
    if (item.availableQuantity < qty) {
      return NextResponse.json(
        { error: `Stok tidak mencukupi. Tersedia: ${item.availableQuantity}` },
        { status: 400 }
      );
    }

    // Create transaction
    const [{ id }] = await db
      .insert(transactions)
      .values({
        itemId,
        borrowerName,
        borrowerDepartment: borrowerDepartment || null,
        borrowerEmail: borrowerEmail || null,
        borrowerPhone: borrowerPhone || null,
        quantity: qty,
        expectedReturnDate: new Date(expectedReturnDate),
        notes: notes || null,
      })
      .$returningId();

    // Update item availability
    const newAvailable = item.availableQuantity - qty;
    const newStatus = newAvailable === 0 ? "borrowed" : "available";

    await db
      .update(items)
      .set({
        availableQuantity: newAvailable,
        status: newStatus as "available" | "borrowed",
        updatedAt: new Date(),
      })
      .where(eq(items.id, itemId));

    const [transaction] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id));

    return NextResponse.json(transaction, { status: 201 });
  } catch (error) {
    console.error("POST /api/transactions error:", error);
    return NextResponse.json(
      { error: "Failed to create transaction" },
      { status: 500 }
    );
  }
}
