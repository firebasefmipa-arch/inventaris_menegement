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

console.log(`\n  lulus=${lulus} gagal=${gagal}\n`);
process.exit(gagal > 0 ? 1 : 0);
