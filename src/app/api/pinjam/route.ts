import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, transactionItems, items } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";

type CartItem = {
  itemId: number;
  quantity: number;
  notes?: string;
};

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const borrowerInput = body.borrower || {};

    const name = (borrowerInput.name || session.user.name || "").trim();
    const email = (borrowerInput.email || session.user.email || "").trim();
    const phone = (borrowerInput.phone || (session.user as any).phone || "").trim();
    const nim = (borrowerInput.nim || (session.user as any).nim || "").trim();
    const department = (borrowerInput.department || (session.user as any).department || "").trim();
    const userId = session.user.id;
    const { expectedReturnDate, notes, cart } = body;

    // Validasi field wajib
    if (!expectedReturnDate || !name || !phone) {
      return NextResponse.json(
        { error: "Nama, nomor HP, dan tanggal kembali wajib diisi." },
        { status: 400 }
      );
    }

    // Cek NIM — wajib ada sebelum bisa meminjam
    if (!nim) {
      return NextResponse.json(
        { error: "NIM_REQUIRED" },
        { status: 422 }
      );
    }

    // Validasi cart
    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return NextResponse.json(
        { error: "Pilih minimal satu barang untuk dipinjam." },
        { status: 400 }
      );
    }

    const returnDate = new Date(expectedReturnDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (isNaN(returnDate.getTime()) || returnDate < today) {
      return NextResponse.json(
        { error: "Tanggal kembali tidak valid." },
        { status: 400 }
      );
    }

    // Validasi setiap item di cart
    const cartItems: CartItem[] = cart.map((c: any) => ({
      itemId: Number(c.itemId),
      quantity: Math.max(1, Number(c.quantity) || 1),
      notes: c.notes?.trim() || "",
    }));

    const itemIds = cartItems.map((c) => c.itemId);

    // Ambil semua item dari DB sekaligus
    const dbItems = await db
      .select()
      .from(items)
      .where(inArray(items.id, itemIds));

    // Buat map untuk lookup cepat
    const itemMap = new Map(dbItems.map((i) => [i.id, i]));

    // Validasi stok semua item
    for (const cartItem of cartItems) {
      const dbItem = itemMap.get(cartItem.itemId);
      if (!dbItem) {
        return NextResponse.json(
          { error: `Barang ID ${cartItem.itemId} tidak ditemukan.` },
          { status: 404 }
        );
      }
      if (dbItem.availableQuantity < cartItem.quantity) {
        return NextResponse.json(
          {
            error: `Stok "${dbItem.name}" tidak mencukupi. Tersisa ${dbItem.availableQuantity} unit.`,
          },
          { status: 400 }
        );
      }
    }

    // Buat satu transaksi utama
    const [{ id: txId }] = await db
      .insert(transactions)
      .values({
        userId,
        itemId: null, // multi-item, gunakan transaction_items
        borrowerName: name,
        borrowerEmail: email || null,
        borrowerPhone: phone || null,
        borrowerDepartment: department || null,
        quantity: cartItems.reduce((sum, c) => sum + c.quantity, 0),
        expectedReturnDate: returnDate,
        notes: notes?.trim() || null,
      })
      .$returningId();

    // Insert semua item ke transaction_items
    await db.insert(transactionItems).values(
      cartItems.map((c) => ({
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

    // Ambil data transaksi yang baru dibuat
    const [tx] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, txId));

    // Susun summary nama barang
    const itemNames = cartItems
      .map((c) => {
        const item = itemMap.get(c.itemId);
        return item ? `${item.name} (×${c.quantity})` : "";
      })
      .filter(Boolean)
      .join(", ");

    return NextResponse.json(
      {
        code: `PB-${String(txId).padStart(4, "0")}`,
        transactionId: txId,
        borrowerName: name,
        borrowerNim: nim || null,
        itemNames,
        totalItems: cartItems.length,
        totalQuantity: cartItems.reduce((sum, c) => sum + c.quantity, 0),
        borrowDate: tx.borrowDate,
        expectedReturnDate: tx.expectedReturnDate,
        items: cartItems.map((c) => ({
          name: itemMap.get(c.itemId)?.name || "",
          inventoryNumber: itemMap.get(c.itemId)?.inventoryNumber || null,
          quantity: c.quantity,
          notes: c.notes,
        })),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/pinjam error:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan. Silakan coba lagi." },
      { status: 500 }
    );
  }
}
