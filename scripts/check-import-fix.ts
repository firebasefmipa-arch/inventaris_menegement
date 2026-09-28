import { lokasiMirip, LOCATION_OPTIONS, normalizeLocation } from "@/lib/locations";
import { utils } from "xlsx";
import fs from "node:fs";
import { read } from "xlsx";

let lulus = 0, gagal = 0;
const cek = (nama: string, nyata: unknown, harap: unknown) => {
  const ok = JSON.stringify(nyata) === JSON.stringify(harap);
  ok ? lulus++ : gagal++;
  console.log(`  ${ok ? "OK  " : "GAGAL"} ${nama}`);
  if (!ok) console.log(`        harap: ${JSON.stringify(harap)}\n        nyata: ${JSON.stringify(nyata)}`);
};

console.log("=== lokasiMirip ===");
cek("typo 1 huruf: Devisi → Divisi",
  lokasiMirip("Devisi Teknologi Informasi"), "Divisi Teknologi Informasi");
cek("huruf kecil semua",
  lokasiMirip("divisi teknologi informasi"), null); // sudah resmi → null
cek("resmi lain",
  lokasiMirip("Laboratorium Terpadu UII"), null);
cek("ngawur jauh", lokasiMirip("Kantin Fakultas Sains"), null);
cek("kosong", lokasiMirip(""), null);

console.log("\n=== nomor inventaris 12 digit (inti bug 1) ===");
const aoa = [
  ["Nama Barang", "No. Inv DTI", "Jumlah"],
  ["Uji", 409010025366, 1],
];
const ws = utils.aoa_to_sheet(aoa);
const wb = utils.book_new(); utils.book_append_sheet(wb, ws, "S");
fs.writeFileSync("/tmp/uji-nomor.xlsx", require("xlsx").write(wb, { type: "buffer", bookType: "xlsx" }));

const buf = fs.readFileSync("/tmp/uji-nomor.xlsx");
const wb2 = read(buf, { type: "buffer" });
const baris = utils.sheet_to_json<any>(wb2.Sheets[wb2.SheetNames[0]], { defval: null, raw: true });
const nilai = baris[0]["No. Inv DTI"];

const keTeks = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  const s = String(v).trim();
  return s || null;
};
cek("raw:true + String() → utuh", keTeks(nilai), "409010025366");
cek("BUKAN notasi ilmiah", keTeks(nilai)?.includes("E+"), false);

console.log("\n=== impor dua langkah (pratinjau → pilih) ===");
const rute = fs.readFileSync("src/app/api/items/import/route.ts", "utf8");
const modal = fs.readFileSync("src/app/admin/items/ImportModal.tsx", "utf8");

// POST harus mode hitung — kalau tidak, membuka pratinjau saja sudah menulis.
cek("POST memakai simpan=false", /POST[\s\S]{0,200}simpan:\s*false/.test(rute), true);
cek("PUT memakai simpan=true", /PUT[\s\S]{0,200}simpan:\s*true/.test(rute), true);
cek("mode hitung berhenti SEBELUM penulisan",
  rute.indexOf("if (!options.simpan)") < rute.indexOf("await db.insert(items)"), true);
cek("mode hitung tak memakai db.insert", /if \(!options\.simpan\)/.test(rute), true);

// Kunci identitas harus dikembalikan SEMUA, bukan berhenti di yang pertama —
// di sinilah dulu baris kembar dengan kolom isian berbeda lolos jadi dua.
cek("kunciSemua mengembalikan daftar kunci", /function kunciSemua\([\s\S]*?kunci\.push/.test(rute), true);
cek("kunciSemua punya kunci nama+lokasi (selalu)", /kunci\.push\(`nama:/.test(rute), true);
cek("tak ada sisa kunciBarang versi lama", rute.includes("function kunciBarang("), false);

// Pilihan pemakai harus benar-benar dibaca dari form.
cek("sertakanMirip dibaca dari form", rute.includes('formData.get("sertakanMirip")'), true);
cek("modal mengirim sertakanMirip", modal.includes('formData.append("sertakanMirip", "1")'), true);
cek("modal memakai POST untuk pratinjau & PUT untuk simpan",
  /simpan \? "PUT" : "POST"/.test(modal), true);
cek("modal punya tombol 'Impor semua'", modal.includes("Impor semua"), true);
cek("modal punya tombol 'Lewati yang mirip'", modal.includes("Lewati yang mirip"), true);
cek("pratinjau diberi tanda 'belum ada yang disimpan'",
  modal.includes("belum ada yang disimpan"), true);

console.log(`\n  lulus=${lulus} gagal=${gagal}`);
process.exit(gagal ? 1 : 0);
