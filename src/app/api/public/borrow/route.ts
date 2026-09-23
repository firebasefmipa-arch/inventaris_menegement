import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, transactionItems, items, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { jsonBody } from "@/lib/json-body";

// Endpoint lama untuk katalog publik. Katalog publik sudah tidak dipakai (tidak
// ada menu/link ke sana), tapi alamatnya masih bisa dibuka langsung — jadi
// aturannya DISAMAKAN dengan /api/pinjam supaya tidak jadi jalur bypass:
//
//   - status `pending_approval`: admin tetap harus menyetujui.
//   - identitas peminjam diambil dari SESI, bukan dari body. Body hanya dipakai
//     untuk data yang memang bukan identitas (keperluan, catatan, lokasi).
//   - wajib NIM + tanda tangan elektronik.
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await jsonBody(request);
    if (!body) return NextResponse.json({ error: "Body permintaan tidak valid" }, { status: 400 });
    const { itemId, quantity, returnDate, notes, purpose, location } = body;

    if (!itemId || !quantity || !returnDate) {
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

    // 2. Identitas dari SESI + wajib NIM & tanda tangan elektronik.
    const [userRow] = await db
      .select({
        name: users.name,
        email: users.email,
        phone: users.phone,
        nim: users.nim,
        department: users.department,
        signatureUrl: users.signatureUrl,
      })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    if (!userRow?.nim) {
      return NextResponse.json({ error: "NIM_REQUIRED" }, { status: 422 });
    }
    if (!userRow?.signatureUrl) {
      return NextResponse.json({ error: "SIGNATURE_REQUIRED" }, { status: 422 });
    }
    if (!purpose?.trim()) {
      return NextResponse.json({ error: "Keperluan peminjaman wajib diisi." }, { status: 400 });
    }

    const nama = (userRow.name || session.user.name || "").trim();
    const phone = (userRow.phone || "").trim();
    if (!nama || !phone) {
      return NextResponse.json(
        { error: "Nama dan nomor HP wajib ada di profil Anda." },
        { status: 400 }
      );
    }

    const returnDateObj = new Date(returnDate);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (isNaN(returnDateObj.getTime()) || returnDateObj < today) {
      return NextResponse.json({ error: "Tanggal kembali tidak valid." }, { status: 400 });
    }

    // 3. Create transaction — pending_approval, sama seperti /api/pinjam.
    const [{ id: txId }] = await db
      .insert(transactions)
      .values({
        userId: session.user.id,
        itemId: null,
        borrowerName: nama,
        borrowerDepartment: (userRow.department || "").trim() || null,
        borrowerEmail: userRow.email || null,
        borrowerPhone: phone,
        borrowerNim: userRow.nim,
        borrowerLocation: location?.trim() || null,
        quantity,
        expectedReturnDate: returnDateObj,
        purpose: purpose.trim(),
        notes: notes?.trim() || null,
        status: "pending_approval",
      })
      .$returningId();

    await db.insert(transactionItems).values({
      transactionId: txId,
      itemId,
      quantity,
      notes: notes?.trim() || null,
      itemName: item.name,
      itemCode: item.itemCode ?? null,
      itemInventoryNumber: item.inventoryNumber ?? null,
    });

    // 4. Tahan stok
    const newAvailable = item.availableQuantity - quantity;
    await db
      .update(items)
      .set({
        availableQuantity: newAvailable,
        status: newAvailable === 0 ? "borrowed" : "available",
        updatedAt: new Date(),
      })
      .where(eq(items.id, itemId));

    return NextResponse.json(
      { success: true, transactionId: txId, code: `PB-${String(txId).padStart(4, "0")}`, status: "pending_approval" },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/public/borrow error:", error);
    return NextResponse.json(
      { error: "Gagal memproses peminjaman" },
      { status: 500 }
    );
  }
}
