import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, transactionItems, items, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { namaBarang } from "@/lib/item-snapshot";
import { generateBorrowingPDF } from "@/lib/pdf-generator";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { uploadPath, uploadPathFromUrl } from "@/lib/upload-dir";
import { periksaAksesUnit } from "@/lib/akses-unit";

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
    const pemilik = tx.userId === session.user.id;
    if (!pemilik && role !== "admin" && role !== "super_admin") {
      return NextResponse.json({ error: "Tidak memiliki akses" }, { status: 403 });
    }
    // Admin yang bukan pemilik hanya boleh menyentuh pecahan unitnya sendiri.
    if (!pemilik) {
      const tolak = await periksaAksesUnit(session, tx.unit);
      if (tolak) return NextResponse.json({ error: tolak.pesan }, { status: tolak.status });
    }

    // Hanya bisa regenerate jika status 'deleted' ATAU file fisik tidak ada (rusak/hilang)
    const fileMissing =
      tx.signedDocumentUrl &&
      tx.signedDocumentUrl !== "deleted" &&
      tx.signedDocumentUrl.startsWith("/uploads/") &&
      !existsSync(uploadPathFromUrl(tx.signedDocumentUrl));
    if (tx.signedDocumentUrl !== "deleted" && !fileMissing) {
      return NextResponse.json({ error: "Dokumen belum dihapus atau sudah ada" }, { status: 400 });
    }

    // Ambil item transaksi. Data master (live) menang; snapshot dari baris riwayat
    // jadi cadangan kalau barangnya sudah dihapus.
    const txItemRows = await db
      .select({
        itemId: transactionItems.itemId,
        quantity: transactionItems.quantity,
        notes: transactionItems.notes,
        itemName: items.name,
        inventoryNumber: items.inventoryNumber,
        itemCode: items.itemCode,
        snapName: transactionItems.itemName,
        snapCode: transactionItems.itemCode,
        snapInventoryNumber: transactionItems.itemInventoryNumber,
      })
      .from(transactionItems)
      .leftJoin(items, eq(transactionItems.itemId, items.id))
      .where(eq(transactionItems.transactionId, txId));

    let pdfItems: { name: string; quantity: number; inventoryNumber?: string | null; itemCode?: string | null; notes?: string }[] = [];
    if (txItemRows.length > 0) {
      pdfItems = txItemRows.map((r) => ({
        name: namaBarang(r.snapName, r.itemName),
        quantity: r.quantity,
        inventoryNumber: r.inventoryNumber ?? r.snapInventoryNumber,
        itemCode: r.itemCode ?? r.snapCode,
        notes: r.notes || "",
      }));
    } else if (tx.itemId) {
      const [item] = await db.select().from(items).where(eq(items.id, tx.itemId)).limit(1);
      if (item) pdfItems = [{ name: item.name, quantity: tx.quantity, inventoryNumber: item.inventoryNumber, itemCode: item.itemCode }];
    }

    if (pdfItems.length === 0) {
      return NextResponse.json({ error: "Tidak ada barang ditemukan" }, { status: 404 });
    }

    // Ambil nim & TTD dari user
    let nimValue = "";
    let signatureUrl: string | null = null;
    if (tx.userId) {
      const [txUser] = await db.select({ nim: users.nim, signatureUrl: users.signatureUrl }).from(users).where(eq(users.id, tx.userId as any)).limit(1);
      nimValue = txUser?.nim || "";
      signatureUrl = txUser?.signatureUrl || null;
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
      signatureUrl,
    });

    // Simpan ke disk
    const borrowerSafe = (tx.borrowerName || "Peminjam")
      .replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_").slice(0, 40);
    const d = tx.borrowDate;
    const dateStr = `${String(new Date(d).getDate()).padStart(2, "0")}${String(new Date(d).getMonth() + 1).padStart(2, "0")}${new Date(d).getFullYear()}`;
    const filename = `PB_${borrowerSafe}_${dateStr}_${txId}_regen.pdf`;

    const uploadDir = uploadPath("signed_forms");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, filename), pdfBuffer);

    const newUrl = `/uploads/signed_forms/${filename}`;

    // Update DB — set URL baru saja, status tidak berubah
    await db.update(transactions).set({
      signedDocumentUrl: newUrl,
    }).where(eq(transactions.id, txId));

    return NextResponse.json({ success: true, url: newUrl, message: "Dokumen berhasil digenerate ulang" });
  } catch (error) {
    console.error("Regenerate doc error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan" }, { status: 500 });
  }
}
