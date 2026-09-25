/**
 * Penjaga buku register nomor barang (Bagian B).
 *
 * Aturan: nomor yang PERNAH dipakai tidak boleh diberikan ke barang lain.
 *
 *   B1. nomor berikutnya dibaca dari register, bukan dari baris hidup
 *   B2. INTI: barang dibuat → dihapus → barang baru TIDAK dapat nomor bekas itu
 *   B3. nomor tercatat SAAT DIBUAT (bukan menunggu tersimpan)
 *   B4. register tak pernah mundur walau barangnya dihapus
 *   B5. "lepas" menolak melepas nomor yang masih dipakai barang hidup
 *   B6. "lepas" berhasil untuk nomor bekas → nomor itu bisa dipakai lagi
 *   B7. catatKode idempoten (dipanggil dua kali → satu baris)
 *
 * Jalankan: npm run check:kode
 *
 * Memakai register NYATA dan membersihkan jejaknya sendiri.
 */
import { db } from "@/db";
import { items, kodeTerpakai } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { generateItemCode, nextSequence, catatKode, bacaKode, formatCode } from "@/lib/item-code";
import { lepasNomor } from "@/lib/kode-register";

let lulus = 0;
let gagal = 0;
function cek(nama: string, kondisi: boolean, info = "") {
  if (kondisi) { lulus++; console.log(`  lulus  ${nama}`); }
  else { gagal++; console.log(`  GAGAL  ${nama}${info ? ` — ${info}` : ""}`); }
}

const UNIT = "Divisi Teknologi Informasi";
const UNIT_KIMIA = "S1 Kimia";
const TAHUN = new Date().getFullYear();
const TANDA = "ZZ-UJI-KODE";

/** Semua kode yang DIBUAT uji ini — dihapus lagi saat bersih-bersih. */
const dibuat: string[] = [];

/**
 * Bersihkan barang uji + nomor register yang dibuat uji ini.
 *
 * Hapus TEPAT kode yang dicatat di `dibuat`, jangan pakai ambang urut
 * (mis. >= 900): nomor uji mulai dari urut berikutnya yang bebas, jadi
 * ambang tetap meninggalkan sisa di register.
 */
async function bersihkan() {
  const barang = await db.select().from(items).where(eq(items.name, `${TANDA} Barang`));
  const ids = barang.map((b) => b.id);
  if (ids.length) await db.delete(items).where(inArray(items.id, ids));

  const unik = [...new Set(dibuat)];
  if (unik.length) await db.delete(kodeTerpakai).where(inArray(kodeTerpakai.kode, unik));
  dibuat.length = 0;
}

