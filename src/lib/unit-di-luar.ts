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
  unit: string | null;
  diserahkan: number;
  kembali: number;
  diLuar: number;
};

/** Satu barang (atau semua kalau itemId kosong) beserta sisa unit di luar.
 *  `batasUnit` menyaring menurut unit pemilik barang — null = tanpa batasan
 *  (superadmin), array kosong = tak melihat apa pun (admin tanpa unit). */
export async function unitDiLuar(itemId?: number, batasUnit?: string[] | null): Promise<UnitDiLuar[]> {
  const syarat: any[] = [];
  if (itemId && Number.isInteger(itemId)) syarat.push(sql`i.id = ${itemId}`);
  if (batasUnit) {
    syarat.push(batasUnit.length > 0 ? sql`i.unit IN (${sql.join(batasUnit.map((u) => sql`${u}`), sql`, `)})` : sql`1 = 0`);
  }
  const filter = syarat.length > 0 ? sql`WHERE ${sql.join(syarat, sql` AND `)}` : sql``;

  const rows = await db.execute(sql`
    SELECT i.id AS itemId,
           i.item_code AS itemCode,
           i.name AS itemName,
           i.unit AS unit,
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
      unit: r.unit ?? null,
      diserahkan: Number(r.diserahkan) || 0,
      kembali: Number(r.kembali) || 0,
      diLuar: (Number(r.diserahkan) || 0) - (Number(r.kembali) || 0),
    }))
    .filter((r) => r.diLuar > 0);
}
