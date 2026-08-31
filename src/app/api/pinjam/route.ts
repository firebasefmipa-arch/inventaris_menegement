import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, transactionItems, items, users } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { generateBorrowingPDF } from "@/lib/pdf-generator";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

type CartItem = { itemId: number; quantity: number; notes?: string };

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const borrowerInput = body.borrower || {};

    const name       = (borrowerInput.name       || session.user.name             || "").trim();
    const email      = (borrowerInput.email      || session.user.email            || "").trim();
    const phone      = (borrowerInput.phone      || (session.user as any).phone   || "").trim();
    const nim        = (borrowerInput.nim        || (session.user as any).nim     || "").trim();
    const department = (borrowerInput.department || (session.user as any).department || "").trim();
    const userId     = session.user.id!;
    const { expectedReturnDate, notes, purpose, location, cart } = body;

    // ── Validasi field wajib ──
    if (!expectedReturnDate || !name || !phone)
      return NextResponse.json({ error: "Nama, nomor HP, dan tanggal kembali wajib diisi." }, { status: 400 });
    if (!purpose?.trim())
      return NextResponse.json({ error: "Keperluan peminjaman wajib diisi." }, { status: 400 });
    if (!location?.trim())
      return NextResponse.json({ error: "Tempat/lokasi peminjaman wajib diisi." }, { status: 400 });
    if (!nim)
      return NextResponse.json({ error: "NIM_REQUIRED" }, { status: 422 });
    if (!cart || !Array.isArray(cart) || cart.length === 0)
      return NextResponse.json({ error: "Pilih minimal satu barang untuk dipinjam." }, { status: 400 });

    // ── Cek TTD elektronik ──
    const [userRow] = await db
      .select({ signatureUrl: users.signatureUrl })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userRow?.signatureUrl)
      return NextResponse.json({ error: "SIGNATURE_REQUIRED" }, { status: 422 });

    const returnDate = new Date(expectedReturnDate);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (isNaN(returnDate.getTime()) || returnDate < today)
      return NextResponse.json({ error: "Tanggal kembali tidak valid." }, { status: 400 });

    // ── Validasi stok ──
    const cartItems: CartItem[] = cart.map((c: any) => ({
      itemId: Number(c.itemId),
      quantity: Math.max(1, Number(c.quantity) || 1),
      notes: c.notes?.trim() || "",
    }));

    const dbItems = await db.select().from(items).where(inArray(items.id, cartItems.map((c) => c.itemId)));
    const itemMap = new Map(dbItems.map((i) => [i.id, i]));

    for (const c of cartItems) {
      const dbItem = itemMap.get(c.itemId);
      if (!dbItem) return NextResponse.json({ error: `Barang ID ${c.itemId} tidak ditemukan.` }, { status: 404 });
      if (dbItem.availableQuantity < c.quantity)
        return NextResponse.json({ error: `Stok "${dbItem.name}" tidak mencukupi. Tersisa ${dbItem.availableQuantity} unit.` }, { status: 400 });
    }

    // ── Buat transaksi ──
    const [{ id: txId }] = await db
      .insert(transactions)
      .values({
        userId,
        itemId: null,
        borrowerName: name,
        borrowerEmail: email || null,
        borrowerPhone: phone || null,
        borrowerDepartment: department || null,
        borrowerNim: nim || null,
        quantity: cartItems.reduce((s, c) => s + c.quantity, 0),
        expectedReturnDate: returnDate,
        purpose: purpose.trim(),
        notes: notes?.trim() || null,
        borrowerLocation: location?.trim() || null,
        status: "pending_approval",
      })
      .$returningId();

    await db.insert(transactionItems).values(
      cartItems.map((c) => ({ transactionId: txId, itemId: c.itemId, quantity: c.quantity, notes: c.notes || null }))
    );

    // ── Kurangi stok ──
    for (const c of cartItems) {
      const dbItem = itemMap.get(c.itemId)!;
      const newAvailable = dbItem.availableQuantity - c.quantity;
      await db.update(items).set({
        availableQuantity: newAvailable,
        status: newAvailable === 0 ? "borrowed" : "available",
        updatedAt: new Date(),
      }).where(eq(items.id, dbItem.id));
    }

    // ── Generate PDF dengan TTD ──
    const [tx] = await db.select().from(transactions).where(eq(transactions.id, txId));
    let pdfUrl: string | null = null;
    try {
      const pdfBuffer = await generateBorrowingPDF({
        borrowerName: name,
        borrowerId: nim,
        department,
        phone,
        purpose: purpose.trim(),
        notes: notes?.trim() || "",
        borrowDate: tx.borrowDate,
        returnDate,
        signatureUrl: userRow.signatureUrl,
        items: cartItems.map((c) => ({
          name: itemMap.get(c.itemId)?.name || "Barang",
          quantity: c.quantity,
          inventoryNumber: itemMap.get(c.itemId)?.inventoryNumber ?? null,
          notes: c.notes || "",
        })),
      });

      const borrowerSafe = name.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_").slice(0, 40);
      const d = tx.borrowDate;
      const dateStr = `${String(d.getDate()).padStart(2,"0")}${String(d.getMonth()+1).padStart(2,"0")}${d.getFullYear()}`;
      const filename = `${borrowerSafe}_${dateStr}_${txId}.pdf`;

      const uploadDir = path.join(process.cwd(), "public", "uploads", "pending");
      await mkdir(uploadDir, { recursive: true });
      await writeFile(path.join(uploadDir, filename), pdfBuffer);

      pdfUrl = `/uploads/pending/${filename}`;
      await db.update(transactions).set({ signedDocumentUrl: pdfUrl }).where(eq(transactions.id, txId));
    } catch (pdfErr) {
      console.error("PDF generate error:", pdfErr);
    }

    const itemNames = cartItems.map((c) => {
      const item = itemMap.get(c.itemId);
      return item ? `${item.name} (×${c.quantity})` : "";
    }).filter(Boolean).join(", ");

    return NextResponse.json({
      code: `PB-${String(txId).padStart(4, "0")}`,
      transactionId: txId,
      borrowerName: name,
      borrowerNim: nim,
      itemNames,
      totalItems: cartItems.length,
      totalQuantity: cartItems.reduce((s, c) => s + c.quantity, 0),
      borrowDate: tx.borrowDate,
      expectedReturnDate: tx.expectedReturnDate,
      pdfUrl,
      items: cartItems.map((c) => ({
        name: itemMap.get(c.itemId)?.name || "",
        inventoryNumber: itemMap.get(c.itemId)?.inventoryNumber || null,
        quantity: c.quantity,
        notes: c.notes,
      })),
    }, { status: 201 });

  } catch (error) {
    console.error("POST /api/pinjam error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan. Silakan coba lagi." }, { status: 500 });
  }
}
