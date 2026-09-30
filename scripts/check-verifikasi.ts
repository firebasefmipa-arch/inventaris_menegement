/**
 * Penjaga fitur kode pemeriksaan dokumen (kotak QR).
 *
 * Memeriksa HAL YANG SUNGGUH-SUNGGUH DILIHAT ORANG di dokumen tercetak, bukan
 * meniru query: dokumen dibuat di memori, isinya dibaca kembali, lalu dicocokkan.
 * Meniru query mudah "lulus palsu" — dokumennya sendiri tidak pernah diperiksa.
 *
 * Jalankan: npm run check:verifikasi
 */
import {
  kodeBaru, rapikanKode, kodeTerbaca, urlPemeriksaan, labelPenyetuju,
  ukuranMuat, statusBatal, labelStatus,
} from "../src/lib/dokumen-verifikasi";
import { generateBorrowingPDF } from "../src/lib/pdf-generator";
import { generateHandoverPDF } from "../src/lib/handover-pdf-generator";
import { inflateSync } from "node:zlib";

let lulus = 0;
const gagal: string[] = [];
const cek = (nama: string, syarat: boolean, bukti = "") => {
  if (syarat) { lulus++; return; }
  gagal.push(`${nama}${bukti ? ` — ${bukti}` : ""}`);
};

/** Baca teks yang tercetak di PDF (aliran termampat + operator Tj). */
function teksPdf(buf: Buffer): string {
  const out: string[] = [];
  const teks = buf.toString("latin1");
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(teks))) {
    const mulai = m.index + m[0].length;
    const akhir = teks.indexOf("endstream", mulai);
    if (akhir < 0) continue;
    let isi: Buffer;
    try { isi = inflateSync(Buffer.from(teks.slice(mulai, akhir), "latin1")); } catch { continue; }
    const isiTeks = isi.toString("latin1");
    const reTj = /1 0 0 1 [\d.-]+ [\d.-]+ Tm\s*<([0-9A-Fa-f]*)>\s*Tj/g;
    let t: RegExpExecArray | null;
    while ((t = reTj.exec(isiTeks))) out.push(Buffer.from(t[1], "hex").toString("latin1"));
    const reTj2 = /\(((?:[^()\\]|\\.)*)\)\s*Tj/g;
    while ((t = reTj2.exec(isiTeks))) out.push(t[1]);
  }
  return out.join("\n");
}

const adaGambar = (buf: Buffer) => (buf.toString("latin1").match(/\/Subtype\s*\/Image/g) || []).length;

