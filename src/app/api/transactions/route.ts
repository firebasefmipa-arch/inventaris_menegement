import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, transactionItems, items } from "@/db/schema";
import { eq, desc, and, inArray } from "drizzle-orm";
import { auth } from "@/auth";

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
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      cart,
      borrowerName,
      borrowerDepartment,
      borrowerEmail,
      borrowerPhone,
      borrowerNim,
      borrowerLocation,
      expectedReturnDate,
      purpose,
      notes,
    } = body;

    if (!borrowerName || !borrowerDepartment || !expectedReturnDate) {
      return NextResponse.json(
        { error: "Nama peminjam, divisi/prodi, dan tanggal kembali wajib diisi" },
        { status: 400 }
      );
    }

    if (!purpose?.trim()) {
      return NextResponse.json(
        { error: "Keperluan peminjaman wajib diisi" },
        { status: 400 }
      );
    }

    // Validasi cart
    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return NextResponse.json(
        { error: "Pilih minimal satu barang" },
        { status: 400 }
      );
    }

    const cartItems = cart.map((c: any) => ({
      itemId: Number(c.itemId),
      quantity: Math.max(1, Number(c.quantity) || 1),
      notes: c.notes?.trim() || "",
    }));

    const itemIds = cartItems.map((c: any) => c.itemId);

    // Ambil semua item sekaligus
    const dbItems = await db
      .select()
      .from(items)
      .where(inArray(items.id, itemIds));

    const itemMap = new Map(dbItems.map((i) => [i.id, i]));

    // Validasi stok semua item
    for (const cartItem of cartItems) {
      const dbItem = itemMap.get(cartItem.itemId);
      if (!dbItem) {
        return NextResponse.json(
          { error: `Barang ID ${cartItem.itemId} tidak ditemukan` },
          { status: 404 }
        );
      }
      if (dbItem.availableQuantity < cartItem.quantity) {
        return NextResponse.json(
          { error: `Stok "${dbItem.name}" tidak mencukupi. Tersisa ${dbItem.availableQuantity} unit.` },
          { status: 400 }
        );
      }
    }

    const returnDate = new Date(expectedReturnDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (isNaN(returnDate.getTime()) || returnDate < today) {
      return NextResponse.json(
        { error: "Tanggal kembali tidak valid" },
        { status: 400 }
      );
    }

    // Buat transaksi utama
    const [{ id: txId }] = await db
      .insert(transactions)
      .values({
        userId: null, // transaksi dari admin, bukan user terdaftar
        itemId: null, // multi-item, pakai transaction_items
        borrowerName,
        borrowerDepartment: borrowerDepartment || null,
        borrowerEmail: borrowerEmail || null,
        borrowerPhone: borrowerPhone || null,
        borrowerNim: borrowerNim || null,
        borrowerLocation: borrowerLocation || null,
        quantity: cartItems.reduce((sum: number, c: any) => sum + c.quantity, 0),
        status: "active", // admin langsung aktif, tanpa perlu TTD
        expectedReturnDate: returnDate,
        purpose: purpose.trim(),
        notes: notes?.trim() || null,
      })
      .$returningId();

    // Insert semua item ke transaction_items
    await db.insert(transactionItems).values(
      cartItems.map((c: any) => ({
        transactionId: txId,
        itemId: c.itemId,
        quantity: c.quantity,
        notes: c.notes || null,
      }))
    );

    // Kurangi stok semua item
    for (const cartItem of cartItems) {
      const dbItem = itemMap.get(cartItem.itemId)!;
      const newAvailable = dbItem.availableQuantity - cartItem.quantity;
      await db
        .update(items)
        .set({
          availableQuantity: newAvailable,
          status: newAvailable === 0 ? "borrowed" : "available",
          updatedAt: new Date(),
        })
        .where(eq(items.id, dbItem.id));
    }

    return NextResponse.json({ id: txId }, { status: 201 });
  } catch (error) {
    console.error("POST /api/transactions error:", error);
    return NextResponse.json(
      { error: "Failed to create transaction" },
      { status: 500 }
    );
  }
}
