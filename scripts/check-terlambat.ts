/**
 * Penjaga SATU definisi "Terlambat".
 *
 * Dulu ada tiga definisi berbeda (kartu pakai NOW() UTC + status active,
 * daftar pakai kalender WIB, klien pakai hariTerlambat) dan ketiganya tidak
 * sepakat. Uji ini memastikan semua sumber memberi angka yang SAMA.
 */
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { count, eq, and, sql } from "drizzle-orm";
import { sqlTerlambat } from "@/lib/tanggal";
import { hariTerlambat } from "@/lib/tanggal";

let lulus = 0, gagal = 0;
const cek = (nama: string, nyata: unknown, harap: unknown) => {
  const ok = JSON.stringify(nyata) === JSON.stringify(harap);
  ok ? lulus++ : gagal++;
  console.log(`  ${ok ? "OK  " : "GAGAL"} ${nama}`);
  if (!ok) console.log(`        harap: ${JSON.stringify(harap)}\n        nyata: ${JSON.stringify(nyata)}`);
};

async function main() {
  // 1. SQL yang dihasilkan harus valid & bisa dijalankan (bukan cuma string).
  const [sqlCount] = await db
    .select({ n: count(sql`CASE WHEN ${sqlTerlambat()} THEN 1 END`) })
    .from(transactions);
  console.log(`  (SQL kartu berjalan, hasil = ${sqlCount.n})`);
  lulus++;

  // 2. Daftar (query) — jumlah baris.
  const barisSql = await db.select().from(transactions).where(sqlTerlambat());

  // 3. Klien (hariTerlambat) — dihitung di JS dari data yang sama.
  const semua = await db.select().from(transactions);
  const barisKlien = semua.filter(
    (t) => hariTerlambat(t.expectedReturnDate, t.actualReturnDate ?? undefined) > 0
  );

  cek("jumlah kartu == jumlah daftar (SQL)", Number(sqlCount.n), barisSql.length);
  cek("jumlah daftar (SQL) == jumlah klien (JS)", barisSql.length, barisKlien.length);
  cek("himpunan id sama", barisSql.map((t) => t.id).sort((a, b) => a - b),
      barisKlien.map((t) => t.id).sort((a, b) => a - b));

  // 4. Kasus tepi: tenggat HARI INI → BELUM telat (kalender WIB).
  const hariIni = hariTerlambat(new Date(), new Date());
  cek("tenggat hari ini → 0 hari (belum telat)", hariIni, 0);
  cek("tenggat kemarin → 1 hari", hariTerlambat(new Date(Date.now() - 86400000), new Date()), 1);
  cek("tenggat besok → 0 hari", hariTerlambat(new Date(Date.now() + 86400000), new Date()), 0);

  console.log(`\n  lulus=${lulus} gagal=${gagal}`);
  process.exit(gagal ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
