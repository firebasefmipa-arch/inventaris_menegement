/**
 * Aturan kondisi barang — satu tempat, dipakai semua pintu masuk.
 *
 * Hanya barang berkondisi "Baik" yang boleh dipinjam, diserahterimakan, dan
 * terlihat oleh user. Selain itu (Rusak, atau belum diisi) barang disembunyikan
 * dari user dan kartunya diberi tanda merah di sisi admin.
 *
 * ── Kenapa "Rusak" condong ke sembunyi, bukan ke tampil ──
 * Salah tebak jadi "Rusak" → admin lihat, ubah ke Baik, satu klik.
 * Salah tebak jadi "Baik"  → barang cacat sampai ke tangan user.
 * Jadi kalau ragu, selalu pilih sembunyi.
 */

export const KONDISI_BAIK = "Baik";
export const KONDISI_RUSAK = "Rusak";

/**
 * Kata penanda kerusakan — diperiksa LEBIH DULU.
 *
 * Urutan ini yang penting: "Kurang Baik" mengandung kata "baik", jadi kalau
 * sisi baik diperiksa duluan, barang cacat akan lolos jadi "Baik" dan bisa
 * dipinjam. Semua yang diawali "kurang"/"tidak" adalah pernyataan negatif.
 */
const TANDA_BURUK = [
  "rusak", "kurang", "tidak", "buruk", "jelek", "cacat", "pecah", "patah",
  "mati", "hilang", "kendor", "macet", "error", "retak", "bocor", "seret",
];

const TANDA_BAIK = ["baik", "bagus", "normal", "mulus", "layak", "berfungsi"];

/**
 * Tebak kondisi dari teks bebas. `null` berarti tak dikenali → "data tidak
 * lengkap" (tetap disembunyikan dari user, tapi admin melihat tandanya).
 */
export function rapikanKondisi(teks: string | null | undefined): string | null {
  const t = String(teks ?? "").trim().toLowerCase();
  if (!t) return null;
  if (TANDA_BURUK.some((k) => t.includes(k))) return KONDISI_RUSAK;
  if (TANDA_BAIK.some((k) => t.includes(k))) return KONDISI_BAIK;
  return null;
}

/** Hanya kondisi ini yang boleh jalan. Semua sisanya: sembunyi. */
export function bolehJalan(kondisi: string | null | undefined): boolean {
  return String(kondisi ?? "").trim() === KONDISI_BAIK;
}

/** Barang belum pernah diperiksa kondisinya (null, "", atau teks tak dikenali). */
export function dataTidakLengkap(kondisi: string | null | undefined): boolean {
  return rapikanKondisi(kondisi) === null;
}

/** Barang pernah rusak tapi sekarang sudah Baik → riwayatnya perlu diketahui admin. */
export function pernahRusak(
  kondisi: string | null | undefined,
  catatan: string | null | undefined
): boolean {
  return bolehJalan(kondisi) && !!String(catatan ?? "").trim();
}

/**
 * Tambahkan catatan kerusakan baru ke riwayat.
 *
 * Catatan TIDAK PERNAH dihapus saat barang kembali ke "Baik" — itulah yang
 * menjadikannya log kerusakan. Ditambahi, bukan ditimpa, supaya kerusakan
 * berulang tidak saling menghapus.
 */
export function tambahCatatan(
  lama: string | null | undefined,
  baru: string,
  tanggal: Date = new Date()
): string | null {
  const isi = baru.trim();
  if (!isi) return (lama ?? "").trim() || null;

  const tgl = tanggal.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const entri = `${isi} (${tgl})`;

  const sebelumnya = String(lama ?? "").trim();
  if (sebelumnya.includes(entri)) return sebelumnya;

  let parts = sebelumnya ? [...sebelumnya.split(" • "), entri] : [entri];
  // Kolom di basis data hanya 255 karakter — buang yang paling lama dulu,
  // kejadian terbaru lebih penting daripada riwayat jauh.
  while (parts.join(" • ").length > 255 && parts.length > 1) parts.shift();
  return parts.join(" • ").slice(-255);
}