async function main() {
  console.log("check-kode-barang — buku register nomor\n");
  await bersihkan();

  // ══ B1: nomor berikutnya dari register ══
  const dasar = await nextSequence("TI", TAHUN);
  cek("B1 nextSequence membaca register (angka wajar)", Number.isInteger(dasar) && dasar >= 1,
      `seq=${dasar}`);

  // ══ B3: nomor tercatat SAAT DIBUAT ══
  const { code: kodeBaru, unit } = await generateItemCode(UNIT);
  dibuat.push(kodeBaru);
  const adaDiRegister = await db.select().from(kodeTerpakai).where(eq(kodeTerpakai.kode, kodeBaru));
  cek("B3 nomor langsung tercatat saat dibuat (belum tentu ada barangnya)",
      adaDiRegister.length === 1, `kode=${kodeBaru} catatan=${adaDiRegister.length}`);
  cek("B3 bentuk kode benar", /^FMIPA-TI-\d{4}-\d{3}$/.test(kodeBaru), kodeBaru);

  // ══ B7: idempoten ══
  await catatKode(kodeBaru, { sumber: "barang" });
  const dobel = await db.select().from(kodeTerpakai).where(eq(kodeTerpakai.kode, kodeBaru));
  cek("B7 catatKode dua kali tetap satu baris", dobel.length === 1, `baris=${dobel.length}`);

  // ══ B2: INTI — hapus barang, nomor bekas tak boleh dipakai lagi ══
  const [{ id: idA }] = await db.insert(items).values({
    name: `${TANDA} Barang`, category: "Elektronik", unit,
    quantity: 1, availableQuantity: 1, itemCode: kodeBaru,
  }).$returningId();

  // Barang B dibuat SETELAH A ada → harus dapat nomor yang lebih tinggi
  const { code: kodeB } = await generateItemCode(UNIT);
  dibuat.push(kodeB);
  cek("B2 barang kedua dapat nomor berbeda", kodeB !== kodeBaru, `${kodeBaru} vs ${kodeB}`);

  // Hapus A (barangnya saja; register harus tetap)
  await db.delete(items).where(eq(items.id, idA));
  const regTetap = await db.select().from(kodeTerpakai).where(eq(kodeTerpakai.kode, kodeBaru));
  cek("B4 nomor tetap tercatat walau barangnya dihapus", regTetap.length === 1,
      `catatan=${regTetap.length}`);

  // Barang C dibuat setelah A dihapus → HARUS dapat nomor baru, bukan nomor A
  const { code: kodeC } = await generateItemCode(UNIT);
  dibuat.push(kodeC);
  cek("B2 ▓ INTI: nomor bekas TIDAK diberikan ke barang baru",
      kodeC !== kodeBaru, `kodeC=${kodeC} (tidak boleh = ${kodeBaru})`);
  cek("B2 nomor berikutnya lebih tinggi dari yang bekas",
      (bacaKode(kodeC)?.urut ?? 0) > (bacaKode(kodeBaru)?.urut ?? 0),
      `urutC=${bacaKode(kodeC)?.urut} urutA=${bacaKode(kodeBaru)?.urut}`);

  // ══ B5/B6: pembebas ══
  // Nomor bekas A → boleh dilepas
  const hasilLepas = await lepasNomor(kodeBaru, false);
  cek("B6 nomor bekas BISA dilepas", hasilLepas.ok, hasilLepas.ok ? "" : hasilLepas.alasan);
  const setelahLepas = await db.select().from(kodeTerpakai).where(eq(kodeTerpakai.kode, kodeBaru));
  cek("B6 nomor benar-benar hilang dari register setelah dilepas", setelahLepas.length === 0);

  // Nomor yang MASIH dipakai → tolak
  const [{ id: idM }] = await db.insert(items).values({
    name: `${TANDA} Barang`, category: "Elektronik", unit,
    quantity: 1, availableQuantity: 1, itemCode: kodeC,
  }).$returningId();
  const tolak = await lepasNomor(kodeC, false);
  cek("B5 nomor yang MASIH dipakai DITOLAK dilepas", !tolak.ok, tolak.ok ? "dilepas (salah)" : tolak.alasan);
  const paksa = await lepasNomor(kodeC, true);
  cek("B5 --paksa menembus penolakan", paksa.ok, paksa.ok ? "" : paksa.alasan);

  // ══ B8: BENTROK — beberapa permintaan serentak harus dapat nomor BERBEDA ══
  // Inilah bug yang pernah lolos: dua permintaan membaca nomor yang sama,
  // keduanya memakainya, dan yang kedua gagal disimpan dengan error 500.
  const serentak = await Promise.all(
    Array.from({ length: 8 }, () => generateItemCode(UNIT))
  );
  const kodeSerentak = serentak.map((s) => s.code);
  kodeSerentak.forEach((k) => dibuat.push(k));
  const unikSerentak = new Set(kodeSerentak);
  cek(
    "B8 ▓ INTI: 8 permintaan serentak dapat 8 nomor BERBEDA",
    unikSerentak.size === 8,
    `unik=${unikSerentak.size} dari 8 → ${kodeSerentak.join(", ")}`
  );
  cek(
    "B8 semuanya berbentuk kode sah",
    kodeSerentak.every((k) => /^FMIPA-TI-\d{4}-\d{3}$/.test(k)),
    kodeSerentak.join(", ")
  );
  const tercatatSemua = await db
    .select()
    .from(kodeTerpakai)
    .where(inArray(kodeTerpakai.kode, kodeSerentak));
  cek(
    "B8 semuanya tercatat di register",
    tercatatSemua.length === 8,
    `tercatat=${tercatatSemua.length}`
  );

  // ══ B9: KODE DARI UNIT, BUKAN LOKASI ══
  // Inti pemisahan Unit vs Lokasi: barang dinomori menurut PEMILIKnya (unit),
  // bukan menurut ruangan tempatnya. Dua barang berunit sama harus berbagi satu
  // urutan, walau lokasinya ditulis berbeda-beda.
  const kB = await generateItemCode(UNIT); dibuat.push(kB.code);
  const kK = await generateItemCode(UNIT_KIMIA); dibuat.push(kK.code);
  cek("B9 unit TI memakai kode TI", /^FMIPA-TI-\d{4}-\d{3}$/.test(kB.code), kB.code);
  cek("B9 unit Kimia memakai kode KIM", /^FMIPA-KIM-\d{4}-\d{3}$/.test(kK.code), kK.code);
  cek("B9 tiap unit punya urutannya SENDIRI (mulai dari 1)",
      (bacaKode(kK.code)?.urut ?? 0) === 1,
      `urutKimia=${bacaKode(kK.code)?.urut} (harus 1 — belum ada barang Kimia)`);

  // Kelompok berbeda kata harus TETAP unitnya, bukan ditulis bebas.
  const kSalah = await generateItemCode("Divisi Teknologi InformasI"); dibuat.push(kSalah.code);
  cek("B9 besar-kecil huruf unit dinormalkan (tetap prefix TI)",
      kSalah.code.startsWith("FMIPA-TI-"), kSalah.code);

  // Unit di luar daftar → LAIN, bukan bikin prefix acak yang memecah urutan.
  const kNyasar = await generateItemCode("Ruang Server Lt. 2"); dibuat.push(kNyasar.code);
  cek("B9 unit tak dikenal memakai LAIN (bukan prefix karangan)",
      kNyasar.code.startsWith("FMIPA-LAIN-"), kNyasar.code);

  // ══ B1b: register menang atas items ══
  // Semai nomor tinggi tanpa barangnya → nextSequence harus ikut register
  const tinggi = formatCode("TI", TAHUN, 950);
  await catatKode(tinggi, { sumber: "awal" });
  dibuat.push(tinggi);
  const setelahTinggi = await nextSequence("TI", TAHUN);
  cek("B1b register mengunci walau TAK ADA barangnya", setelahTinggi === 951,
      `nextSequence=${setelahTinggi} (harus 951)`);

  // ══ B4b: items jadi jaring pengaman kalau register kosong ══
  await db.delete(kodeTerpakai).where(eq(kodeTerpakai.kode, tinggi));
  const [{ id: idJaring }] = await db.insert(items).values({
    name: `${TANDA} Barang`, category: "Elektronik", unit,
    quantity: 1, availableQuantity: 1, itemCode: formatCode("TI", TAHUN, 960),
  }).$returningId();
  const jaring = await nextSequence("TI", TAHUN);
  cek("B4b barang tanpa catatan register tetap dihitung (tak ditabrak)", jaring === 961,
      `nextSequence=${jaring} (harus 961)`);
  await db.delete(items).where(eq(items.id, idJaring));

  await bersihkan();
  console.log(`\n  lulus=${lulus} gagal=${gagal}`);
  process.exit(gagal > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("ERROR:", e);
  await bersihkan().catch(() => {});
  process.exit(1);
});
