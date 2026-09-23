import { db } from "@/db";
import { sql } from "drizzle-orm";

/**
 * Cek apakah barang sedang "dipegang" — dirujuk transaksi peminjaman yang belum
 * selesai atau serah terima yang belum disetujui.
 *
 * Dipakai sebelum menghapus barang: menghapus barang yang unitnya masih di
 * tangan orang membuat transaksinya menggantung dan pengembaliannya mustahil.
 *
 * TIDAK dipakai untuk barang yang hanya berstatus stok 0 karena habis
 * diserahterimakan (transaksinya sudah `completed`/`returned`) — barang begitu
 * memang boleh dihapus.
 */
const STATUS_PINJAM_AKTIF = ["pending_signature", "pending_approval", "active", "overdue"];
const STATUS_SERAH_AKTIF = ["pending_signature", "pending_approval"];

export type BarangDipakai = {
  itemId: number;
  kode: string;
  jenis: "peminjaman" | "serah terima";
};

/** Daftar barang yang sedang dipegang, beserta nomor transaksinya. */
export async function barangSedangDipakai(itemIds: number[]): Promise<BarangDipakai[]> {
  const unik = [...new Set(itemIds)].filter((n) => Number.isInteger(n) && n > 0);
  if (unik.length === 0) return [];

  // Aman: sudah disaring sebagai bilangan bulat positif di atas.
  const daftar = unik.join(",");
  const inList = (arr: string[]) => arr.map((s) => `'${s}'`).join(",");

  const rows = await db.execute(sql.raw(`
    SELECT DISTINCT ti.item_id AS itemId, CONCAT('PB-', LPAD(t.id, 4, '0')) AS kode, 'peminjaman' AS jenis
      FROM transaction_items ti
      JOIN transactions t ON t.id = ti.transaction_id
     WHERE ti.item_id IN (${daftar}) AND t.status IN (${inList(STATUS_PINJAM_AKTIF)})
    UNION
    SELECT DISTINCT t.item_id, CONCAT('PB-', LPAD(t.id, 4, '0')), 'peminjaman'
      FROM transactions t
     WHERE t.item_id IN (${daftar}) AND t.status IN (${inList(STATUS_PINJAM_AKTIF)})
    UNION
    SELECT DISTINCT hi.item_id, CONCAT('ST-', LPAD(h.id, 4, '0')), 'serah terima'
      FROM handover_items hi
      JOIN handovers h ON h.id = hi.handover_id
     WHERE hi.item_id IN (${daftar}) AND h.status IN (${inList(STATUS_SERAH_AKTIF)})
  `));

  const data = Array.isArray(rows) ? (rows[0] as unknown as BarangDipakai[]) : [];
  return Array.isArray(data) ? data : [];
}

/** Susun pesan penolakan yang menyebut barang + nomor transaksinya. */
export function pesanBarangDipakai(dipakai: BarangDipakai[]): string {
  const rinci = dipakai
    .map((d) => `${d.kode} (${d.jenis})`)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(", ");
  return `Barang tidak bisa dihapus karena masih dipegang: ${rinci}. Selesaikan atau tolak transaksinya dulu.`;
}
