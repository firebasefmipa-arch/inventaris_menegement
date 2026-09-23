/**
 * Penjaga "barang habis karena diserahkan → hilang sendiri".
 *
 * Aturan yang diuji: begitu stok FISIK (quantity) jadi 0 karena serah terima,
 * barang itu dihapus dari daftar barang — TANPA mengorbankan riwayat.
 *
 * Yang WAJIB benar:
 *  - quantity 0 → terhapus, dan nama barang TERSALIN ke baris riwayat
 *  - quantity masih ada (serah terima sebagian) → TIDAK terhapus
 *  - quantity 0 tapi masih ada pinjaman berjalan → TIDAK terhapus (pengaman)
 *  - barang yang dipinjam (quantity > 0, available 0) → TIDAK terhapus
 *
 * Membuat & membersihkan datanya sendiri, jadi aman dijalankan berulang.
 */
import { db } from "@/db";
import { items, transactions, transactionItems } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { hapusBarangHabis } from "@/lib/item-in-use";

let lulus = 0, gagal = 0;
const cek = (nama: string, nyata: unknown, harap: unknown) => {
  const ok = JSON.stringify(nyata) === JSON.stringify(harap);
  ok ? lulus++ : gagal++;
  console.log(`  ${ok ? "OK  " : "GAGAL"} ${nama}`);
  if (!ok) console.log(`        harap: ${JSON.stringify(harap)}\n        nyata: ${JSON.stringify(nyata)}`);
};

const TAG = "UJI-HAPUS-HABIS";
const dibuatItems: number[] = [];
const dibuatTx: number[] = [];

async function buatBarang(nama: string, qty: number, avail: number) {
  const [{ id }] = await db.insert(items).values({
    name: `${TAG} ${nama}`,
    category: "Uji",
    quantity: qty,
    availableQuantity: avail,
    status: avail === 0 ? "borrowed" : "available",
  }).$returningId();
  dibuatItems.push(id);
  return id;
}

async function bersihkan() {
  if (dibuatTx.length > 0) {
    await db.delete(transactionItems).where(inArray(transactionItems.transactionId, dibuatTx));
    await db.delete(transactions).where(inArray(transactions.id, dibuatTx));
  }
  if (dibuatItems.length > 0) {
    await db.delete(items).where(inArray(items.id, dibuatItems));
  }
}

async function main() {
  await bersihkan(); // sisa jalan sebelumnya, kalau ada
  dibuatItems.length = 0; dibuatTx.length = 0;

  // ── T1: habis total + punya riwayat → terhapus, nama tersalin ──
  const t1 = await buatBarang("habis", 0, 0);
  const [{ id: tx1 }] = await db.insert(transactions).values({
    borrowerName: "Uji Riwayat",
    itemId: t1,
    quantity: 1,
    status: "returned",
    expectedReturnDate: new Date(),
    actualReturnDate: new Date(),
  }).$returningId();
  dibuatTx.push(tx1);
  await db.insert(transactionItems).values({
    transactionId: tx1, itemId: t1, quantity: 1, itemName: null, // sengaja kosong
  });

  const terhapus = await hapusBarangHabis([t1]);
  cek("T1 quantity=0 → terhapus", terhapus.includes(t1), true);

  const [masihAda] = await db.select().from(items).where(eq(items.id, t1));
  cek("T1 sudah tidak ada di daftar barang", masihAda ?? null, null);

  const [riwayat1] = await db.select().from(transactionItems).where(eq(transactionItems.itemId, t1));
  cek("T1 nama tersalin ke riwayat (riwayat tidak kosong)",
    riwayat1?.itemName, `${TAG} habis`);

  // ── T2: serah terima sebagian → TIDAK terhapus ──
  const t2 = await buatBarang("sebagian", 1, 1);
  const terhapus2 = await hapusBarangHabis([t2]);
  cek("T2 quantity>0 (sisa sebagian) → TIDAK terhapus", terhapus2, []);
  const [adaT2] = await db.select().from(items).where(eq(items.id, t2));
  cek("T2 masih ada di daftar barang", adaT2?.quantity, 1);

  // ── T3: quantity 0 tapi masih ada pinjaman berjalan → ditahan ──
  const t3 = await buatBarang("ditahan", 0, 0);
  const [{ id: tx3 }] = await db.insert(transactions).values({
    borrowerName: "Uji Pinjam Aktif",
    itemId: t3,
    quantity: 1,
    status: "active",
    expectedReturnDate: new Date(Date.now() + 86400000),
  }).$returningId();
  dibuatTx.push(tx3);
  await db.insert(transactionItems).values({
    transactionId: tx3, itemId: t3, quantity: 1, itemName: `${TAG} ditahan`,
  });

  const terhapus3 = await hapusBarangHabis([t3]);
  cek("T3 masih dipinjam → penghapusan DITAHAN", terhapus3, []);
  const [adaT3] = await db.select().from(items).where(eq(items.id, t3));
  cek("T3 masih ada (pengaman bekerja)", adaT3?.id, t3);

  // ── T4: dipinjam sebagian (quantity>0, available=0) → TIDAK terhapus ──
  const t4 = await buatBarang("dipinjam", 3, 0);
  const terhapus4 = await hapusBarangHabis([t4]);
  cek("T4 dipinjam semua (quantity=3, tersedia=0) → TIDAK terhapus", terhapus4, []);

  // ── T5: masukan kosong / bukan barang habis → tidak ada efek samping ──
  cek("T5 daftar kosong → tidak menghapus apa pun", await hapusBarangHabis([]), []);
  cek("T5 id ngawur → tidak menghapus apa pun", await hapusBarangHabis([-1, 0, NaN, 1.5]), []);

  // ── T6: sekali panggil banyak barang → hanya yang habis terhapus ──
  const t6a = await buatBarang("borongan-habis", 0, 0);
  const t6b = await buatBarang("borongan-sisa", 2, 2);
  const hasil6 = await hapusBarangHabis([t6a, t6b]);
  cek("T6 campuran → hanya yang habis terhapus", hasil6, [t6a]);

  await bersihkan();
  console.log(`\n  lulus=${lulus} gagal=${gagal}`);
  process.exit(gagal ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await bersihkan().catch(() => {});
  process.exit(1);
});
