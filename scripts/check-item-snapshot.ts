/**
 * Memeriksa setiap pemakaian namaSql()/namaSqlLegacy() di src/ punya tabel
 * sumbernya. Bug 22 Sep 2026: patch otomatis menyisipkan
 * `namaSql(items.name, transactionItems.itemName)` ke query yang hanya join
 * `items` — MySQL menolak (Unknown column) dan halaman gagal render.
 *
 * Jalankan: npm run check:snapshot
 */
import fs from "fs";
import path from "path";

const AKAR = path.join(process.cwd(), "src");
const RE_PAKAI = /namaSql(?:Legacy)?\(/;

function berkasTs(dir: string): string[] {
  const hasil: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) hasil.push(...berkasTs(p));
    else if (/\.tsx?$/.test(e.name)) hasil.push(p);
  }
  return hasil;
}

let periksa = 0;
const gagal: string[] = [];

for (const fp of berkasTs(AKAR)) {
  const baris = fs.readFileSync(fp, "utf8").split("\n");
  baris.forEach((b, i) => {
    if (!RE_PAKAI.test(b)) return;
    periksa++;

    // blok query: dari `.select(` terdekat di atas, sampai .where/.orderBy/.limit
    let awal = i;
    while (awal > 0 && !baris[awal].includes(".select(")) awal--;
    let akhir = i;
    while (akhir < baris.length - 1 && !/\.(where|orderBy|limit)\(/.test(baris[akhir])) akhir++;
    const blok = baris.slice(awal, akhir + 1).join("\n");

    const from = blok.match(/\.from\((\w+)\)/)?.[1] ?? "?";
    const joins = [...blok.matchAll(/\.(?:left|inner)Join\((\w+),/g)].map((m) => m[1]);
    const legacy = b.includes("namaSqlLegacy");

    // Lewati definisi helper itu sendiri (file lib).
    const relatif = path.relative(process.cwd(), fp);
    if (relatif.includes("lib/item-snapshot")) return;

    if (legacy) {
      if (from !== "transactions") {
        gagal.push(`${relatif}:${i + 1}  namaSqlLegacy dipakai pada from=${from} (harus transactions)`);
      }
      return;
    }

    for (const t of new Set([...blok.matchAll(/\b(transactionItems|handoverItems)\.itemName\b/g)].map((m) => m[1]))) {
      if (from !== t && !joins.includes(t)) {
        gagal.push(`${relatif}:${i + 1}  butuh tabel ${t} tapi from=${from} joins=[${joins.join(", ")}]`);
      }
    }
  });
}

console.log(`check:snapshot — ${periksa} pemakaian diperiksa`);
if (gagal.length) {
  console.log("\nGAGAL:");
  for (const g of gagal) console.log(`  - ${g}`);
  process.exit(1);
}
console.log("  semua pemakaian punya tabel sumbernya (OK)");
