// Sumber tunggal daftar Lokasi barang FMIPA UII + kode penomoran barang.
// Kode barang: FMIPA-<KODE LOKASI>-<TAHUN>-<URUT>  (urut per lokasi per tahun)

export const LOCATION_CODES: Record<string, string> = {
  "Dekanat Fakultas MIPA": "DEK",
  "Divisi Administrasi Akademik": "AKA",
  "Divisi Administrasi Keuangan": "KEU",
  "Divisi Administrasi Umum dan Rumah Tangga": "RT",
  "Divisi Teknologi Informasi": "TI",
  "Program Studi Statistika Program Sarjana": "STA",
  "Program Studi Kimia Program Sarjana": "KIM",
  "Program Studi Farmasi Program Sarjana": "FAR",
  "Program Studi Pendidikan Kimia Program Sarjana": "PKA",
  "Program Studi Analisis Kimia Program Diploma": "ANK",
  "Program Studi Pendidikan Profesi Apoteker": "APT",
  "Program Studi Statistika Program Magister": "MSTA",
  "Program Studi Kimia Program Magister": "MKIM",
  "Program Studi Farmasi Program Magister": "MFAR",
  "Program Studi Farmasi Program Doktor": "DFAR",
  "Laboratorium Terpadu UII": "LTU",
  "Laboratorium Farmasi (Lab Terpadu)": "LF",
  "Laboratorium Kimia (Lab Terpadu)": "LK",
  "Laboratorium Statistika (Lab Terpadu)": "LS",
  "Laboratorium Riset Kimia": "LRK",
  "Gedung OSCE": "OSCE",
  "Gedung CEOS": "CEOS",
  "Gedung Praklinik (Lab Hewan)": "PRK",
  "FMIPA UII": "FMIPA",
  "Universitas Islam Indonesia": "UII",
};

export const LOCATION_OPTIONS = Object.keys(LOCATION_CODES);

export const CUSTOM_LOCATION_VALUE = "Lainnya (isi manual)";

// Akronim yang kapitalisasinya jangan diubah saat auto-correct.
const ACRONYMS = new Set([
  "TI", "IT", "UII", "FMIPA", "OSCE", "CEOS", "MIPA", "D3", "S1", "S2", "S3", "SN",
]);

/**
 * Rapikan nama lokasi:
 * 1. Kalau cocok dengan opsi resmi (beda besar-kecil saja) → pakai bentuk resmi.
 * 2. Kalau baru → Title Case, akronim tetap huruf besar.
 */
export function normalizeLocation(raw: string): string {
  const input = (raw || "").trim().replace(/\s+/g, " ");
  if (!input) return "";

  const official = LOCATION_OPTIONS.find(
    (o) => o.toLowerCase() === input.toLowerCase()
  );
  if (official) return official;

  return input
    .split(" ")
    .map((word) => {
      const upper = word.toUpperCase();
      if (ACRONYMS.has(upper)) return upper;
      // "(lab terpadu)" → "(Lab Terpadu)"
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Kode lokasi untuk penomoran barang.
 * Lokasi resmi → kode tetap. Lokasi custom → inisial kata (2–4 huruf),
 * ditambah huruf dari kata berikutnya kalau bentrok dengan kode yang dipakai.
 */
export function locationCode(location: string, taken: string[] = []): string {
  const name = normalizeLocation(location);
  if (!name) return "LAIN";

  if (LOCATION_CODES[name]) return LOCATION_CODES[name];

  const words = name
    .replace(/[()]/g, " ")
    .split(/[\s/]+/)
    .filter((w) => w.length > 0 && !["DAN", "DI"].includes(w.toUpperCase()));

  const initials = words.map((w) => w[0].toUpperCase());
  let code = initials.slice(0, 3).join("") || "LAIN";

  // Bentrok → tambah huruf dari kata berikutnya, lalu tambah angka.
  if (taken.includes(code)) {
    code = initials.slice(0, 4).join("");
    let n = 2;
    while (taken.includes(code)) {
      code = `${initials.slice(0, 3).join("")}${n}`;
      n++;
    }
  }
  return code;
}

/** Format kode barang lengkap. */
export function buildItemCode(location: string, year: number, seq: number, taken: string[] = []): string {
  const code = locationCode(location, taken);
  return `FMIPA-${code}-${year}-${String(seq).padStart(3, "0")}`;
}
