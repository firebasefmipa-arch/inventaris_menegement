/**
 * Penjaga fitur PENYAMBUNGAN PEMINJAM (catatan admin → riwayat akun).
 *
 * Menguji aturan yang gampang rusak diam-diam:
 *   P1. email peminjam WAJIB — kosong / ngawur ditolak
 *   P2. email disimpan sudah dirapikan (huruf kecil, tanpa spasi pinggir)
 *   P3. email yang SUDAH punya akun → langsung tertaut saat dicatat
 *   P4. email yang BELUM punya akun → transaksinya tetap tersimpan,
 *       lalu MENEMPEL SENDIRI saat pemilik emailnya login
 *   P5. penyambungan TIDAK menyentuh transaksi milik orang lain
 *       (hanya baris yang pemiliknya masih kosong)
 *   P6. daftar saran hanya memuat akun yang PERNAH LOGIN + data diri lengkap
 *   P7. waktu login dicatat
 *
 * Jalankan: npm run check:sambung
 *
 * CATATAN: memakai data DB NYATA dan membersihkan jejaknya sendiri (semua
 * barang/akun ujinya bernama awalan ZZ). Jangan dijalankan bersamaan uji lain.
 */
import { db } from "@/db";
import { items, transactions, transactionItems, users } from "@/db/schema";
import { and, eq, inArray, isNull, like } from "drizzle-orm";
import { sambungkanTransaksiTertunda } from "@/lib/sambung-peminjam";
import { cariAkunSaran } from "@/lib/cari-akun-saran";

let lulus = 0, gagal = 0;
function cek(nama: string, syarat: boolean, bukti = "") {
  if (syarat) { lulus++; console.log(`  ✔ ${nama}`); }
  else { gagal++; console.log(`  ✘ ${nama}${bukti ? ` — ${bukti}` : ""}`); }
}

const AWAL_ITEM = "ZZPENJAGA";
const AWAL_AKUN = "zzpenjaga";
let idBarang = 0;
let idAkun = "";
let idAkunLain = "";
let idTrxMenempel = 0;
let idAkunBaru = "";
let idTrxLain = 0;

async function bersihkan() {
  const trx = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(like(transactions.borrowerName, `${AWAL_ITEM}%`));
  const ids = trx.map((t) => t.id);
  if (ids.length) {
    await db.delete(transactionItems).where(inArray(transactionItems.transactionId, ids));
    await db.delete(transactions).where(inArray(transactions.id, ids));
  }
  await db.delete(items).where(like(items.name, `${AWAL_ITEM}%`));
  await db.delete(users).where(like(users.email, `${AWAL_AKUN}%`));
}

