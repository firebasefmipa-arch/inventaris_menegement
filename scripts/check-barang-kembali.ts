/**
 * Penjaga fitur PENGEMBALIAN barang (Bagian C).
 *
 * Menguji aturan yang gampang rusak diam-diam:
 *   R1. "sedang di luar" = Σ diserahkan (serah terima SELESAI) − Σ dikembalikan
 *   R2. serah terima DITOLAK tidak dihitung sebagai keluar
 *   R3. stok NAMBAH saat dikembalikan (bukan ditimpa ke angka tertentu)
 *   R4. pengembalian bertahap: 2 keluar, kembali 1 lalu 1 → sisa 0
 *   R5. tak boleh mengembalikan lebih banyak daripada yang di luar
 *   R6. barang stok 0 tetap bisa dikembalikan (kode masih ketemu)
 *   R7. kode barang unik — satu kode satu barang
 *
 * Jalankan: npm run check:kembali
 *
 * CATATAN: skrip ini memakai data DB NYATA dan membersihkan jejaknya sendiri.
 * Jangan dijalankan bersamaan dengan uji lain.
 */
import { db } from "@/db";
import { items, handovers, handoverItems, itemReturns } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { unitDiLuar } from "@/lib/unit-di-luar";
import { catatPengembalian } from "@/lib/pengembalian";

let lulus = 0;
let gagal = 0;
function cek(nama: string, kondisi: boolean, info = "") {
  if (kondisi) { lulus++; console.log(`  lulus  ${nama}`); }
  else { gagal++; console.log(`  GAGAL  ${nama}${info ? ` — ${info}` : ""}`); }
}

const TANDA = "ZZ-UJI-KEMBALI";
const KODE = "FMIPA-UJI-KEMBALI-001";

async function bersihkan() {
  const lama = await db.select().from(items).where(eq(items.itemCode, KODE));
  const ids = lama.map((i) => i.id);
  if (ids.length) {
    await db.delete(itemReturns).where(inArray(itemReturns.itemId, ids));
    const hvs = await db.select().from(handoverItems).where(inArray(handoverItems.itemId, ids));
    const hvIds = [...new Set(hvs.map((h) => h.handoverId))];
    await db.delete(handoverItems).where(inArray(handoverItems.itemId, ids));
    if (hvIds.length) await db.delete(handovers).where(inArray(handovers.id, hvIds));
    await db.delete(items).where(inArray(items.id, ids));
  }
}

