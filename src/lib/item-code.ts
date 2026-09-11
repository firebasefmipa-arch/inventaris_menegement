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

/** Nomor urut berikutnya untuk prefix + tahun tertentu (= tertinggi + 1). */
export async function nextSequence(prefix: string, year: number, offset = 0) {
  const rows = await db
    .select({ code: items.itemCode })
    .from(items)
    .where(like(items.itemCode, `FMIPA-${prefix}-${year}-%`));

  const seqs = rows
    .map((r) => parseInt(r.code!.slice(`FMIPA-${prefix}-${year}-`.length), 10))
    .filter((n) => !isNaN(n));

  return (seqs.length > 0 ? Math.max(...seqs) : 0) + 1 + offset;
}

/** Kode barang lengkap untuk satu lokasi. */
export function formatCode(prefix: string, year: number, seq: number) {
  return `FMIPA-${prefix}-${year}-${String(seq).padStart(3, "0")}`;
}

/**
 * Buat kode barang otomatis: FMIPA-<KODE LOKASI>-<TAHUN>-<URUT>
 * Urut per LOKASI per TAHUN, tahun = tahun berjalan.
 * Kode dari klien SELALU diabaikan (dipanggil dari server saja).
 */
export async function generateItemCode(rawLocation: string | null | undefined) {
  const { prefix, location } = await resolvePrefix(rawLocation);
  const year = new Date().getFullYear();
  const seq = await nextSequence(prefix, year);
  return { code: formatCode(prefix, year, seq), location };
}
