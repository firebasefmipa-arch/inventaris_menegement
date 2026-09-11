import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, items, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";

// Endpoint lama untuk katalog publik (tanpa login). Katalog publik sudah
// dihapus dari UI dan peminjaman sekarang wajib login lewat /api/pinjam.
// Endpoint ini ditutup: wajib login + aturan yang sama dengan /api/pinjam
// (NIM & tanda tangan elektronik wajib ada) supaya tidak jadi jalur bypass.
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    if (!item.canBorrow) {
      return NextResponse.json(
        { error: `Barang "${item.name}" tidak tersedia untuk dipinjam.` },
        { status: 400 }
      );
    }

    if (item.availableQuantity < quantity) {
      return NextResponse.json(
        { error: `Stok tidak mencukupi. Tersedia: ${item.availableQuantity}` },
        { status: 400 }
      );
    }

    // 2. Wajib NIM + tanda tangan elektronik (sama seperti /api/pinjam)
    const [userRow] = await db
      .select({ nim: users.nim, signatureUrl: users.signatureUrl })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    if (!userRow?.nim) {
      return NextResponse.json({ error: "NIM_REQUIRED" }, { status: 422 });
    }
    if (!userRow?.signatureUrl) {
      return NextResponse.json({ error: "SIGNATURE_REQUIRED" }, { status: 422 });
    }

    // 3. Create transaction
    const [transaction] = await db
      .insert(transactions)
      .values({
        userId: session.user.id,
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
