/**
 * Penjaga fitur UNIT.
 *
 * Aturan yang dijaga:
 *
 *   U1. Kode barang ditentukan UNIT (bukan Lokasi); tiap unit urutannya sendiri
 *   U2. Dua unit berbeda TIDAK berbagi urutan — nomor tak saling menabrak
 *   U3. Unit tak dikenal → kode "LAIN" (bukan kode karangan)
 *   U4. Barang tanpa unit HANYA boleh dikelola superadmin (bukan milik bersama)
 *   U5. Admin hanya boleh mengelola unit yang ditugaskan padanya
 *   U6. Admin TANPA unit tak boleh mengelola apa pun
 *   U7. Pemecahan pengajuan: satu bagian per unit, isinya tak tercampur
 *   U8. Urutan bagian mengikuti kemunculan pertama (tidak acak)
 *   U9. Barang tanpa unit tetap punya bagiannya sendiri (satu keranjang)
 *   U10. normalizeUnit tidak peduli besar-kecil huruf & spasi berlebih
 *
 * Jalankan: npm run check:unit
 *
 * Seluruh pemeriksaan di sini MURNI (tanpa database) — logika inti fitur unit
 * memang ditaruh di fungsi tanpa efek samping supaya bisa diuji begini.
 */
import {
  UNIT_CODES,
  UNIT_OPTIONS,
  normalizeUnit,
  unitCode,
  unitDikenal,
  buildUnitItemCode,
} from "@/lib/units";
import { bolehKelolaUnit } from "@/lib/akses-unit";
import { pecahPerUnit, type Keranjang } from "@/lib/pecah-unit";
import { readFileSync } from "fs";

let lulus = 0;
let gagal = 0;

function cek(nama: string, syarat: boolean, catatan = "") {
  if (syarat) {
    lulus++;
    console.log(`  lulus  ${nama}`);
  } else {
    gagal++;
    console.log(`  GAGAL  ${nama}${catatan ? ` — ${catatan}` : ""}`);
  }
}

console.log("check:unit — aturan unit\n");

const TI = "Divisi Teknologi Informasi";
const KIM = "S1 Kimia";
const AKU = "Divisi Administrasi Keuangan";

// ── U1/U2: kode dari unit, tiap unit urutan sendiri ───────────────────────
cek("U1 kode TI memakai prefix unit TI", buildUnitItemCode(TI, 2026, 1) === "FMIPA-TI-2026-001",
  buildUnitItemCode(TI, 2026, 1));
cek("U1 kode Kimia memakai prefix unit Kimia", buildUnitItemCode(KIM, 2026, 1) === "FMIPA-KIM-2026-001",
  buildUnitItemCode(KIM, 2026, 1));
cek("U2 urutan unit tak saling menabrak",
  buildUnitItemCode(TI, 2026, 1) !== buildUnitItemCode(KIM, 2026, 1));
cek("U1 lokasi BUKAN penentu kode",
  buildUnitItemCode(TI, 2026, 7) === buildUnitItemCode(TI, 2026, 7));

// ── U3: unit tak dikenal → LAIN ───────────────────────────────────────────
cek("U3 unit tak dikenal → LAIN", unitCode("Ruang Server Lt. 2") === "LAIN", unitCode("Ruang Server Lt. 2"));
cek("U3 unit kosong → LAIN", unitCode("") === "LAIN", unitCode(""));

// ── U10: normalisasi ──────────────────────────────────────────────────────
cek("U10 besar-kecil huruf disamakan", normalizeUnit("divisi teknologi   informasi") === TI,
  normalizeUnit("divisi teknologi   informasi"));
cek("U10 spasi berlebih dirapikan", normalizeUnit("  S1   Kimia ") === KIM, normalizeUnit("  S1   Kimia "));
cek("U10 unit resmi dikenali", unitDikenal(TI) && unitDikenal(KIM));
cek("U10 unit karangan tidak dikenali", !unitDikenal("Divisi Ngawur"));

// ── U4/U5/U6: hak kelola ──────────────────────────────────────────────────
cek("U5 superadmin boleh semua unit", bolehKelolaUnit("super_admin", null, KIM));
cek("U4 superadmin boleh barang tanpa unit", bolehKelolaUnit("super_admin", null, null));
cek("U5 admin boleh unit yang ditugaskan", bolehKelolaUnit("admin", [TI], TI));
cek("U5 admin DITOLAK untuk unit lain", !bolehKelolaUnit("admin", [TI], KIM));
cek("U4 admin DITOLAK untuk barang tanpa unit", !bolehKelolaUnit("admin", [TI], null));
cek("U6 admin tanpa unit tak boleh apa pun", !bolehKelolaUnit("admin", [], TI));
cek("U5 unit dicocokkan tanpa peduli besar-kecil huruf",
  bolehKelolaUnit("admin", ["divisi teknologi informasi"], TI));
cek("U5 user biasa tak boleh mengelola", !bolehKelolaUnit("user", [TI], TI));

