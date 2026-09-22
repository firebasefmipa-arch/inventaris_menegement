import { db } from "@/db";
import { items } from "@/db/schema";
import { sql, inArray } from "drizzle-orm";

/**
 * Snapshot identitas barang untuk baris riwayat (transaction_items /
 * handover_items) — LAPIS CADANGAN.
 *
 * Aturan main:
 * - Riwayat & dokumen selalu baca data master (live). Admin membetulkan nama
 *   barang -> riwayat ikut benar sendiri, dokumen ikut saat di-regenerate.
 * - Snapshot hanya dipakai kalau barangnya SUDAH DIHAPUS dari tabel items,
 *   supaya riwayat lama tetap menampilkan nama & data barang.
 *
 * Karena itu snapshot disegarkan tepat SEBELUM barang dihapus
 * (snapshotSebelumHapus), bukan saat transaksi dibuat.
 */
export type ItemSnapshot = {
  itemName: string | null;
  itemCode: string | null;
  itemInventoryNumber: string | null;
};

/** Snapshot untuk banyak barang sekaligus (satu query, bukan N query). */
export async function snapshotItems(itemIds: number[]): Promise<Map<number, ItemSnapshot>> {
  const map = new Map<number, ItemSnapshot>();
  const unik = [...new Set(itemIds)].filter((n) => Number.isInteger(n));
  if (unik.length === 0) return map;

  const rows = await db
    .select({ id: items.id, name: items.name, itemCode: items.itemCode, inventoryNumber: items.inventoryNumber })
    .from(items)
    .where(inArray(items.id, unik));

  for (const r of rows) {
    map.set(r.id, {
      itemName: r.name,
      itemCode: r.itemCode,
      itemInventoryNumber: r.inventoryNumber,
    });
  }
  return map;
}

/**
 * Segarkan snapshot SEMUA baris riwayat yang menunjuk barang-barang ini, dengan
 * data master terakhir. Dipanggil TEPAT SEBELUM barang dihapus.
 *
 * Kenapa: riwayat yang terdampak harus tetap menampilkan nama & data barang
 * seperti kondisi terakhir sebelum dihapus — bukan nama saat transaksi dibuat
 * (yang bisa sudah usang kalau admin sempat merapikan nama barang).
 */
export async function snapshotSebelumHapus(itemIds: number[]): Promise<number> {
  const unik = [...new Set(itemIds)].filter((n) => Number.isInteger(n));
  if (unik.length === 0) return 0;

  // Aman: hanya bilangan bulat yang lolos filter di atas.
  const daftar = unik.join(",");
  let total = 0;
  for (const tabel of ["transaction_items", "handover_items"]) {
    const res = await db.execute(sql.raw(`
      UPDATE \`${tabel}\` ri
      JOIN items i ON i.id = ri.item_id
      SET ri.item_name = i.name,
          ri.item_code = i.item_code,
          ri.item_inventory_number = i.inventory_number
      WHERE ri.item_id IN (${daftar})
    `));
    total += Number((res[0] as any)?.affectedRows ?? 0);
  }
  return total;
}

/**
 * Versi SQL dari {@link namaBarang} untuk dipakai langsung di dalam select:
 * COALESCE(data master, snapshot). Data master menang; snapshot dipakai kalau
 * barangnya sudah dihapus.
 */
export function namaSql(live: unknown, snap: unknown) {
  return sql<string>`COALESCE(${live}, ${snap})`;
}

/**
 * Ambil nama tampilan: data master (live) SELALU menang, snapshot hanya
 * cadangan kalau barangnya sudah dihapus dari tabel items.
 *
 * Riwayat & dokumen mengikuti data master terbaru — kalau admin membetulkan
 * nama/salah input barang, riwayat ikut benar sendiri. Snapshot baru dipakai
 * ketika barangnya sudah tidak ada lagi (riwayat lama tetap punya nama).
 */
export function namaBarang(
  snapshot: string | null | undefined,
  live: string | null | undefined,
  fallback = "Barang"
): string {
  return live?.trim() || snapshot?.trim() || fallback;
}
