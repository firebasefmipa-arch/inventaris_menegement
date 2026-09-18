/**
 * Tanggal & jam zona WIB (Asia/Jakarta).
 *
 * Server produksi jalan di UTC sedangkan pengguna di WIB, jadi tanggal yang
 * dilihat user bisa geser sehari (klik "Kembalikan" jam 07:00 WIB = 00:00 UTC).
 * Semua tampilan tanggal pakai helper ini supaya konsisten.
 *
 * Catatan: ini hanya untuk TAMPILAN. Nilai di DB tetap apa adanya (mysql2
 * menulis waktu UTC), dan perhitungan "terlambat" masih pakai NOW() server —
 * lihat catatan di MEMORY.md.
 */

const TZ = "Asia/Jakarta";

const fmtTanggal = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit", month: "short", year: "numeric", timeZone: TZ,
});
// Locale id-ID menulis "10.09"; ambil bagiannya lalu rangkai sendiri jadi "10:09".
const fmtJam = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ,
});

const jamMenit = (d: Date) => {
  const p = Object.fromEntries(fmtJam.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.hour}:${p.minute}`;
};

// Format ISO (YYYY-MM-DD) di zona WIB — dipakai untuk membandingkan tanggal
// kalender. fmtTanggal tidak bisa dipakai karena bulannya berbentuk "Sep".
const fmtISO = new Intl.DateTimeFormat("en-CA", {
  year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ,
});

/** "18 Sep 2026" */
export function formatTanggalWIB(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return isNaN(d.getTime()) ? "-" : fmtTanggal.format(d);
}

/** "18 Sep 2026, 10:09" */
export function formatTanggalJamWIB(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return isNaN(d.getTime()) ? "-" : `${fmtTanggal.format(d)}, ${jamMenit(d)}`;
}

/**
 * Berapa hari TERLAMBAT mengembalikan (kalender WIB), 0 = tidak telat.
 *
 * "Tanggal kembali" (expected_return_date) jamnya selalu 00:00, jadi
 * membandingkan jam mentah bikin salah: tenggat 14 Sep 00:00 vs kembali
 * 14 Sep 10:00 -> terbaca telat padahal masih hari yang sama. Karena itu
 * yang dibandingkan TANGGAL kalender WIB, bukan jam.
 *
 * Dipakai untuk badge "Terlambat" pada transaksi yang sudah dikembalikan
 * (lewat tanggal kembali) maupun yang masih dipinjam (dibandingkan hari ini).
 */
export function hariTerlambat(
  tenggat: Date | string | null | undefined,
  dikembalikan: Date | string | null | undefined = new Date()
): number {
  if (!tenggat || !dikembalikan) return 0;
  const ke = (v: Date | string) => {
    const d = typeof v === "string" ? new Date(v) : v;
    if (isNaN(d.getTime())) return null;
    const [y, m, day] = fmtISO.format(d).split("-").map(Number);
    return Date.UTC(y, m - 1, day);
  };
  const a = ke(tenggat);
  const b = ke(dikembalikan);
  if (a === null || b === null) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}