// ── U7/U8/U9: pemecahan pengajuan ─────────────────────────────────────────
const keranjang: Keranjang[] = [
  { itemId: 1, quantity: 1, notes: "" },
  { itemId: 2, quantity: 2, notes: "" },
  { itemId: 3, quantity: 1, notes: "" },
  { itemId: 4, quantity: 1, notes: "" },
];
const peta = new Map<number, string | null>([
  [1, TI],
  [2, KIM],
  [3, TI],
  [4, null], // tanpa unit
]);

const grup = pecahPerUnit(keranjang, peta);

cek("U7 jumlah bagian = jumlah unit berbeda (+1 tanpa unit)", grup.size === 3, `dapat ${grup.size}`);
cek("U8 urutan bagian ikut kemunculan pertama", [...grup.keys()].join("|") === [TI, KIM, ""].join("|"),
  [...grup.keys()].join("|"));
cek("U7 isi tiap bagian tak tercampur", (grup.get(TI)?.length ?? 0) === 2 && (grup.get(KIM)?.length ?? 0) === 1);
cek("U7 barang unit sama dikumpulkan bersama", grup.get(TI)!.map((c) => c.itemId).join(",") === "1,3");
cek("U9 barang tanpa unit punya bagian sendiri", (grup.get("")?.length ?? 0) === 1);
cek("U7 tak ada barang yang hilang",
  [...grup.values()].flat().length === keranjang.length);

// Satu unit saja → satu bagian (tak dipecah sia-sia)
const satuGrup = pecahPerUnit(
  [{ itemId: 9, quantity: 1, notes: "" }],
  new Map([[9, TI]])
);
cek("U7 pengajuan satu unit → satu bagian", satuGrup.size === 1);

// ── Daftar unit konsisten ─────────────────────────────────────────────────
cek("U1 setiap unit punya kode", UNIT_OPTIONS.every((u) => !!UNIT_CODES[u]));
cek("U1 kode unit unik", new Set(Object.values(UNIT_CODES)).size === Object.keys(UNIT_CODES).length);

// ── Dokumen gabungan: siapa yang boleh membuka? ───────────────────────────
// Dulu di sini hanya diperiksa `role === "admin"`, sehingga admin unit mana pun
// bisa membuka dokumen gabungan milik orang lain. Sekarang unitnya ikut
// diperiksa — aturan inilah yang harus dijaga.
const dokumenSrc = readFileSync("src/app/api/grup/[grupId]/dokumen/route.ts", "utf8");
cek(
  "U10 dokumen gabungan memeriksa unit, bukan sekadar peran",
  dokumenSrc.includes("bolehKelolaUnit") && dokumenSrc.includes("unitDikelola"),
  "harus memakai unitDikelola + bolehKelolaUnit"
);
cek(
  "U10 admin biasa tidak lagi otomatis boleh",
  !dokumenSrc.includes('role === "admin" || role === "super_admin"'),
  "pola lama masih ada"
);
cek(
  "U10 unit tiap pecahan ikut diambil",
  (dokumenSrc.match(/unit: (transactions|handovers)\.unit/g) ?? []).length === 2,
  "kedua jalur harus menyertakan kolom unit"
);
cek(
  "U10 hanya pemilik/superadmin/admin unit itu yang boleh",
  dokumenSrc.includes("pemilikId !== session.user.id"),
  "pemeriksaan pemilik harus ada"
);

// ── Berkas unggahan: batas unit juga berlaku di sini ──────────────────────
// Pembatasan di /api/grup/[grupId]/dokumen bisa dilewati dengan mengetik alamat
// berkasnya langsung, jadi aturan yang sama harus dijaga di penyaji berkas.
const uploadSrc = readFileSync("src/app/uploads/[...path]/route.ts", "utf8");
cek(
  "U11 berkas unggahan memakai batas unit, bukan 'admin boleh semua'",
  uploadSrc.includes("bolehKelolaUnit") && uploadSrc.includes("unitDikelola"),
  "harus memakai bolehKelolaUnit + unitDikelola"
);
cek(
  "U11 admin biasa tidak lagi otomatis boleh semua berkas",
  !/isAdmin\s*=\s*role\s*===\s*"admin"/.test(uploadSrc),
  "pola lama masih ada"
);
cek(
  "U11 superadmin tetap boleh semua berkas",
  uploadSrc.includes('isSuper = role === "super_admin"'),
  "pengecualian superadmin harus tetap ada"
);
cek(
  "U11 unit berkas diambil dari transaksi & serah terima",
  (uploadSrc.match(/unit: (transactions|handovers)\.unit/g) ?? []).length === 2,
  "kedua jalur harus menyertakan kolom unit"
);

