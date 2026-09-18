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
