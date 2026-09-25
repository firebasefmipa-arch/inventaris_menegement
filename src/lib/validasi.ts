/**
 * Pemeriksa masukan sebelum dikirim ke database.
 *
 * Kenapa perlu: kalau teks lebih panjang dari lebar kolomnya, MySQL membalas
 * error dan permintaan berakhir sebagai "500 Terjadi kesalahan" — pemakai
 * tidak tahu bagian mana yang salah, hanya tahu gagal simpan. Diperiksa di
 * sini supaya pesannya jelas dan bisa diperbaiki sendiri.
 *
 * Dipakai bersama oleh tambah barang (`/api/items`) dan edit barang
 * (`/api/items/[id]`). Lebarnya disamakan dengan kolom di `src/db/schema.ts`.
 */

/** Kembalikan pesan kalau ada teks yang kepanjangan; `null` kalau semua aman. */
export function cekPanjangTeks(
  bidang: Record<string, [unknown, number]>
): string | null {
  for (const [nama, [nilai, batas]] of Object.entries(bidang)) {
    if (nilai === undefined || nilai === null) continue;
    const panjang = String(nilai).trim().length;
    if (panjang > batas) {
      return `${nama} terlalu panjang — maksimal ${batas} karakter, yang diisi ${panjang}.`;
    }
  }
  return null;
}

/**
 * Batas atas jumlah barang.
 *
 * Kenapa ada: kolom `quantity` bertipe `int` (maks 2.147.483.647). Tanpa batas,
 * nilai seperti 999999999 tersimpan apa adanya, lalu penambahan stok
 * berikutnya (pengembalian) bisa melewati batas kolom dan gagal simpan.
 * Satu juta unit jauh lebih dari cukup untuk inventaris satu fakultas.
 */
export const JUMLAH_MAKS = 1_000_000;

/** Kembalikan pesan kalau jumlah tidak wajar; `null` kalau aman. */
export function pesanJumlahTidakValid(nilai: unknown): string | null {
  const n = Number(nilai);
  if (!Number.isInteger(n) || n < 1) {
    return "Jumlah minimal 1 unit dan harus bilangan bulat.";
  }
  if (n > JUMLAH_MAKS) {
    return `Jumlah maksimal ${JUMLAH_MAKS.toLocaleString("id-ID")} unit.`;
  }
  return null;
}