async function main() {
  console.log("check-barang-kembali — aturan pengembalian\n");
  await bersihkan();

  // ── Siapkan barang uji: 3 unit, item_code dikenal ──
  const [{ id: itemId }] = await db.insert(items).values({
    name: `${TANDA} Mikroskop`,
    category: "Elektronik",
    quantity: 3,
    availableQuantity: 3,
    itemCode: KODE,
    location: "Lab TI",
  }).$returningId();

  // ── R1/R2: serah terima ditolak TIDAK dihitung keluar ──
  const [{ id: hvTolak }] = await db.insert(handovers).values({
    receiverName: `${TANDA} Ditolak`,
    department: "TI",
    status: "rejected",
  }).$returningId();
  await db.insert(handoverItems).values({ handoverId: hvTolak, itemId, quantity: 1 });

  let dl = await unitDiLuar(itemId);
  cek("R2 serah terima ditolak tidak dihitung keluar", (dl[0]?.diLuar ?? 0) === 0,
      `diLuar=${dl[0]?.diLuar ?? 0}`);

  // ── R1: serah terima SELESAI 2 unit → 2 di luar ──
  const [{ id: hvSelesai }] = await db.insert(handovers).values({
    receiverName: `${TANDA} Selesai`,
    department: "TI",
    status: "completed",
  }).$returningId();
  await db.insert(handoverItems).values({ handoverId: hvSelesai, itemId, quantity: 2 });

  dl = await unitDiLuar(itemId);
  cek("R1 diserahkan 2 → sedang di luar 2", (dl[0]?.diLuar ?? 0) === 2,
      `diLuar=${dl[0]?.diLuar ?? 0}`);

  // ── R4: pengembalian bertahap — kembali 1, sisanya 1.
  // Lewat fungsi ASLI (catatPengembalian), bukan INSERT langsung — supaya
  // stok ikut naik persis seperti saat admin menekan Simpan.
  const hasil1 = await catatPengembalian({
    itemCode: KODE, quantity: 1, returnedBy: `${TANDA} Peminjam`, notes: "tahap 1",
  });
  cek("R4 pengembalian lewat fungsi asli berhasil", hasil1.ok, hasil1.ok ? "" : hasil1.error);
  cek("R4 pesan menyebut sisa yang masih di luar",
      hasil1.ok && hasil1.masihDiLuar === 1,
      hasil1.ok ? `masihDiLuar=${hasil1.masihDiLuar}` : "");

  dl = await unitDiLuar(itemId);
  cek("R4 kembali 1 dari 2 → sisa 1 di luar", (dl[0]?.diLuar ?? 0) === 1,
      `diLuar=${dl[0]?.diLuar ?? 0}`);

  // ── R3: stok NAMBAH, bukan ditimpa ──
  const [barang] = await db.select().from(items).where(eq(items.id, itemId));
  cek("R3 stok bertambah dari hasil pengembalian", barang.quantity === 4,
      `quantity=${barang.quantity} (harusnya 4: 3 asli + 1 kembali)`);
  cek("R3 stok tersedia ikut bertambah", barang.availableQuantity === 4,
      `available=${barang.availableQuantity}`);

  // ── R5: menolak jumlah melebihi yang di luar ──
  const lebih = await catatPengembalian({
    itemCode: KODE, quantity: 5, returnedBy: `${TANDA} Peminjam`,
  });
  cek("R5 jumlah melebihi yang di luar DITOLAK", !lebih.ok && lebih.status === 400,
      lebih.ok ? "diterima (salah)" : lebih.error);
  const [stlhTolak] = await db.select().from(items).where(eq(items.id, itemId));
  cek("R5 stok TIDAK berubah setelah penolakan", stlhTolak.quantity === 4,
      `quantity=${stlhTolak.quantity}`);

  // ── R8: kode salah ditolak ──
  const kodeSalah = await catatPengembalian({
    itemCode: "FMIPA-TIDAK-ADA-999", quantity: 1, returnedBy: `${TANDA}`,
  });
  cek("R8 kode tak dikenal DITOLAK (404)", !kodeSalah.ok && kodeSalah.status === 404,
      kodeSalah.ok ? "diterima (salah)" : "");

  // ── R9: jumlah bukan bilangan bulat / nol ditolak ──
  const nol = await catatPengembalian({ itemCode: KODE, quantity: 0, returnedBy: `${TANDA}` });
  cek("R9 jumlah 0 DITOLAK", !nol.ok && nol.status === 400, nol.ok ? "diterima (salah)" : "");
  const pecahan = await catatPengembalian({ itemCode: KODE, quantity: 1.5, returnedBy: `${TANDA}` });
  cek("R9 jumlah 1.5 DITOLAK", !pecahan.ok && pecahan.status === 400, pecahan.ok ? "diterima (salah)" : "");
  const tanpaNama = await catatPengembalian({ itemCode: KODE, quantity: 1, returnedBy: "  " });
  cek("R9 tanpa nama pengembali DITOLAK", !tanpaNama.ok && tanpaNama.status === 400,
      tanpaNama.ok ? "diterima (salah)" : "");

  // ── R4 lanjutan: kembali 1 lagi → sisa 0 ──
  const hasil2 = await catatPengembalian({
    itemCode: KODE, quantity: 1, returnedBy: `${TANDA} Peminjam`, notes: "tahap 2",
  });
  cek("R4 pengembalian tahap 2 berhasil", hasil2.ok, hasil2.ok ? "" : hasil2.error);
  dl = await unitDiLuar(itemId);
  cek("R4 semua kembali → 0 di luar (baris hilang dari daftar)", dl.length === 0,
      `baris=${dl.length}`);
  const [barang2] = await db.select().from(items).where(eq(items.id, itemId));
  cek("R4 stok akhir 5 (3 asli + 2 kembali)", barang2.quantity === 5,
      `quantity=${barang2.quantity}`);

  // ── R5b: tak ada lagi yang bisa dikembalikan ──
  const habis = await catatPengembalian({ itemCode: KODE, quantity: 1, returnedBy: `${TANDA}` });
  cek("R5b diLuar=0 → pengembalian DITOLAK", !habis.ok && habis.status === 400,
      habis.ok ? "diterima (salah)" : habis.error);

  // ── R6: barang stok 0 tetap ketemu lewat kode ──
  const [{ id: hv3 }] = await db.insert(handovers).values({
    receiverName: `${TANDA} Selesai 3`, department: "TI", status: "completed",
  }).$returningId();
  await db.insert(handoverItems).values({ handoverId: hv3, itemId, quantity: 3 });
  await db.update(items).set({ quantity: 0, availableQuantity: 0 }).where(eq(items.id, itemId));
  const [stokNol] = await db.select().from(items).where(eq(items.itemCode, KODE)).limit(1);
  cek("R6 barang stok 0 MASIH ketemu lewat kode (bisa dikembalikan)", !!stokNol,
      stokNol ? "ketemu" : "HILANG — pengembalian mustahil");
  const dlNol = await unitDiLuar(itemId);
  cek("R6 barang stok 0 tetap terhitung punya unit di luar", (dlNol[0]?.diLuar ?? 0) === 3,
      `diLuar=${dlNol[0]?.diLuar ?? 0}`);

  // ── R6b: barang stok 0 dikembalikan → stok naik, muncul lagi di daftar ──
  const dariNol = await catatPengembalian({
    itemCode: KODE, quantity: 2, returnedBy: `${TANDA} Peminjam`,
  });
  cek("R6b barang stok 0 bisa dikembalikan", dariNol.ok, dariNol.ok ? "" : dariNol.error);
  cek("R6b stok naik dari 0 jadi 2 (muncul lagi di daftar)",
      dariNol.ok && dariNol.stokBaru === 2, dariNol.ok ? `stokBaru=${dariNol.stokBaru}` : "");

  // ── R7: kode barang unik ──
  const semuaKode = await db.select({ code: items.itemCode }).from(items);
  const terisi = semuaKode.filter((k) => k.code).map((k) => k.code);
  cek("R7 kode barang unik (tak ada duplikat)",
      new Set(terisi).size === terisi.length,
      `total=${terisi.length}, unik=${new Set(terisi).size}`);

  await bersihkan();
  console.log(`\n  lulus=${lulus} gagal=${gagal}`);
  process.exit(gagal > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("ERROR:", e);
  await bersihkan().catch(() => {});
  process.exit(1);
});
