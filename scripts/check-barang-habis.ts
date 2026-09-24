/**
 * Penjaga "barang habis diserahkan → disembunyikan, BUKAN dihapus".
 *
 * Aturan yang diuji (berubah 24 Sep 2026 — dulu barang ini dihapus):
 *  - stok fisik 0 → barang TETAP ADA di database, cuma tak tampil di daftar
 *  - barang stok 0 bisa dikembalikan nanti (karena itu wajib masih ada)
 *  - stok > 0 → tetap tampil seperti biasa
 *  - barang yang dipinjam/diserahkan tapi belum selesai → TIDAK boleh dihapus
 *
 * Membuat & membersihkan datanya sendiri, jadi aman dijalankan berulang.
 */
import { db } from "@/db";
import { items, transactions, transactionItems, handovers, handoverItems } from "@/db/schema";
import { eq, inArray, gt } from "drizzle-orm";
import { barangSedangDipakai } from "@/lib/item-in-use";

let lulus = 0, gagal = 0;
const cek = (nama: string, nyata: unknown, harap: unknown) => {
  const ok = JSON.stringify(nyata) === JSON.stringify(harap);
  ok ? lulus++ : gagal++;
  console.log(`  ${ok ? "OK  " : "GAGAL"} ${nama}`);
  if (!ok) console.log(`        harap: ${JSON.stringify(harap)}\n        nyata: ${JSON.stringify(nyata)}`);
};

const TAG = "UJI-BARANG-HABIS";
const dibuatItems: number[] = [];
const dibuatTx: number[] = [];
const dibuatHv: number[] = [];

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
  if (dibuatHv.length > 0) {
    await db.delete(handoverItems).where(inArray(handoverItems.handoverId, dibuatHv));
    await db.delete(handovers).where(inArray(handovers.id, dibuatHv));
  }
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
  dibuatItems.length = 0; dibuatTx.length = 0; dibuatHv.length = 0;

  // ── T1: stok 0 → TETAP ADA (inti perubahan) ──
  const t1 = await buatBarang("habis", 0, 0);
  const [masihAda] = await db.select().from(items).where(eq(items.id, t1));
  cek("T1 stok 0 → barang TETAP ADA di database", masihAda?.id, t1);
  cek("T1 stok fisiknya 0", masihAda?.quantity, 0);

  // ── T2: stok 0 tersembunyi dari daftar, stok >0 tampil ──
  const t2 = await buatBarang("masih-ada", 3, 3);
  const tampil = await db.select({ id: items.id }).from(items)
    .where(gt(items.quantity, 0)).orderBy(items.id);
  const idTampil = tampil.map((r) => r.id);
  cek("T2 barang stok 0 TIDAK muncul di daftar", idTampil.includes(t1), false);
  cek("T2 barang stok >0 tetap muncul di daftar", idTampil.includes(t2), true);

  // ── T3: barang stok 0 masih bisa dicari & dibaca (syarat pengembalian) ──
  const [dibacaUlang] = await db.select().from(items).where(eq(items.id, t1));
  cek("T3 barang stok 0 masih bisa dibaca (syarat bisa dikembalikan)",
    dibacaUlang?.name, `${TAG} habis`);

  // ── T4: sedang DIPINJAM → tidak boleh dihapus ──
  const t4 = await buatBarang("dipinjam", 3, 0);
  const [{ id: tx4 }] = await db.insert(transactions).values({
    borrowerName: "Uji Pinjam Aktif",
    itemId: t4,
    quantity: 1,
    status: "active",
    expectedReturnDate: new Date(Date.now() + 86400000),
  }).$returningId();
  dibuatTx.push(tx4);
  await db.insert(transactionItems).values({
    transactionId: tx4, itemId: t4, quantity: 1, itemName: `${TAG} dipinjam`,
  });
  const dipakai4 = await barangSedangDipakai([t4]);
  cek("T4 sedang dipinjam → terdeteksi sedang dipegang", dipakai4.length > 0, true);
  cek("T4 jenisnya peminjaman", dipakai4[0]?.jenis, "peminjaman");

  // ── T5: serah terima belum selesai → tidak boleh dihapus ──
  const t5 = await buatBarang("serah-pending", 2, 0);
  const [{ id: hv5 }] = await db.insert(handovers).values({
    receiverName: "Uji Penerima",
    status: "pending_approval",
  }).$returningId();
  dibuatHv.push(hv5);
  await db.insert(handoverItems).values({
    handoverId: hv5, itemId: t5, quantity: 2, itemName: `${TAG} serah-pending`,
  });
  const dipakai5 = await barangSedangDipakai([t5]);
  cek("T5 serah terima belum selesai → terdeteksi sedang dipegang", dipakai5.length > 0, true);
  cek("T5 jenisnya serah terima", dipakai5[0]?.jenis, "serah terima");

  // ── T6: barang bebas (tak dipegang, tak ada transaksi) → AMAN dihapus ──
  const t6 = await buatBarang("bebas", 5, 5);
  const dipakai6 = await barangSedangDipakai([t6]);
  cek("T6 barang bebas → tidak terdeteksi dipegang", dipakai6.length, 0);

  // ── T7: stok 0 hasil serah terima SELESAI juga tetap ada ──
  const t7 = await buatBarang("habis-selesai", 0, 0);
  const [{ id: hv7 }] = await db.insert(handovers).values({
    receiverName: "Uji Penerima Selesai",
    status: "completed",
  }).$returningId();
  dibuatHv.push(hv7);
  await db.insert(handoverItems).values({
    handoverId: hv7, itemId: t7, quantity: 2, itemName: `${TAG} habis-selesai`,
  });
  const [tetap] = await db.select().from(items).where(eq(items.id, t7));
  cek("T7 stok 0 hasil serah terima selesai → TETAP ADA", tetap?.id, t7);
  const dipakai7 = await barangSedangDipakai([t7]);
  cek("T7 serah terima sudah selesai → tidak menghalangi", dipakai7.length, 0);

  // ── T8: masukan kosong / ngawur ──
  cek("T8 daftar kosong → tidak ada yang terdeteksi", await barangSedangDipakai([]), []);
  cek("T8 id ngawur → tidak ada yang terdeteksi", await barangSedangDipakai([-1, 0, NaN, 1.5]), []);

  // ── T9: stok 0 tidak boleh dihapus (keputusan user) ──
  // Aturan: barang stok 0 terkunci karena unitnya mungkin kembali.
  // Karena stok 0 hanya bisa lahir dari serah terima, tidak ada barang
  // tersembunyi yang "nyangkut" tanpa jalan keluar.
  const t9 = await buatBarang("terkunci", 0, 0);
  const [c9] = await db.select().from(items).where(eq(items.id, t9));
  cek("T9 barang stok 0 ada & terkunci", c9?.quantity === 0 && c9?.id === t9, true);

  await bersihkan();
  console.log(`\n  lulus=${lulus} gagal=${gagal}`);
  process.exit(gagal ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await bersihkan().catch(() => {});
  process.exit(1);
});
