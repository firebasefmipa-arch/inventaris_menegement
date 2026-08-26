import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, transactionItems, items, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { generateBorrowingPDF } from "@/lib/pdf-generator";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const txId = parseInt(id, 10);
    if (isNaN(txId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const [tx] = await db.select().from(transactions).where(eq(transactions.id, txId)).limit(1);
    if (!tx) return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });

    const role = (session.user as any)?.role;
    // User hanya bisa regenerate miliknya, admin bisa semua
    if (tx.userId !== session.user.id && role !== "admin" && role !== "super_admin") {
      return NextResponse.json({ error: "Tidak memiliki akses" }, { status: 403 });
    }

    // Hanya bisa regenerate jika status 'deleted'
    if (tx.signedDocumentUrl !== "deleted") {
      return NextResponse.json({ error: "Dokumen belum dihapus atau sudah ada" }, { status: 400 });
    }

    // Ambil item transaksi
    const txItemRows = await db
      .select({
        itemId: transactionItems.itemId,
        quantity: transactionItems.quantity,
        notes: transactionItems.notes,
        itemName: items.name,
        inventoryNumber: items.inventoryNumber,
      })
      .from(transactionItems)
      .leftJoin(items, eq(transactionItems.itemId, items.id))
      .where(eq(transactionItems.transactionId, txId));

    let pdfItems: { name: string; quantity: number; inventoryNumber?: string | null; notes?: string }[] = [];
    if (txItemRows.length > 0) {
      pdfItems = txItemRows.map((r) => ({
        name: r.itemName || "Barang",
        quantity: r.quantity,
        inventoryNumber: r.inventoryNumber,
        notes: r.notes || "",
      }));
    } else if (tx.itemId) {
      const [item] = await db.select().from(items).where(eq(items.id, tx.itemId)).limit(1);
      if (item) pdfItems = [{ name: item.name, quantity: tx.quantity, inventoryNumber: item.inventoryNumber }];
    }

    if (pdfItems.length === 0) {
      return NextResponse.json({ error: "Tidak ada barang ditemukan" }, { status: 404 });
    }

    // Ambil nim dari user
    let nimValue = "";
    if (tx.userId) {
      const [txUser] = await db.select({ nim: users.nim }).from(users).where(eq(users.id, tx.userId)).limit(1);
      nimValue = txUser?.nim || "";
    }

    // Generate PDF
    const pdfBuffer = await generateBorrowingPDF({
      borrowerName: tx.borrowerName,
      borrowerId: nimValue,
      department: tx.borrowerDepartment || "",
      phone: tx.borrowerPhone || "",
      purpose: tx.purpose || "",
      notes: tx.notes || "",
      borrowDate: tx.borrowDate,
      returnDate: tx.expectedReturnDate,
      items: pdfItems,
    });

    // Simpan ke disk
    const borrowerSafe = (tx.borrowerName || "Peminjam")
      .replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_").slice(0, 40);
    const d = tx.borrowDate;
    const dateStr = `${String(new Date(d).getDate()).padStart(2, "0")}${String(new Date(d).getMonth() + 1).padStart(2, "0")}${new Date(d).getFullYear()}`;
    const filename = `${borrowerSafe}_${dateStr}_regen.pdf`;

    const uploadDir = path.join(process.cwd(), "public", "uploads", "signed_forms");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, filename), pdfBuffer);

    const newUrl = `/uploads/signed_forms/${filename}`;

    // Update DB — set URL baru, status kembali ke pending_approval
    await db.update(transactions).set({
      signedDocumentUrl: newUrl,
      status: "pending_approval",
    }).where(eq(transactions.id, txId));

    return NextResponse.json({ success: true, url: newUrl, message: "Dokumen berhasil digenerate ulang" });
  } catch (error) {
    console.error("Regenerate doc error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan" }, { status: 500 });
  }
}
