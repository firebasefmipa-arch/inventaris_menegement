/**
 * Pemeriksa berkas unggahan yang tidak dirujuk baris database mana pun.
 *
 * Kenapa perlu: baris database biasanya dihapus lewat aplikasi, dan aplikasi
 * sudah membuang berkasnya (`deleteUploadByUrl`) di semua jalur pembatalan.
 * Tapi kalau barisnya dihapus LANGSUNG dari database (perbaikan manual, impor,
 * skrip), berkas fisiknya ketinggalan menumpuk di disk tanpa pemilik.
 *
 * Pemakaian:
 *   npx tsx scripts/check-berkas-tak-terpakai.ts           → daftar saja
 *   npx tsx scripts/check-berkas-tak-terpakai.ts --hapus   → daftar + buang
 */
import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { UPLOAD_ROOT } from "@/lib/upload-dir";

const HAPUS = process.argv.includes("--hapus");

/** Semua berkas di bawah UPLOAD_ROOT, sebagai jalur relatif (rekursif). */
async function daftarBerkas(dir: string, akar = dir): Promise<string[]> {
  let isi: string[];
  try {
    isi = await readdir(dir);
  } catch {
    return []; // folder belum ada = tidak ada berkas
  }
  const hasil: string[] = [];
  for (const nama of isi) {
    const penuh = path.join(dir, nama);
    const info = await stat(penuh);
    if (info.isDirectory()) hasil.push(...(await daftarBerkas(penuh, akar)));
    else hasil.push(path.relative(akar, penuh));
  }
  return hasil;
}

/** URL tersimpan (`/uploads/...`) yang masih dirujuk salah satu tabel. */
async function urlTerpakai(): Promise<Set<string>> {
  const rows = await db.execute(sql.raw(`
    SELECT signed_document_url AS url FROM transactions WHERE signed_document_url LIKE '/uploads/%'
    UNION
    SELECT signed_document_url FROM handovers WHERE signed_document_url LIKE '/uploads/%'
    UNION
    SELECT signature_url FROM user WHERE signature_url LIKE '/uploads/%'
  `));
  const data = (Array.isArray(rows) ? rows[0] : []) as unknown as { url: string }[];
  return new Set(data.map((r) => r.url));
}

async function main() {
  console.log(`  folder unggahan: ${UPLOAD_ROOT}\n`);

  const [berkas, terpakai] = await Promise.all([daftarBerkas(UPLOAD_ROOT), urlTerpakai()]);

  const takTerpakai: { rel: string; ukuran: number }[] = [];
  let ukuranTotal = 0;
  for (const rel of berkas) {
    if (terpakai.has(`/uploads/${rel}`)) continue;
    const info = await stat(path.join(UPLOAD_ROOT, rel));
    takTerpakai.push({ rel, ukuran: info.size });
    ukuranTotal += info.size;
  }

  console.log(`  berkas di disk   : ${berkas.length}`);
  console.log(`  dirujuk database : ${berkas.length - takTerpakai.length}`);
  console.log(`  TAK TERPAKAI     : ${takTerpakai.length}\n`);

  for (const t of takTerpakai) {
    console.log(`    ${t.rel}   (${Math.round(t.ukuran / 1024)}K)`);
  }

  if (takTerpakai.length === 0) {
    console.log("  Semua berkas punya rujukannya.");
    process.exit(0);
  }

  console.log(`\n  total ${Math.round(ukuranTotal / 1024)}K`);

  if (!HAPUS) {
    console.log("\n  (daftar saja — tambahkan --hapus untuk benar-benar membuang)");
    process.exit(0);
  }

  for (const t of takTerpakai) {
    await unlink(path.join(UPLOAD_ROOT, t.rel));
    console.log(`  dibuang: ${t.rel}`);
  }
  console.log(`\n  ${takTerpakai.length} berkas dibuang.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
