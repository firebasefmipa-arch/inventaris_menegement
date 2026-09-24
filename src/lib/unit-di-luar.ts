import { db } from "@/db";
import { sql } from "drizzle-orm";

/**
 * Berapa unit yang "sedang di luar" — sudah diserahkan tapi belum kembali.
 *
 * Dihitung dari catatan keluar-masuk, BUKAN dari angka stok:
 *   sisi keluar = handover_items pada serah terima berstatus 'completed'
 *   sisi masuk  = item_returns
 *
 * Sengaja tidak memakai (quantity − availableQuantity): rumus itu buta
 * terhadap serah terima (diserahkan 2 dari 5 → 3−3=0, padahal 2 unit di luar).
 */
export type UnitDiLuar = {
  itemId: number;
  itemCode: string | null;
  itemName: string;
  diserahkan: number;
  kembali: number;
  diLuar: number;
};

/** Satu barang (atau semua kalau itemId kosong) beserta sisa unit di luar. */
export async function unitDiLuar(itemId?: number): Promise<UnitDiLuar[]> {
  const filter = itemId && Number.isInteger(itemId) ? sql`WHERE i.id = ${itemId}` : sql``;

  const rows = await db.execute(sql`
    SELECT i.id AS itemId,
           i.item_code AS itemCode,
           i.name AS itemName,
           COALESCE(keluar.jumlah, 0) AS diserahkan,
           COALESCE(masuk.jumlah, 0)  AS kembali
      FROM items i
      LEFT JOIN (
            SELECT hi.item_id, SUM(hi.quantity) AS jumlah
              FROM handover_items hi
              JOIN handovers h ON h.id = hi.handover_id
             WHERE h.status = 'completed'
             GROUP BY hi.item_id
           ) keluar ON keluar.item_id = i.id
      LEFT JOIN (
            SELECT item_id, SUM(quantity) AS jumlah
              FROM item_returns
             GROUP BY item_id
           ) masuk ON masuk.item_id = i.id
      ${filter}
  `);

  const data = (Array.isArray(rows) ? rows[0] : rows) as unknown as any[];
  if (!Array.isArray(data)) return [];

  return data
    .map((r) => ({
      itemId: Number(r.itemId),
      itemCode: r.itemCode ?? null,
      itemName: r.itemName ?? "Barang",
      diserahkan: Number(r.diserahkan) || 0,
      kembali: Number(r.kembali) || 0,
      diLuar: (Number(r.diserahkan) || 0) - (Number(r.kembali) || 0),
    }))
    .filter((r) => r.diLuar > 0);
}
