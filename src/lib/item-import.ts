/**
 * Definisi kolom impor barang dari Excel/CSV.
 *
 * SATU SUMBER KEBENARAN: dipakai bersama oleh
 *   - `src/app/api/items/import/route.ts`     (membaca file yang diunggah)
 *   - `src/app/api/items/import/template/route.ts` (membuat file template)
 *   - `src/app/admin/items/ImportModal.tsx`   (menampilkan petunjuk kolom)
 *
 * Kalau daftar ini berubah, template dan petunjuknya ikut berubah sendiri —
 * jangan pernah menduplikasi nama kolom di tempat lain.
 */

export type ImportColumn = {
  /** Tulisan di baris pertama file Excel/CSV. */
  header: string;
  /** Isi baris contoh pertama. */
  contoh1: string;
  /** Isi baris contoh kedua. */
  contoh2: string;
  /** Tanpa kolom ini baris dianggap tidak sah. */
  wajib: boolean;
  /** Penjelasan singkat untuk modal. */
  keterangan: string;
  /**
   * Nama lain yang juga diterima (sudah dinormalisasi: huruf kecil, tanpa
   * spasi/titik/strip). Kolom pertama pada daftar ini adalah nama utama.
   */
  aliases: string[];
};

export const IMPORT_COLUMNS: ImportColumn[] = [
  {
    header: "Nama Barang",
    contoh1: "Proyektor Epson EB-E01",
    contoh2: "Kabel HDMI 2 meter",
    wajib: true,
    keterangan: "Nama barang. Baris tanpa nama akan dilewati.",
    aliases: ["namabarang", "nama", "name"],
  },
  {
    header: "Kategori",
    contoh1: "Elektronik",
    contoh2: "Aksesori",
    wajib: false,
    keterangan: "Kosong? Diisi otomatis dari kata pertama nama barang.",
    aliases: ["kategori", "category"],
  },
  {
    header: "Spesifikasi",
    contoh1: "LCD 3600 lumens, XGA",
    contoh2: "HDMI male ke male",
    wajib: false,
    keterangan: "Rincian/spesifikasi barang.",
    aliases: ["spesifikasi", "deskripsi", "description"],
  },
  {
    header: "SN",
    contoh1: "X8J23901",
    contoh2: "",
    wajib: false,
    keterangan: "Serial number.",
    aliases: ["sn", "serialnumber"],
  },
  {
    header: "No. Inv DTI",
    contoh1: "409010025366",
    contoh2: "",
    wajib: false,
    keterangan: "Nomor inventaris resmi UII. Jangan dikarang.",
    aliases: ["noinvdti", "noinventaris", "noinv", "nomorinventaris", "inventorynumber"],
  },
  {
    header: "No. Asset",
    contoh1: "AST-2026-001",
    contoh2: "",
    wajib: false,
    keterangan: "Nomor aset bila ada.",
    aliases: ["noasset", "nomorasset", "assetnumber"],
  },
  {
    header: "Tanggal Cek",
    contoh1: "6 Juli 2026",
    contoh2: "18 September 2026",
    wajib: false,
    keterangan: "Tanggal pemeriksaan terakhir (teks bebas).",
    aliases: ["tanggalcek", "lastcheckdate", "tanggalpengecekan"],
  },
  {
    header: "Kondisi",
    contoh1: "Baik",
    contoh2: "Rusak Ringan",
    wajib: false,
    keterangan: "Mis. Baik / Rusak Ringan / Rusak Berat.",
    aliases: ["kondisi", "condition"],
  },
  {
    header: "Jumlah",
    contoh1: "2",
    contoh2: "1",
    wajib: false,
    keterangan: "Bilangan bulat. Kosong berarti 1.",
    aliases: ["jumlah", "quantity", "qty"],
  },
  {
    header: "Unit",
    contoh1: "Divisi Teknologi Informasi",
    contoh2: "S1 Kimia",
    wajib: false,
    keterangan:
      "Pemilik barang (divisi/prodi). Kode barang dibuat otomatis dari sini, " +
      "dan unit inilah yang menentukan admin mana yang boleh mengelolanya. " +
      "Harus salah satu dari daftar unit — kosong berarti \"LAIN\".",
    aliases: ["unit", "unitkerja", "divisi", "prodi", "programstudi"],
  },
  {
    header: "Lokasi",
    contoh1: "Ruang Server Lt. 2",
    contoh2: "Laboratorium Terpadu UII",
    wajib: false,
    keterangan: "Tempat barang berada (ruangan). Bebas diisi, tidak memengaruhi kode barang.",
    aliases: ["lokasi", "location", "ruang", "tempat"],
  },
];

/** Nama kolom yang dibuat otomatis oleh sistem — jangan diisi dari file. */
export const IMPORT_AUTO_COLUMNS = [
  { header: "Kode Barang", keterangan: "Dibuat otomatis (FMIPA-<UNIT>-<TAHUN>-<URUT>). Isi dari file diabaikan." },
];

/**
 * Normalisasi nama kolom dari file: huruf kecil, buang spasi/titik/strip/underscore.
 * "No. Inv DTI" → "noinvdti"
 */
export function normalizeHeader(raw: unknown): string {
  return String(raw).toLowerCase().replace(/\s+|\.|-/g, "").replace(/_/g, "");
}

/** Cari nilai kolom dari baris yang sudah dinormalisasi, pakai daftar alias. */
export function pickColumn(row: Record<string, unknown>, aliases: string[]): unknown {
  for (const a of aliases) {
    const v = row[a];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return null;
}

/** Judul baris contoh — dipakai route template. */
export function templateRows(): string[][] {
  return [
    IMPORT_COLUMNS.map((c) => c.header),
    IMPORT_COLUMNS.map((c) => c.contoh1),
    IMPORT_COLUMNS.map((c) => c.contoh2),
  ];
}