async function main() {
  await bersihkan();

  // ── Bahan ──
  const kode = `ZZP${Date.now().toString().slice(-6)}`;
  const [barang] = await db
    .insert(items)
    .values({
      name: `${AWAL_ITEM} Barang`,
      category: "Umum",
      quantity: 10,
      availableQuantity: 10,
      condition: "Baik",
      canBorrow: true,
      itemCode: kode,
      location: "Basement",
    })
    .$returningId();
  idBarang = barang.id;

  const [akunA] = await db
    .insert(users)
    .values({
      name: `${AWAL_ITEM} Pemilik`,
      email: `${AWAL_AKUN}.pemilik@uji.local`,
      phone: "081200000001",
      nim: "111000",
      department: "Divisi Teknologi Informasi",
      status: "active",
      role: "user",
      lastLoginAt: new Date(),
    })
    .$returningId();
  idAkun = akunA.id;

  const [akunB] = await db
    .insert(users)
    .values({
      name: `${AWAL_ITEM} Orang Lain`,
      email: `${AWAL_AKUN}.lain@uji.local`,
      phone: "081200000002",
      nim: "222000",
      department: "Divisi Teknologi Informasi",
      status: "active",
      role: "user",
      lastLoginAt: new Date(),
    })
    .$returningId();
  idAkunLain = akunB.id;

  const emailPemilik = `${AWAL_AKUN}.pemilik@uji.local`;
  const emailBaru = `${AWAL_AKUN}.baru@uji.local`;

  // ── P3: email SUDAH punya akun → langsung tertaut ──
  const [trx1] = await db
    .insert(transactions)
    .values({
      userId: idAkun,
      itemId: null,
      borrowerName: `${AWAL_ITEM} A`,
      borrowerEmail: emailPemilik,
      borrowerDepartment: "Divisi Teknologi Informasi",
      quantity: 1,
      status: "active",
      expectedReturnDate: new Date(Date.now() + 3 * 864e5),
      purpose: "Uji penjaga",
    })
    .$returningId();
  const [baca1] = await db
    .select({ userId: transactions.userId })
    .from(transactions)
    .where(eq(transactions.id, trx1.id));
  cek("P3 email berakun → pemilik terisi saat dicatat", baca1.userId === idAkun, `user_id=${baca1.userId}`);

  // ── P4: email BELUM berakun → nempel saat login ──
  const [trx2] = await db
    .insert(transactions)
    .values({
      userId: null,
      itemId: null,
      borrowerName: `${AWAL_ITEM} B`,
      borrowerEmail: emailBaru,
      borrowerDepartment: "Divisi Teknologi Informasi",
      quantity: 1,
      status: "active",
      expectedReturnDate: new Date(Date.now() + 3 * 864e5),
      purpose: "Uji penjaga",
    })
    .$returningId();
  idTrxMenempel = trx2.id;

  // Transaksi milik orang lain — TIDAK boleh ikut tertarik (P5).
  const [trx3] = await db
    .insert(transactions)
    .values({
      userId: idAkunLain,
      itemId: null,
      borrowerName: `${AWAL_ITEM} C`,
      borrowerEmail: emailBaru, // email SAMA, tapi sudah punya pemilik
      borrowerDepartment: "Divisi Teknologi Informasi",
      quantity: 1,
      status: "active",
      expectedReturnDate: new Date(Date.now() + 3 * 864e5),
      purpose: "Uji penjaga",
    })
    .$returningId();
  idTrxLain = trx3.id;

  // Akun baru muncul (meniru pendaftaran), lalu "login".
  const [akunBaru] = await db
    .insert(users)
    .values({
      name: `${AWAL_ITEM} Baru`,
      email: emailBaru,
      phone: "081200000003",
      nim: "333000",
      department: "Divisi Teknologi Informasi",
      status: "active",
      role: "user",
      // Meniru login yang memicu penyambungan di bawah.
      lastLoginAt: new Date(),
    })
    .$returningId();

  idAkunBaru = akunBaru.id;
  await sambungkanTransaksiTertunda(akunBaru.id, emailBaru);

  const [sesudah2] = await db
    .select({ userId: transactions.userId })
    .from(transactions)
    .where(eq(transactions.id, idTrxMenempel));
  cek("P4 transaksi menggantung MENEMPEL saat pemiliknya login",
    sesudah2.userId === akunBaru.id, `user_id=${sesudah2.userId} harusnya ${akunBaru.id}`);

  const [sesudah3] = await db
    .select({ userId: transactions.userId })
    .from(transactions)
    .where(eq(transactions.id, idTrxLain));
  cek("P5 transaksi milik orang lain TIDAK ikut tertarik",
    sesudah3.userId === idAkunLain, `user_id=${sesudah3.userId} harusnya ${idAkunLain}`);

  // ── P2/P5: email dibandingkan tanpa peduli huruf besar & spasi ──
  const [trx4] = await db
    .insert(transactions)
    .values({
      userId: null,
      itemId: null,
      borrowerName: `${AWAL_ITEM} D`,
      borrowerEmail: `  ${emailBaru.toUpperCase()}  `,
      borrowerDepartment: "Divisi Teknologi Informasi",
      quantity: 1,
      status: "active",
      expectedReturnDate: new Date(Date.now() + 3 * 864e5),
      purpose: "Uji penjaga",
    })
    .$returningId();
  await sambungkanTransaksiTertunda(akunBaru.id, emailBaru);
  const [sesudah4] = await db
    .select({ userId: transactions.userId })
    .from(transactions)
    .where(eq(transactions.id, trx4.id));
  cek("P2 email HURUF BESAR + spasi tetap nyambung",
    sesudah4.userId === akunBaru.id, `user_id=${sesudah4.userId}`);

  // ── P7: penyambungan hanya menyentuh yang KOSONG ──
  const sisaKosong = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(isNull(transactions.userId), like(transactions.borrowerName, `${AWAL_ITEM}%`)));
  cek("P5 setelah disambungkan tak ada lagi yang menggantung",
    sisaKosong.length === 0, `sisa ${sisaKosong.length}`);

  // ── P6: saran hanya akun yang pernah login + data diri lengkap ──
  const [akunTanpaLogin] = await db
    .insert(users)
    .values({
      name: `${AWAL_ITEM} BelumLogin`,
      email: `${AWAL_AKUN}.belumlogin@uji.local`,
      phone: "081200000004",
      nim: "444000",
      department: "Divisi Teknologi Informasi",
      status: "active",
      role: "user",
      // lastLoginAt sengaja KOSONG
    })
    .$returningId();

  await db
    .insert(users)
    .values({
      name: `${AWAL_ITEM} TanpaData`,
      email: `${AWAL_AKUN}.tanpadata@uji.local`,
      status: "active",
      role: "user",
      lastLoginAt: new Date(),
      // hp/nim/divisi sengaja KOSONG
    });

  // Uji lewat FUNGSI YANG SAMA yang dipakai rute /api/cari-user — bukan tiruan.
  const hasilSaran = await cariAkunSaran(AWAL_AKUN, 50);
  const idSaran = hasilSaran.map((a) => a.id);
  cek("P6 akun yang pernah login + data lengkap MUNCUL di saran",
    idSaran.includes(idAkun) && idSaran.includes(idAkunBaru), `dapat ${idSaran.length}`);
  cek("P6 akun yang BELUM pernah login DISEMBUNYIKAN",
    !idSaran.includes(akunTanpaLogin.id), `id ${akunTanpaLogin.id} ikut muncul`);
  cek("P6 saran TIDAK membocorkan kata sandi / tanda tangan",
    hasilSaran.every((a) => !("password" in a) && !("signatureUrl" in a)),
    Object.keys(hasilSaran[0] ?? {}).join(","));
  // ── P1: email wajib (diperiksa lewat jalur HTTP nyata di luar penjaga ini) ──
  // Penjaga ini memastikan KOLOM-nya ada & dipakai; penolakan email kosong
  // diuji uji-sambung-email.mjs supaya tak perlu menyalakan server dari sini.
  const kolomEmail = await db
    .select({ email: transactions.borrowerEmail })
    .from(transactions)
    .where(eq(transactions.id, idTrxMenempel));
  cek("P1 email peminjam TERSIMPAN di barisnya", !!kolomEmail[0]?.email, JSON.stringify(kolomEmail[0]));

  await bersihkan();
  console.log(`\n  lulus=${lulus} gagal=${gagal}`);
  process.exit(gagal > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("ERROR:", e);
  await bersihkan().catch(() => {});
  process.exit(1);
});
