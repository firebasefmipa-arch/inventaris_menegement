import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, transactionItems, items, users } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { generateBorrowingPDF } from "@/lib/pdf-generator";
import { writeFile, mkdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

/**
 * PATCH /api/transactions/[id]/correct
 * Admin koreksi daftar barang sebelum approve.
 * Body: { items: [{ itemId, quantity, notes? }] }
 * Setelah koreksi, PDF di-regenerate dengan data baru.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user || (role !== "admin" && role !== "super_admin"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const txId = parseInt(id, 10);
    if (isNaN(txId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const body = await req.json();
    const newItems: { itemId: number; quantity: number; notes?: string }[] = body.items;

    if (!Array.isArray(newItems) || newItems.length === 0)
      return NextResponse.json({ error: "Minimal satu barang wajib ada" }, { status: 400 });

    const [tx] = await db.select().from(transactions).where(eq(transactions.id, txId));
    if (!tx) return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });
    if (tx.status !== "pending_approval")
      return NextResponse.json({ error: "Hanya bisa koreksi transaksi berstatus menunggu persetujuan" }, { status: 400 });

    // ── Ambil items lama untuk kembalikan stok ──
    const oldItems = await db.select().from(transactionItems).where(eq(transactionItems.transactionId, txId));

    // Kembalikan stok items lama
    for (const old of oldItems) {
      const [item] = await db.select().from(items).where(eq(items.id, old.itemId)).limit(1);
      if (item) {
        const newAvailable = item.availableQuantity + old.quantity;
        await db.update(items).set({
          availableQuantity: newAvailable,
          status: newAvailable > 0 ? "available" : "borrowed",
          updatedAt: new Date(),
        }).where(eq(items.id, item.id));
      }
    }

    // ── Validasi & kurangi stok items baru ──
    const itemIds = newItems.map((i) => i.itemId);
    const dbItems = await db.select().from(items).where(inArray(items.id, itemIds));
    const itemMap = new Map(dbItems.map((i) => [i.id, i]));

    for (const ni of newItems) {
      const dbItem = itemMap.get(ni.itemId);
      if (!dbItem) return NextResponse.json({ error: `Barang ID ${ni.itemId} tidak ditemukan` }, { status: 404 });
      if (dbItem.availableQuantity < ni.quantity)
        return NextResponse.json({ error: `Stok "${dbItem.name}" tidak mencukupi. Tersisa ${dbItem.availableQuantity} unit.` }, { status: 400 });
    }

    // ── Hapus items lama, insert items baru ──
    await db.delete(transactionItems).where(eq(transactionItems.transactionId, txId));
    await db.insert(transactionItems).values(
      newItems.map((ni) => ({
        transactionId: txId,
        itemId: ni.itemId,
        quantity: ni.quantity,
        notes: ni.notes?.trim() || null,
      }))
    );

    // Kurangi stok baru
    const totalQty = newItems.reduce((s, ni) => s + ni.quantity, 0);
    for (const ni of newItems) {
      const dbItem = itemMap.get(ni.itemId)!;
      const newAvailable = dbItem.availableQuantity - ni.quantity;
      await db.update(items).set({
        availableQuantity: newAvailable,
        status: newAvailable === 0 ? "borrowed" : "available",
        updatedAt: new Date(),
      }).where(eq(items.id, dbItem.id));
    }

    // Update total qty di transaksi utama
    await db.update(transactions).set({ quantity: totalQty }).where(eq(transactions.id, txId));

    // ── Regenerate PDF ──
    let pdfUrl = tx.signedDocumentUrl;
    try {
      // Ambil TTD user
      let signatureUrl: string | null = null;
      if (tx.userId) {
        const [userRow] = await db.select({ signatureUrl: users.signatureUrl }).from(users).where(eq(users.id, tx.userId)).limit(1);
        signatureUrl = userRow?.signatureUrl ?? null;
      }

      const updatedTx = await db.select().from(transactions).where(eq(transactions.id, txId)).limit(1);
      const txData = updatedTx[0];

      const pdfBuffer = await generateBorrowingPDF({
        borrowerName: txData.borrowerName,
        borrowerId: txData.borrowerNim || "",
        department: txData.borrowerDepartment || "",
        phone: txData.borrowerPhone || "",
        purpose: txData.purpose || "",
        notes: txData.notes || "",
        borrowDate: txData.borrowDate,
        returnDate: txData.expectedReturnDate,
        signatureUrl,
        items: newItems.map((ni) => ({
          name: itemMap.get(ni.itemId)?.name || "Barang",
          quantity: ni.quantity,
          inventoryNumber: itemMap.get(ni.itemId)?.inventoryNumber ?? null,
          notes: ni.notes || "",
        })),
      });

      const borrowerSafe = txData.borrowerName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_").slice(0, 40);
      const d = txData.borrowDate;
      const dateStr = `${String(d.getDate()).padStart(2,"0")}${String(d.getMonth()+1).padStart(2,"0")}${d.getFullYear()}`;
      const filename = `${borrowerSafe}_${dateStr}_${txId}_corrected.pdf`;
      const uploadDir = path.join(process.cwd(), "public", "uploads", "pending");
      await mkdir(uploadDir, { recursive: true });

      // Hapus PDF lama jika ada
      if (tx.signedDocumentUrl?.startsWith("/uploads/pending/")) {
        const oldPath = path.join(process.cwd(), "public", tx.signedDocumentUrl);
        if (existsSync(oldPath)) await unlink(oldPath).catch(() => {});
      }

      await writeFile(path.join(uploadDir, filename), pdfBuffer);
      pdfUrl = `/uploads/pending/${filename}`;
      await db.update(transactions).set({ signedDocumentUrl: pdfUrl }).where(eq(transactions.id, txId));
    } catch (pdfErr) {
      console.error("Regenerate PDF error:", pdfErr);
    }

    return NextResponse.json({ success: true, pdfUrl, totalItems: newItems.length, totalQty });
  } catch (error) {
    console.error("PATCH /api/transactions/[id]/correct error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan" }, { status: 500 });
  }
}
