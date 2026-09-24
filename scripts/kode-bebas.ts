/**
 * Buku register nomor barang — perintah perawatan.
 *
 *   npm run kode:bebas daftar              lihat semua nomor yang terkunci
 *   npm run kode:bebas lepas <KODE>        bebaskan satu nomor
 *   npm run kode:bebas semai               isi register dari data yang ada
 *   npm run kode:bebas cek                 pastikan tak ada nomor dipakai ganda
 *
 * HANYA untuk superadmin — jalankan di server, tak pernah menyala sendiri.
 *
 * PERINGATAN: "lepas" menghapus kunci nomor. Kalau kodenya sudah dipakai
 * barang yang masih hidup, nomor itu BISA diberikan ke barang lain. Karena
 * itu perintahnya menolak melepas kode yang masih dipakai — pakai
 * `lepas --paksa <KODE>` kalau benar-benar yakin.
 */
import { db } from "@/db";
import { items, kodeTerpakai } from "@/db/schema";
import { eq, sql, asc } from "drizzle-orm";
import { bacaKode, catatKode } from "@/lib/item-code";
import { lepasNomor } from "@/lib/kode-register";

function garis(n = 60) {
  console.log("─".repeat(n));
}

async function daftar() {
  const rows = await db
    .select()
    .from(kodeTerpakai)
    .orderBy(asc(kodeTerpakai.prefix), asc(kodeTerpakai.tahun), asc(kodeTerpakai.urut));

  if (rows.length === 0) {
    console.log("  Register KOSONG. Jalankan: npm run kode:bebas semai");
    return;
  }

  // Tandai mana yang barangnya masih hidup.
  const hidup = await db.select({ id: items.id, code: items.itemCode }).from(items);
  const hidupSet = new Set(hidup.map((i) => i.code).filter(Boolean));

  garis();
  console.log(`  ${rows.length} nomor terkunci`);
  garis();
  for (const r of rows) {
    const status = hidupSet.has(r.kode) ? "dipakai" : "bekas  ";
    console.log(`  ${status}  ${r.kode}   (${r.sumber})`);
  }
  garis();
  console.log("  'dipakai' = masih ada barangnya · 'bekas' = barangnya sudah dihapus,");
  console.log("  nomornya tetap terkunci supaya tak diberikan ke barang lain.");
}

async function lepas(kode: string, paksa: boolean) {
  const hasil = await lepasNomor(kode, paksa);

  if (!hasil.ok) {
    garis();
    if (hasil.alasan.startsWith("masih dipakai")) {
      console.log(`  DITOLAK: "${hasil.kode}" ${hasil.alasan}.`);
      console.log(`  Melepasnya membuat kode itu bisa diberikan ke barang lain.`);
      console.log(`  Kalau memang mau: npm run kode:bebas lepas --paksa ${hasil.kode}`);
      garis();
      process.exit(1);
    }
    console.log(`  ${hasil.alasan}`);
    garis();
    process.exit(0);
  }

  console.log(
    `  Nomor ${hasil.kode} DIBEBASKAN.${hasil.dipaksa ? ` (dipaksa, padahal masih dipakai "${hasil.namaBarang}")` : ""}`
  );
}

async function semai() {
  const semua = await db.select({ id: items.id, code: items.itemCode }).from(items);
  const kodeAda = semua.map((i) => i.code).filter(Boolean) as string[];

  const sudah = await db.select({ kode: kodeTerpakai.kode }).from(kodeTerpakai);
  const sudahSet = new Set(sudah.map((s) => s.kode));

  const baru = kodeAda.filter((k) => !sudahSet.has(k));
  for (const k of baru) {
    const [b] = await db.select({ id: items.id }).from(items).where(eq(items.itemCode, k)).limit(1);
    await catatKode(k, { itemId: b?.id ?? null, sumber: "awal" });
  }

  console.log(`  Disemai ${baru.length} nomor dari ${kodeAda.length} kode barang yang ada.`);
  if (baru.length) for (const k of baru) console.log(`    + ${k}`);
}

/** Pastikan tak ada satu kode dipakai dua barang berbeda. */
async function cek() {
  const rows = await db.execute(sql`
    SELECT item_code, COUNT(*) AS n FROM items
     WHERE item_code IS NOT NULL GROUP BY item_code HAVING n > 1
  `);
  const data = (Array.isArray(rows) ? rows[0] : rows) as unknown as any[];
  const bentrok = Array.isArray(data) ? data : [];

  const reg = await db.select({ kode: kodeTerpakai.kode }).from(kodeTerpakai);
  const regSet = new Set(reg.map((r) => r.kode));
  const hidup = (await db.select({ code: items.itemCode }).from(items))
    .map((i) => i.code).filter(Boolean) as string[];
  const belumTercatat = hidup.filter((k) => !regSet.has(k));

  garis();
  console.log(`  kode dipakai ganda   : ${bentrok.length}  ${bentrok.length ? "← MASALAH" : "(aman)"}`);
  for (const b of bentrok) console.log(`    ${b.item_code} dipakai ${b.n} barang`);
  console.log(`  register berisi      : ${reg.length} nomor`);
  console.log(`  kode hidup belum tercatat: ${belumTercatat.length} ${belumTercatat.length ? "← jalankan 'semai'" : "(aman)"}`);
  garis();
  process.exit(bentrok.length ? 1 : 0);
}

const aksi = process.argv[2];
const paksa = process.argv.includes("--paksa");
const arg = process.argv.filter((a) => !a.startsWith("--"))[3];

(async () => {
  if (aksi === "daftar") await daftar();
  else if (aksi === "semai") await semai();
  else if (aksi === "cek") await cek();
  else if (aksi === "lepas") {
    if (!arg) { console.log("  Pakai: npm run kode:bebas lepas <KODE>"); process.exit(1); }
    await lepas(arg, paksa);
  } else {
    console.log(`
  Buku register nomor barang.

    npm run kode:bebas daftar          lihat nomor yang terkunci
    npm run kode:bebas semai           isi register dari data yang ada
    npm run kode:bebas cek             pastikan tak ada nomor dipakai ganda
    npm run kode:bebas lepas <KODE>    bebaskan satu nomor (superadmin)

  Nomor yang pernah dipakai TIDAK boleh diberikan ke barang lain — itu
  gunanya register ini. Bebaskan hanya kalau nomornya telanjur terkunci
  padahal tak pernah jadi dipakai.
`);
  }
  process.exit(0);
})().catch((e) => { console.error("ERROR:", e); process.exit(1); });