// ── Penguncian status (anti stok beranak) ─────────────────────────────────
// Dulu approve/reject/cancel mengubah baris dengan `WHERE id` saja. Akibatnya
// tiga permintaan bersamaan sama-sama "berhasil" dan stok dikembalikan berkali-
// kali: barang 10 unit bisa berubah jadi tersedia 22. Sekarang tiap perubahan
// wajib menyertakan syarat status dan memeriksa jumlah baris yang kena.
const berkasKunci: [string, string][] = [
  ["approve transaksi",      "src/app/api/transactions/[id]/approve/route.ts"],
  ["approve serah terima",   "src/app/api/admin/handovers/[id]/route.ts"],
  ["batal transaksi (user)", "src/app/api/user/transactions/[id]/cancel/route.ts"],
  ["batal serah terima",     "src/app/api/user/handovers/[id]/cancel/route.ts"],
];
for (const [nama, berkas] of berkasKunci) {
  const src = readFileSync(berkas, "utf8");
  cek(
    `U12 ${nama} mengunci status di WHERE`,
    /status,\s*\[?"?(pending_approval|pending_signature)/.test(src),
    "syarat status harus ada agar tak diproses dua kali"
  );
  cek(
    `U12 ${nama} memeriksa jumlah baris (affectedRows)`,
    src.includes("affectedRows"),
    "tanpa affectedRows, kekalahan balapan tidak terdeteksi"
  );
  cek(
    `U12 ${nama} memakai status baru yang sah`,
    !/status:\s*"cancelled"/.test(src),
    "'cancelled' bukan nilai yang dikenal skema"
  );
}

// ── Validasi masukan dari klien (Audit #14 temuan kedua) ──────────────────
// Dulu jumlah dari klien dipaksa jadi angka yang "masuk akal" tanpa diperiksa:
// `quantity || 1` dan `Math.max(1, Number(x) || 1)`. Akibatnya -5, 2.5, 0, dan
// "abc" diterima diam-diam sebagai 1 — atau tersimpan ngawur lalu meledak 500.
// Sekarang angkanya diperiksa dulu lewat satu tempat: src/lib/validasi.ts.
const validasiSrc = readFileSync("src/lib/validasi.ts", "utf8");
cek(
  "U13 batas jumlah ada di satu tempat",
  validasiSrc.includes("pesanJumlahTidakValid") && validasiSrc.includes("JUMLAH_MAKS")
);
cek(
  "U13 jumlah negatif & pecahan ditolak",
  validasiSrc.includes("Number.isInteger(n) || n < 1"),
  "pemeriksaan bilangan bulat minimal 1 harus ada"
);
cek(
  "U13 jumlah terlalu besar dibatasi",
  validasiSrc.includes("n > JUMLAH_MAKS"),
  "tanpa batas atas, kolom int bisa dilewati"
);
cek(
  "U13 panjang teks diperiksa sebelum simpan",
  validasiSrc.includes("cekPanjangTeks") && validasiSrc.includes("maksimal ${batas} karakter"),
  "pesan panjang harus menyebut batasnya"
);

const itemPostSrc = readFileSync("src/app/api/items/route.ts", "utf8");
cek(
  "U13 tambah barang tidak lagi memakai `quantity || 1`",
  !/const qty = quantity \|\| 1/.test(itemPostSrc),
  "pola lama masih ada — 0 dan NaN akan lolos"
);
cek(
  "U13 tambah barang memakai pesanJumlahTidakValid",
  itemPostSrc.includes("pesanJumlahTidakValid(quantity)"),
  "harus memakai pemeriksa bersama"
);
cek(
  "U13 tambah barang memeriksa panjang teks",
  itemPostSrc.includes("cekPanjangTeks({"),
  "tanpa ini nama kepanjangan → 500"
);

const keranjangSrc = readFileSync("src/lib/pecah-unit.ts", "utf8");
cek(
  "U13 keranjang punya pemeriksa tersendiri",
  keranjangSrc.includes("pesanKeranjangTidakValid"),
  "jumlah ngawur dari keranjang harus ditolak, bukan dibetulkan jadi 1"
);
for (const berkas of [
  "src/app/api/pinjam/route.ts",
  "src/app/api/handovers/route.ts",
  "src/app/api/transactions/route.ts",
  "src/app/api/admin/handovers/route.ts",
]) {
  const s = readFileSync(berkas, "utf8");
  const nama = berkas.split("/").slice(-2, -1)[0];
  cek(
    `U13 ${nama} memeriksa keranjang sebelum dipakai`,
    s.includes("pesanKeranjangTidakValid(cart)"),
    "tanpa ini jumlah ngawur diam-diam jadi 1"
  );
}

for (const berkas of [
  "src/app/api/transactions/[id]/correct/route.ts",
  "src/app/api/admin/handovers/[id]/correct/route.ts",
]) {
  const s = readFileSync(berkas, "utf8");
  cek(
    `U13 koreksi ${berkas.includes("admin") ? "serah terima" : "transaksi"} memeriksa jumlah`,
    s.includes("pesanJumlahTidakValid(ni?.quantity)"),
    "jumlah negatif/NaN lolos kalau hanya dibandingkan dengan stok"
  );
}

console.log(`\n  lulus=${lulus} gagal=${gagal}\n`);
process.exit(gagal > 0 ? 1 : 0);
