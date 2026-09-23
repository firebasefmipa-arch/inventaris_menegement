import { db } from "@/db";
import { items } from "@/db/schema";
import { sql, and, eq, inArray } from "drizzle-orm";
import { snapshotSebelumHapus } from "@/lib/item-snapshot";

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

/**
 * Hapus barang yang stok FISIKNYA habis — dipanggil otomatis setelah serah
 * terima selesai.
 *
 * Kenapa pakai `quantity` dan bukan `availableQuantity`: barang yang sedang
 * DIPINJAM juga bisa punya `availableQuantity` 0, padahal barangnya bakal
 * kembali. Yang benar-benar habis cuma karena diserahkan, dan itu terlihat dari
 * `quantity` (stok fisik) yang jadi 0.
 *
 * Hanya menerima id yang memang sudah bernilai 0 di database, jadi pemanggil
 * boleh menyodorkan seluruh isi keranjang serah terima tanpa menyaring dulu.
 *
 * Pengaman: kalau ada pinjaman yang belum selesai, penghapusan DITAHAN —
 * barangnya hilang berarti pengembaliannya mustahil. Secara normal ini tidak
 * pernah terjadi (menyerahkan seluruh stok tidak mungkin selagi ada unit di
 * tangan peminjam), tapi penjagaan ini gratis karena memakai jalur hapus yang
 * sama dengan tombol hapus manual.
 *
 * Urutan penting: salin identitas ke baris riwayat DULU, baru hapus — kalau
 * kebalik, nama barang di riwayat jadi kosong.
 *
 * @returns id barang yang benar-benar terhapus.
 */
export async function hapusBarangHabis(itemIds: number[]): Promise<number[]> {
  const unik = [...new Set(itemIds)].filter((n) => Number.isInteger(n) && n > 0);
  if (unik.length === 0) return [];

  const habis = await db
    .select({ id: items.id })
    .from(items)
    .where(and(inArray(items.id, unik), eq(items.quantity, 0)));
  if (habis.length === 0) return [];

  const ids = habis.map((h) => h.id);

  const dipakai = await barangSedangDipakai(ids);
  if (dipakai.length > 0) return [];

  await snapshotSebelumHapus(ids);
  await db.delete(items).where(inArray(items.id, ids));
  return ids;
}

/** Susun pesan penolakan yang menyebut barang + nomor transaksinya. */
export function pesanBarangDipakai(dipakai: BarangDipakai[]): string {
  const rinci = dipakai
    .map((d) => `${d.kode} (${d.jenis})`)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(", ");
  return `Barang tidak bisa dihapus karena masih dipegang: ${rinci}. Selesaikan atau tolak transaksinya dulu.`;
}