async function main() {
  // ── 1. Bentuk kode ──
  const kode = kodeBaru();
  cek("kode 16 huruf", kode.length === 16, kode);
  cek("kode hanya huruf/angka besar", /^[0-9A-Z]{16}$/.test(kode), kode);
  cek("kode tanpa huruf mudah tertukar", !/[0O1IL]/.test(kode), kode);
  cek("rapikan kode dari URL", rapikanKode("ab-cd 23 45") === "ABCD2345");
  cek("kode enak dibaca", kodeTerbaca("ABCD2345EFGH6789") === "ABCD-2345-EFGH-6789");
  cek("alamat pemeriksaan utuh",
      urlPemeriksaan("ABCD2345EFGH6789").endsWith("/logistik/cek/ABCD2345EFGH6789"),
      urlPemeriksaan("ABCD2345EFGH6789"));

  // ── 2. Penyamaran penyetuju superadmin (INTI permintaan) ──
  cek("superadmin -> 'Admin <unit>'",
      labelPenyetuju({ nama: null, tandaTangan: null }, "Divisi Teknologi Informasi") ===
      "Admin Divisi Teknologi Informasi");
  cek("superadmin tanpa unit tetap 'Admin ...'",
      labelPenyetuju({ nama: null, tandaTangan: null }, null) === "Admin FMIPA UII");
  cek("admin biasa tetap pakai namanya",
      labelPenyetuju({ nama: "Rizky Wibowo", tandaTangan: "/x.png" }, "Divisi Teknologi Informasi") ===
      "Rizky Wibowo");
  cek("belum disetujui -> tidak ada label", labelPenyetuju(null, "X") === null);

  // ── 3. Label status halaman pemeriksaan ──
  cek("status 'active' -> Sedang Dipinjam", labelStatus("active") === "Sedang Dipinjam");
  cek("status 'completed' -> Serah Terima Selesai", labelStatus("completed") === "Serah Terima Selesai");
  cek("status asing ditampilkan apa adanya", labelStatus("aneh") === "aneh");
  cek("ditolak = tidak berlaku", statusBatal("rejected"));
  cek("dibatalkan = tidak berlaku", statusBatal("cancelled"));
  cek("sedang dipinjam tetap berlaku", !statusBatal("active"));

  // ── 4. Ukuran huruf label muat kolom ──
  const font = { widthOfTextAtSize: (t: string, s: number) => t.length * s * 0.5 } as any;
  cek("label panjang dikecilkan", ukuranMuat(font, "a".repeat(300), 130) < 9);

  // ── 5. DOKUMEN PEMINJAMAN — superadmin ──
  const kodeQr = "ABCD2345EFGH6789";
  const pdfSuper = await generateBorrowingPDF({
    borrowerName: "Peminjam Contoh",
    borrowerId: "12345678",
    department: "Contoh",
    phone: "0800000000",
    purpose: "Contoh",
    notes: "",
    borrowDate: new Date("2026-09-30T08:00:00Z"),
    returnDate: new Date("2026-10-07T08:00:00Z"),
    items: [{ name: "Barang Contoh", quantity: 2, itemCode: "KODE-1", inventoryNumber: "INV-1" }],
    signatureUrl: null,
    penyetuju: { nama: null, tandaTangan: null },
    kodeVerifikasi: kodeQr,
    unit: "Divisi Teknologi Informasi",
    tanggalTandaTangan: new Date("2026-09-30T08:00:00Z"),
  });
  const isiSuper = teksPdf(pdfSuper);
  cek("[pinjam] TIDAK menulis 'Disetujui oleh Admin'", !isiSuper.includes("Disetujui oleh Admin"));
  cek("[pinjam] menulis 'Admin Divisi Teknologi Informasi'", isiSuper.includes("Admin Divisi Teknologi Informasi"));
  cek("[pinjam] memuat keterangan 'Pindai untuk memeriksa'", isiSuper.includes("Pindai untuk memeriksa"));
  cek("[pinjam] memuat gambar kotak QR", adaGambar(pdfSuper) >= 1, `jumlah gambar=${adaGambar(pdfSuper)}`);
  cek("[pinjam] nama peminjam tetap tercetak", isiSuper.includes("Peminjam Contoh"));

  // ── 6. DOKUMEN PEMINJAMAN — admin biasa (tidak berubah) ──
  const pdfAdmin = await generateBorrowingPDF({
    borrowerName: "Peminjam Contoh",
    borrowerId: "12345678",
    department: "Contoh",
    phone: "0800000000",
    purpose: "Contoh",
    notes: "",
    borrowDate: new Date("2026-09-30T08:00:00Z"),
    returnDate: new Date("2026-10-07T08:00:00Z"),
    items: [{ name: "Barang Contoh", quantity: 2, itemCode: "KODE-1", inventoryNumber: "INV-1" }],
    signatureUrl: null,
    penyetuju: { nama: "Rizky Wibowo", tandaTangan: null },
    kodeVerifikasi: kodeQr,
    unit: "Divisi Teknologi Informasi",
    tanggalTandaTangan: new Date("2026-09-30T08:00:00Z"),
  });
  const isiAdmin = teksPdf(pdfAdmin);
  cek("[pinjam] admin: nama admin tercetak", isiAdmin.includes("Rizky Wibowo"));
  cek("[pinjam] admin: TIDAK ada label 'Admin <unit>'", !isiAdmin.includes("Admin Divisi Teknologi Informasi"));
  cek("[pinjam] admin: TIDAK ada kotak QR", !isiAdmin.includes("Pindai untuk memeriksa"));

  // ── 7. Belum disetujui: perilaku lama dipertahankan ──
  const pdfKosong = await generateBorrowingPDF({
    borrowerName: "Peminjam Contoh", borrowerId: "", department: "", phone: "",
    purpose: "", notes: "",
    borrowDate: new Date("2026-09-30T08:00:00Z"),
    returnDate: new Date("2026-10-07T08:00:00Z"),
    items: [{ name: "Barang Contoh", quantity: 1 }],
    signatureUrl: null,
    penyetuju: null,
  });
  const isiKosong = teksPdf(pdfKosong);
  cek("[pinjam] belum disetujui: tanpa label admin", !isiKosong.includes("Admin Divisi"));
  cek("[pinjam] belum disetujui: tanpa kotak QR", !isiKosong.includes("Pindai untuk memeriksa"));

  // ── 8. DOKUMEN SERAH TERIMA — superadmin ──
  const pdfSt = await generateHandoverPDF({
    receiverName: "Penerima Contoh",
    receiverNim: "12345678",
    unitName: "S1 Kimia",
    department: "Contoh",
    phone: "0800000000",
    location: "Ruang Contoh",
    purpose: "Contoh",
    notes: "",
    handoverDate: new Date("2026-09-30T08:00:00Z"),
    signatureUrl: null,
    penyetuju: { nama: null, tandaTangan: null },
    kodeVerifikasi: kodeQr,
    unit: "Divisi Teknologi Informasi",
    tanggalTandaTangan: new Date("2026-09-30T08:00:00Z"),
    items: [{ name: "Barang Contoh", quantity: 1, itemCode: "KODE-1" }],
  });
  const isiSt = teksPdf(pdfSt);
  cek("[serah] TIDAK menulis 'Disetujui oleh Admin'", !isiSt.includes("Disetujui oleh Admin"));
  cek("[serah] menulis 'Admin Divisi Teknologi Informasi' (unit PEMILIK)", isiSt.includes("Admin Divisi Teknologi Informasi"));
  cek("[serah] memakai unit PEMILIK, bukan unit penerima", !isiSt.includes("Admin S1 Kimia"));
  cek("[serah] memuat keterangan 'Pindai untuk memeriksa'", isiSt.includes("Pindai untuk memeriksa"));
  cek("[serah] memuat gambar kotak QR", adaGambar(pdfSt) >= 1, `jumlah gambar=${adaGambar(pdfSt)}`);
  cek("[serah] nama penerima tetap tercetak", isiSt.includes("Penerima Contoh"));

  console.log(`\n  lulus=${lulus} gagal=${gagal.length}`);
  if (gagal.length) {
    gagal.forEach((g) => console.log("   - " + g));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
