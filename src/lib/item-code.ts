import { db } from "@/db";
import { items } from "@/db/schema";
import { like, sql } from "drizzle-orm";
import { buildItemCode, normalizeLocation } from "@/lib/locations";

/**
 * Tentukan prefix kode untuk sebuah lokasi + lokasi yang sudah dinormalisasi.
 * Prefix dikunci dari kode yang sudah ada agar lokasi custom tetap konsisten;
 * kalau belum ada, diturunkan dari nama lokasi.
 */
export async function resolvePrefix(rawLocation: string | null | undefined) {
  const location = normalizeLocation(rawLocation || "");

  const [existingSameLocation] = await db
    .select({ code: items.itemCode })
    .from(items)
    .where(sql`${items.location} = ${location} AND ${items.itemCode} IS NOT NULL`)
    .limit(1);

  if (existingSameLocation?.code) {
    return { prefix: existingSameLocation.code.split("-")[1], location };
  }

  const allCodes = await db
    .select({ code: items.itemCode })
    .from(items)
    .where(sql`${items.itemCode} IS NOT NULL`);

  const taken = allCodes.map((r) => r.code!.split("-")[1]).filter(Boolean);
  const prefix = buildItemCode(location, new Date().getFullYear(), 0, taken).split("-")[1];

  return { prefix, location };
}

/**
 * Nomor urut berikutnya untuk prefix + tahun tertentu.
 *
 * Diambil dari YANG TERTINGGI di antara dua sumber, lalu +1:
 *   1. `kode_terpakai` — buku register, tak pernah mundur walau barang dihapus
 *   2. `items`         — jaring pengaman kalau register tertinggal/setengah terisi
 *
 * Sengaja TIDAK hanya membaca `items`: itulah bug lamanya — barang dihapus,
 * nomornya bebas lagi, lalu diberikan ke barang lain.
 */
export async function nextSequence(prefix: string, year: number, offset = 0) {
  const pola = `FMIPA-${prefix}-${year}-%`;

  const rows = await db.execute(sql`
    SELECT GREATEST(
      (SELECT COALESCE(MAX(urut), 0) FROM kode_terpakai
        WHERE prefix = ${prefix} AND tahun = ${year}),
      (SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(item_code, '-', -1) AS UNSIGNED)), 0)
         FROM items WHERE item_code LIKE ${pola})
    ) AS maks
  `);

  const data = (Array.isArray(rows) ? rows[0] : rows) as unknown as any;
  const baris = Array.isArray(data) ? data[0] : data;
  const maks = Number(baris?.maks) || 0;

  return maks + 1 + offset;
}

/** Kode barang lengkap untuk satu lokasi. */
export function formatCode(prefix: string, year: number, seq: number) {
  return `FMIPA-${prefix}-${year}-${String(seq).padStart(3, "0")}`;
}

/** Pecah kode jadi prefix/tahun/urut. Null kalau bentuknya tak dikenal. */
export function bacaKode(kode: string): { prefix: string; tahun: number; urut: number } | null {
  const m = /^FMIPA-([A-Z0-9]+)-(\d{4})-(\d+)$/.exec(kode.trim().toUpperCase());
  if (!m) return null;
  return { prefix: m[1], tahun: Number(m[2]), urut: Number(m[3]) };
}

/**
 * Catat kode ke buku register — "nomor ini sudah terpakai, jangan dipakai lagi".
 * Idempoten: kode yang sudah tercatat dibiarkan apa adanya.
 */
export async function catatKode(
  kode: string,
  opts: { itemId?: number | null; sumber?: "barang" | "impor" | "awal" } = {}
) {
  const bagian = bacaKode(kode);
  if (!bagian) return;

  await db.execute(sql`
    INSERT IGNORE INTO kode_terpakai (kode, prefix, tahun, urut, item_id, sumber)
    VALUES (${kode}, ${bagian.prefix}, ${bagian.tahun}, ${bagian.urut},
            ${opts.itemId ?? null}, ${opts.sumber ?? "barang"})
  `);
}

/** Catat banyak kode sekaligus (dipakai impor Excel). */
export async function catatKodeMassal(
  kodeList: string[],
  sumber: "barang" | "impor" | "awal" = "impor"
) {
  const unik = [...new Set(kodeList.filter(Boolean))];
  for (const k of unik) await catatKode(k, { sumber });
}

/**
 * Buat kode barang otomatis: FMIPA-<KODE LOKASI>-<TAHUN>-<URUT>
 * Urut per LOKASI per TAHUN, tahun = tahun berjalan.
 * Kode dari klien SELALU diabaikan (dipanggil dari server saja).
 *
 * Nomornya LANGSUNG dicatat ke buku register saat dibuat, bukan menunggu
 * barangnya tersimpan — supaya nomor yang gagal terpakai pun tetap terkunci
 * (lebih aman: kelebihan satu nomor lebih baik daripada nomor dipakai dua kali).
 * Untuk membebaskan nomor yang telanjur terkunci: `npm run kode:bebas lepas <kode>`.
 */
export async function generateItemCode(rawLocation: string | null | undefined) {
  const { prefix, location } = await resolvePrefix(rawLocation);
  const year = new Date().getFullYear();
  const seq = await nextSequence(prefix, year);
  const code = formatCode(prefix, year, seq);
  await catatKode(code, { sumber: "barang" });
  return { code, location };
}
