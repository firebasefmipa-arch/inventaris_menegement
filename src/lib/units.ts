// Sumber tunggal daftar UNIT (divisi & program studi) FMIPA UII.
//
// Unit berbeda dari Lokasi:
//   Unit   = pemilik barang (divisi/prodi)  → dipakai untuk KODE BARANG & hak kelola admin
//   Lokasi = tempat barang berada (ruangan) → bebas diketik, tidak memengaruhi kode
//
// Daftar ini SENGAJA disamakan dengan departemen di profil user
// (src/lib/departments.ts) supaya satuan yang sama tak punya dua nama berbeda.
//
// Nama unit adalah kunci yang tersimpan di database. Mengubah namanya berarti
// unit barang lama jadi tak dikenali — perlakukan seperti kolom immutable.

/** Kode unit untuk penomoran barang: FMIPA-<KODE>-<TAHUN>-<URUT>. */
export const UNIT_CODES: Record<string, string> = {
  // ── Divisi ──
  "Divisi Administrasi Akademik": "AKA",
  "Divisi Administrasi Keuangan": "KEU",
  "Divisi Teknologi Informasi": "TI",
  "Divisi Administrasi Umum, Rumah Tangga": "RT",
  // ── Program Studi ──
  "D3 Analisis Kimia": "ANK",
  "S1 Statistika": "STA",
  "S1 Kimia": "KIM",
  "S1 Farmasi": "FAR",
  "S1 Farmasi (Program Internasional)": "FARIN",
  "S1 Pendidikan Kimia": "PKA",
  "Program Profesi Apoteker": "APT",
  "S2 Magister Kimia": "MKIM",
  "S2 Magister Farmasi": "MFAR",
  "S2 Magister Statistika": "MSTA",
  "S3 Doktor Farmasi": "DFAR",
};

/** Daftar unit, dikelompokkan untuk tampilan drop-down. */
export const UNIT_GROUPS = [
  {
    group: "Divisi",
    options: [
      "Divisi Administrasi Akademik",
      "Divisi Administrasi Keuangan",
      "Divisi Teknologi Informasi",
      "Divisi Administrasi Umum, Rumah Tangga",
    ],
  },
  {
    group: "Program Studi",
    options: [
      "D3 Analisis Kimia",
      "S1 Statistika",
      "S1 Kimia",
      "S1 Farmasi",
      "S1 Farmasi (Program Internasional)",
      "S1 Pendidikan Kimia",
      "Program Profesi Apoteker",
      "S2 Magister Kimia",
      "S2 Magister Farmasi",
      "S2 Magister Statistika",
      "S3 Doktor Farmasi",
    ],
  },
];

export const UNIT_OPTIONS = UNIT_GROUPS.flatMap((g) => g.options);

/** Kode kalau unit kosong/tak dikenal — barang tetap dapat nomor, tak menggantung. */
export const UNIT_CODE_FALLBACK = "LAIN";

/**
 * Rapikan nama unit: cocokkan dengan daftar resmi tanpa peduli besar-kecil huruf.
 * Nama di luar daftar dikembalikan apa adanya (sudah dirapikan spasi).
 *
 * Berbeda dari lokasi, unit TIDAK dibuat-buat: kalau tak ada di daftar, itu
 * tanda ada yang salah — pemanggil sebaiknya memberi peringatan.
 */
export function normalizeUnit(raw: string | null | undefined): string {
  const input = (raw || "").trim().replace(/\s+/g, " ");
  if (!input) return "";
  const resmi = UNIT_OPTIONS.find((u) => u.toLowerCase() === input.toLowerCase());
  return resmi ?? input;
}

/** Unit ini terdaftar resmi? */
export function unitDikenal(unit: string | null | undefined): boolean {
  const u = normalizeUnit(unit);
  return !!u && UNIT_OPTIONS.includes(u);
}

/**
 * Kode unit untuk penomoran barang.
 *
 * Unit resmi → kode tetap dari UNIT_CODES (STABIL: "Divisi Teknologi Informasi"
 * selalu "TI", ditulis bagaimana pun oleh pemakai).
 * Unit tak dikenal → "LAIN", supaya barang tetap punya nomor yang sah dan
 * tidak ada dua unit tak dikenal yang saling menabrak nomornya.
 */
export function unitCode(unit: string | null | undefined): string {
  const u = normalizeUnit(unit);
  return UNIT_CODES[u] ?? UNIT_CODE_FALLBACK;
}

/** Kode barang lengkap. */
export function buildUnitItemCode(
  unit: string | null | undefined,
  year: number,
  seq: number
): string {
  return `FMIPA-${unitCode(unit)}-${year}-${String(seq).padStart(3, "0")}`;
}
