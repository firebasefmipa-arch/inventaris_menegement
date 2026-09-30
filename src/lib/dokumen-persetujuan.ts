/**
 * Membuat ulang dokumen PDF peminjaman / serah terima, LENGKAP dengan blok
 * tanda tangan admin yang menyetujui.
 *
 * Dipakai dua tempat:
 *   - rute persetujuan  → membuat dokumen final begitu admin menekan Setujui
 *   - rute buat-ulang   → menyegarkan dokumen yang hilang/rusak
 *
 * Dijadikan satu berkas supaya kedua jalur menghasilkan dokumen yang SAMA
 * PERSIS — kalau logikanya disalin dua kali, suatu saat keduanya berbeda dan
 * dokumen hasil "buat ulang" tidak lagi cocok dengan aslinya.
 */
import { db } from "@/db";
import { transactions, transactionItems, handovers, handoverItems, items, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { namaBarang } from "@/lib/item-snapshot";
import { generateBorrowingPDF } from "@/lib/pdf-generator";
import { generateHandoverPDF } from "@/lib/handover-pdf-generator";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { uploadPath } from "@/lib/upload-dir";

/**
 * Data penyetuju kini tinggal di @/lib/penyetuju (dipakai juga oleh generator
 * PDF, jadi tidak boleh menumpang di berkas ini agar tidak saling impor).
 */
export type { Penyetuju } from "@/lib/penyetuju";
import type { Penyetuju } from "@/lib/penyetuju";

const namaAman = (teks: string, cadangan: string) =>
  (teks || cadangan).replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_").slice(0, 40);

const tanggalRingkas = (d: Date) =>
  `${String(new Date(d).getDate()).padStart(2, "0")}${String(new Date(d).getMonth() + 1).padStart(2, "0")}${new Date(d).getFullYear()}`;

/**
 * Hasilkan PDF peminjaman ke folder signed_forms.
 * Mengembalikan URL barunya.
 */
export async function buatDokumenPinjam(txId: number, penyetuju: Penyetuju): Promise<string> {
  const [tx] = await db.select().from(transactions).where(eq(transactions.id, txId)).limit(1);
  if (!tx) throw new Error(`Transaksi ${txId} tidak ditemukan`);

  // Data master (live) menang; snapshot riwayat jadi cadangan bila barangnya
  // sudah dihapus.
  const barisItem = await db
    .select({
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
  if (barisItem.length > 0) {
    pdfItems = barisItem.map((r) => ({
      name: namaBarang(r.snapName, r.itemName),
      quantity: r.quantity,
      inventoryNumber: r.inventoryNumber ?? r.snapInventoryNumber,
      itemCode: r.itemCode ?? r.snapCode,
      notes: r.notes || "",
    }));
  } else if (tx.itemId) {
    const [item] = await db.select().from(items).where(eq(items.id, tx.itemId)).limit(1);
    if (item)
      pdfItems = [
        { name: item.name, quantity: tx.quantity, inventoryNumber: item.inventoryNumber, itemCode: item.itemCode },
      ];
  }
  if (pdfItems.length === 0) throw new Error("Tidak ada barang ditemukan");

  // TTD & NIM pemohon
  let nimValue = "";
  let signatureUrl: string | null = null;
  if (tx.userId) {
    const [u] = await db
      .select({ nim: users.nim, signatureUrl: users.signatureUrl })
      .from(users)
      .where(eq(users.id, tx.userId as any))
      .limit(1);
    nimValue = u?.nim || "";
    signatureUrl = u?.signatureUrl || null;
  }

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
    penyetuju,
    kodeVerifikasi: tx.verificationCode,
    unit: tx.unit,
    tanggalTandaTangan: penyetuju ? new Date() : undefined,
  });

  // Tanggal pada blok tanda tangan = tanggal persetujuan bila sudah disetujui,
  // kalau belum pakai tanggal pinjam (dokumen pengajuan).
  const tanggalDokumen = penyetuju ? new Date() : tx.borrowDate;
  const filename = `PB_${namaAman(tx.borrowerName, "Peminjam")}_${tanggalRingkas(tanggalDokumen)}_${txId}.pdf`;
  const dir = uploadPath("signed_forms");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), pdfBuffer);
  return `/uploads/signed_forms/${filename}`;
}

/** Hasilkan PDF serah terima ke folder handovers. Mengembalikan URL barunya. */
export async function buatDokumenSerahTerima(hvId: number, penyetuju: Penyetuju): Promise<string> {
  const [hv] = await db.select().from(handovers).where(eq(handovers.id, hvId)).limit(1);
  if (!hv) throw new Error(`Serah terima ${hvId} tidak ditemukan`);

  const barisItem = await db
    .select({
      quantity: handoverItems.quantity,
      itemName: items.name,
      inventoryNumber: items.inventoryNumber,
      assetNumber: items.assetNumber,
      itemCode: items.itemCode,
      snapName: handoverItems.itemName,
      snapCode: handoverItems.itemCode,
      snapInventoryNumber: handoverItems.itemInventoryNumber,
    })
    .from(handoverItems)
    .leftJoin(items, eq(handoverItems.itemId, items.id))
    .where(eq(handoverItems.handoverId, hvId));

  if (barisItem.length === 0) throw new Error("Tidak ada barang ditemukan");

  let signatureUrl: string | null = null;
  if (hv.userId) {
    const [u] = await db
      .select({ signatureUrl: users.signatureUrl })
      .from(users)
      .where(eq(users.id, hv.userId as any))
      .limit(1);
    signatureUrl = u?.signatureUrl || null;
  }

  const pdfBuffer = await generateHandoverPDF({
    receiverName: hv.receiverName,
    receiverNim: hv.receiverNim || "",
    unitName: hv.unitName || hv.department || "",
    department: hv.department || "",
    phone: hv.phone || "",
    location: hv.location || "",
    purpose: hv.purpose || "",
    notes: hv.notes || "",
    handoverDate: hv.handoverDate,
    signatureUrl,
    penyetuju,
    kodeVerifikasi: hv.verificationCode,
    // Label penyetuju memakai unit PEMILIK barang (kolom `unit`), bukan
    // `unitName` yang di dokumen berarti unit si penerima barang.
    unit: hv.unit,
    tanggalTandaTangan: penyetuju ? new Date() : undefined,
    items: barisItem.map((r) => ({
      name: namaBarang(r.snapName, r.itemName),
      quantity: r.quantity,
      assetNumber: r.assetNumber,
      itemCode: r.itemCode ?? r.snapCode,
      inventoryNumber: r.inventoryNumber ?? r.snapInventoryNumber,
    })),
  });

  const tanggalDokumen = penyetuju ? new Date() : hv.handoverDate;
  const filename = `ST_${namaAman(hv.receiverName, "Penerima")}_${tanggalRingkas(tanggalDokumen)}_${hvId}.pdf`;
  const dir = uploadPath("handovers");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), pdfBuffer);
  return `/uploads/handovers/${filename}`;
}
