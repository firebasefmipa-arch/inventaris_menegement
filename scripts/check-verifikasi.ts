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
import { config } from "dotenv";

// WAJIB: tanpa ini UPLOAD_DIR kosong, berkas tanda tangan gagal dimuat, dan
// `catch` di generator menelannya diam-diam — penjaga lalu bilang "lulus"
// padahal tanda tangan TIDAK tergambar sama sekali.
config({ path: ".env.local" });

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

/**
 * Baca posisi tulisan & gambar di PDF supaya tumpang-tindih bisa DIBUKTIKAN,
 * bukan ditebak dari angka di sourcecode. Angka di sourcecode pernah bilang
 * "aman" padahal kotak QR menembus tulisan "Yang menyerahkan,".
 */
function tataLetak(buf: Buffer): {
  teks: { x: number; y: number; ukuran: number; isi: string }[];
  gambar: { x: number; y: number; w: number; h: number }[];
} {
  const teks: { x: number; y: number; ukuran: number; isi: string }[] = [];
  const gambar: { x: number; y: number; w: number; h: number }[] = [];
  const mentah = buf.toString("latin1");
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(mentah))) {
    const mulai = m.index + m[0].length;
    const akhir = mentah.indexOf("endstream", mulai);
    if (akhir < 0) continue;
    let isi: string;
    try { isi = inflateSync(Buffer.from(mentah.slice(mulai, akhir), "latin1")).toString("latin1"); } catch { continue; }

    // Tulisan: "1 0 0 1 x y Tm" lalu Tj berikutnya (heksa atau kurung).
    // Ukuran huruf dilacak dari operator "Tf" supaya tinggi huruf bisa
    // diperkirakan sesuai ukurannya — keterangan QR hanya 6,5pt, kalau
    // dianggap 10pt pemeriksaan tumpang-tindihnya jadi gagal palsu.
    let ukuran = 10;
    let tunggu: { x: number; y: number } | null = null;
    for (const baris of isi.split("\n")) {
      const l = baris.trim();
      const mTf = /^\/[\w.-]+ ([\d.]+) Tf$/.exec(l);
      if (mTf) { ukuran = Number(mTf[1]); continue; }
      const mTm = /^1 0 0 1 ([\d.-]+) ([\d.-]+) Tm$/.exec(l);
      if (mTm) { tunggu = { x: Number(mTm[1]), y: Number(mTm[2]) }; continue; }
      const mTj = /^(?:<([0-9A-Fa-f]*)>|\(((?:[^()\\]|\\.)*)\)) Tj$/.exec(l);
      if (mTj && tunggu) {
        const isiTeks = mTj[1] !== undefined ? Buffer.from(mTj[1], "hex").toString("latin1") : mTj[2];
        teks.push({ x: tunggu.x, y: tunggu.y, ukuran, isi: isiTeks });
        tunggu = null;
      }
    }
    // Gambar: pdf-lib menulis TERJEMAHAN dan SKALA sebagai dua operator `cm`
    // terpisah (mis. "1 0 0 1 280 245 cm" lalu "62 0 0 62 0 0 cm"), jadi
    // keduanya harus dikalikan — kalau hanya satu yang dibaca, kotak QR tak
    // ketemu dan penjaga jadi buta.
    let mat: number[] | null = null;
    for (const baris of isi.split("\n")) {
      const l = baris.trim();
      if (l === "q") { mat = [1, 0, 0, 1, 0, 0]; continue; }
      const mCm = /^([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) cm$/.exec(l);
      if (mCm && mat) {
        const [a, b, c, d, e, f] = mCm.slice(1).map(Number);
        // Operator `cm` berlaku SEBELUM matriks yang sudah terkumpul
        // (titik di ruang lokal dikalikan skala dulu, baru diterjemahkan),
        // jadi perkaliannya M_operator x M_terkumpul — bukan sebaliknya.
        mat = [
          a * mat[0] + b * mat[2],
          a * mat[1] + b * mat[3],
          c * mat[0] + d * mat[2],
          c * mat[1] + d * mat[3],
          e * mat[0] + f * mat[2] + mat[4],
          e * mat[1] + f * mat[3] + mat[5],
        ];
        continue;
      }
      if (/\/[\w.-]+ Do$/.test(l) && mat) {
        gambar.push({ w: Math.abs(mat[0]), h: Math.abs(mat[3]), x: mat[4], y: mat[5] });
      }
    }
  }
  return { teks, gambar };
}

/** Kotak besar persegi = kandidat kotak QR (TTD biasanya lebih lebar/rendah). */
function kotakQr(buf: Buffer) {
  return tataLetak(buf).gambar.filter((z) => Math.abs(z.w - z.h) < 1.5 && z.w > 40);
}

/**
 * Cari baris tulisan yang PALING DEKAT ke sebuah posisi y.
 * Perlu karena banyak tulisan muncul berkali-kali (nama peminjam tercetak di
 * tabel keterangan DAN di blok tanda tangan) — `find` biasa bisa mengambil yang
 * salah dan membuat pemeriksaan "sejajar" jadi gagal palsu / lulus palsu.
 */
function cariDekat(teks: { x: number; y: number; ukuran: number; isi: string }[], isi: string, dekatY: number) {
  const sama = teks.filter((b) => b.isi === isi);
  if (!sama.length) return undefined;
  return sama.reduce((a, b) => (Math.abs(b.y - dekatY) < Math.abs(a.y - dekatY) ? b : a));
}

/**
 * Benar kalau kotak QR di PDF tidak menembus tulisan atau keterangannya sendiri.
 * Tinggi huruf diperkirakan ~1pt per poin ukuran (tulisan di sini 8-10pt).
 */
function qrTidakBertabrakan(buf: Buffer): { aman: boolean; bukti: string } {
  const { teks, gambar } = tataLetak(buf);
  const qr = gambar.filter((z) => Math.abs(z.w - z.h) < 1.5 && z.w > 40);
  if (!qr.length) return { aman: false, bukti: "kotak QR tidak ditemukan" };
  const z = qr[0];
  const atasQr = z.y + z.h;
  const kiriQr = z.x - 2, kananQr = z.x + z.w + 2;
  const tabrakan: string[] = [];
  for (const b of teks) {
    // Tinggi huruf mengikuti ukuran aslinya (dilacak dari operator Tf), bukan
    // angka tetap — keterangan QR 6,5pt tidak setinggi tulisan 10pt.
    const atasTeks = b.y + b.ukuran * 0.95;
    const bawahTeks = b.y - 3;
    const beririsanX = !(b.x + b.isi.length * 5 < kiriQr || b.x > kananQr);
    const beririsanY = !(atasTeks < z.y || bawahTeks > atasQr);
    // Keterangan "Pindai untuk memeriksa" memang di bawah kotak — bukan tabrakan
    // selama masih di luar kotaknya.
    if (beririsanX && beririsanY) tabrakan.push(`"${b.isi}" (y=${b.y})`);
  }
  return {
    aman: tabrakan.length === 0,
    bukti: tabrakan.length ? `kotak QR menembus: ${tabrakan.join(", ")}` : `kotak x=${z.x} y=${z.y} ${z.w}x${z.h}`,
  };
}

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

  // ── 9. TATA LETAK: kotak QR tidak boleh menembus tulisan di sekitarnya ──
  // Angka di sourcecode pernah bilang "aman" padahal kotaknya menembus
  // "Yang menyerahkan,". Jadi yang diperiksa POSISI NYATA di PDF.
  const tabrakPinjam = qrTidakBertabrakan(pdfSuper);
  cek("[pinjam] kotak QR tidak menembus tulisan lain", tabrakPinjam.aman, tabrakPinjam.bukti);
  const tabrakSerah = qrTidakBertabrakan(pdfSt);
  cek("[serah] kotak QR tidak menembus tulisan lain", tabrakSerah.aman, tabrakSerah.bukti);
  cek("[pinjam] kotak QR ada & bersudut persegi", kotakQr(pdfSuper).length === 1,
      `jumlah kotak persegi=${kotakQr(pdfSuper).length}`);
  cek("[serah] kotak QR ada & bersudut persegi", kotakQr(pdfSt).length === 1,
      `jumlah kotak persegi=${kotakQr(pdfSt).length}`);

  // ── 10. TATA LETAK: baris kolom kiri/tengah/kanan harus SEJAJAR ──
  // Nama peminjam tercetak DUA kali (di tabel keterangan dan di blok tanda
  // tangan), jadi pencariannya harus "yang terdekat dengan blok tanda tangan",
  // bukan sekadar `find` pertama.
  //
  // PENTING soal apa yang memang sebaris: label "Admin <unit>" duduk di baris
  // yang SAMA dengan nama yang ditandatangani (peminjam / penerima), sedangkan
  // tulisan peran ("Penerima Barang Kembali", "Divisi Informasi Teknologi")
  // sengaja lebih RENDAH supaya ada ruang tanda tangan. Jadi yang diperiksa
  // sejajar adalah label Admin <-> nama penandatangan; baris peran diperiksa
  // sejajar satu sama lain (kiri <-> tengah).
  const posPinjam = tataLetak(pdfSuper).teks;
  const yPeranKiri = posPinjam.find((b) => b.isi === "Penerima Barang Kembali")?.y;
  const yPeranTengah = posPinjam.find((b) => b.isi === "Divisi Informasi Teknologi")?.y;
  const yLabelAdminPinjam = yPeranKiri === undefined ? undefined
    : cariDekat(posPinjam, "Admin Divisi Teknologi Informasi", yPeranKiri)?.y;
  const yNamaPinjam = yLabelAdminPinjam === undefined ? undefined
    : cariDekat(posPinjam, "Peminjam Contoh", yLabelAdminPinjam)?.y;
  cek("[pinjam] tulisan peran kiri & tengah sejajar", yPeranKiri !== undefined && yPeranKiri === yPeranTengah,
      `kiri=${yPeranKiri} tengah=${yPeranTengah}`);
  cek("[pinjam] label Admin sejajar dengan nama penandatangan", yLabelAdminPinjam === yNamaPinjam,
      `admin=${yLabelAdminPinjam} nama=${yNamaPinjam}`);

  const posSerah = tataLetak(pdfSt).teks;
  const ySerahKiri = posSerah.find((b) => b.isi === "Yang menyerahkan,")?.y;
  const ySerahKanan = posSerah.find((b) => b.isi === "Yang menerima,")?.y;
  const yLabelAdmin = ySerahKiri === undefined ? undefined
    : cariDekat(posSerah, "Admin Divisi Teknologi Informasi", ySerahKiri)?.y;
  const yNamaPenerima = yLabelAdmin === undefined ? undefined
    : cariDekat(posSerah, "Penerima Contoh", yLabelAdmin)?.y;
  cek("[serah] 'Yang menyerahkan,' & 'Yang menerima,' sejajar", ySerahKiri === ySerahKanan,
      `kiri=${ySerahKiri} kanan=${ySerahKanan}`);
  cek("[serah] label Admin sejajar dengan nama penerima", yLabelAdmin === yNamaPenerima,
      `admin=${yLabelAdmin} penerima=${yNamaPenerima}`);

  // ── 11. TATA LETAK: tanda tangan harus DUDUK DI TENGAH ruangnya ──
  // Dua cacat berurutan di sini: (a) TTD dulu digambar relatif ke tulisan
  // "Peminjam," (posisi lama) sehingga mengambang 43pt di atas namanya; (b)
  // setelah diperbaiki jadi 12pt, ia malah MENEMPEL nama sementara di atasnya
  // masih ada 36pt kosong — kelihatan tidak di tengah. Sekarang: jarak dari
  // tulisan peran (atas) dan ke nama (bawah) sama-sama {TTD_NAIK}pt.
  // Angka di sourcecode tidak bisa menangkap ini — yang diperiksa jarak NYATA.
  const TTD = "/uploads/signatures/sig_uji_user.png";
  const berTtdPinjam = await generateBorrowingPDF({
    borrowerName: "Peminjam Contoh", borrowerId: "12345678", department: "Contoh",
    phone: "0800000000", purpose: "Contoh", notes: "",
    borrowDate: new Date("2026-09-30T08:00:00Z"),
    returnDate: new Date("2026-10-07T08:00:00Z"),
    items: [{ name: "Barang Contoh", quantity: 1, itemCode: "KODE-1" }],
    signatureUrl: TTD,
    penyetuju: { nama: null, tandaTangan: null },
    kodeVerifikasi: kodeQr,
    unit: "Divisi Teknologi Informasi",
    tanggalTandaTangan: new Date("2026-09-30T08:00:00Z"),
  });
  const layPinjam = tataLetak(berTtdPinjam);
  const ttdPinjam = layPinjam.gambar.filter((z) => z.x > 350);
  // Nama muncul DUA kali (tabel keterangan + blok tanda tangan) — ambil yang
  // TERDEKAT ke tanda tangan, bukan `find` pertama.
  const yNamaPinjamTtd = ttdPinjam.length ? cariDekat(layPinjam.teks, "Peminjam Contoh", ttdPinjam[0].y)?.y : undefined;
  const celahPinjam = ttdPinjam.length && yNamaPinjamTtd !== undefined ? ttdPinjam[0].y - yNamaPinjamTtd : NaN;
  cek("[pinjam] TTD peminjam tercetak di dokumen", ttdPinjam.length === 1,
      `jumlah gambar kolom kanan=${ttdPinjam.length}`);
  cek("[pinjam] gambar TTD benar-benar berisi (berkas TTD terbaca)",
      ttdPinjam.length === 1 && ttdPinjam[0].w > 5 && ttdPinjam[0].h > 5,
      ttdPinjam.length ? `ukuran=${ttdPinjam[0].w.toFixed(1)}x${ttdPinjam[0].h.toFixed(1)}` : "tidak ada gambar");
  // TTD duduk di TENGAH: jarak ke atas (tulisan "Yang menyerahkan,"/"Peminjam,")
  // harus sama dengan jarak ke bawah (nama penandatangan).
  // Kedua sisi diukur dari KOTAK HURUF, bukan garis dasar. Angkanya dikalibrasi
  // dari dokumen hasil cetak (PyMuPDF): kotak huruf Helvetica membentang
  // ~1,07×ukuran di ATAS garis dasar dan ~0,30×ukuran di bawahnya.
  const peranPin = layPinjam.teks.find((b) => b.isi === "Peminjam,");
  const namaPin = yNamaPinjamTtd !== undefined
    ? layPinjam.teks.filter((b) => b.isi === "Peminjam Contoh" && b.y === yNamaPinjamTtd)[0] : undefined;
  const atasPinjam = ttdPinjam.length && peranPin !== undefined
    ? (peranPin.y - 0.30 * peranPin.ukuran) - (ttdPinjam[0].y + ttdPinjam[0].h) : NaN;
  cek("[pinjam] TTD peminjam tidak mengambang jauh dari namanya",
      celahPinjam >= 20 && celahPinjam <= 28,
      `jarak ke nama=${Number.isNaN(celahPinjam) ? "?" : celahPinjam.toFixed(1)}pt (harus 20..28)`);
  cek("[pinjam] TTD peminjam tidak menutupi namanya", !(celahPinjam < 0), `celah=${celahPinjam}`);
  const bawahTintaPinjam = ttdPinjam.length && namaPin !== undefined
    ? ttdPinjam[0].y - (namaPin.y + 1.07 * namaPin.ukuran) : NaN;
  cek("[pinjam] TTD peminjam DUDUK DI TENGAH ruangnya (tepi tinta atas = bawah)",
      !Number.isNaN(atasPinjam) && !Number.isNaN(bawahTintaPinjam) && Math.abs(atasPinjam - bawahTintaPinjam) <= 4,
      `atas=${Number.isNaN(atasPinjam) ? "?" : atasPinjam.toFixed(1)}pt bawah=${Number.isNaN(bawahTintaPinjam) ? "?" : bawahTintaPinjam.toFixed(1)}pt (selisih harus <=4)`);

  const berTtdSerah = await generateHandoverPDF({
    receiverName: "Penerima Contoh", receiverNim: "12345678",
    unitName: "S1 Kimia", department: "Contoh", phone: "0800000000",
    location: "Ruang Contoh", purpose: "Contoh", notes: "",
    handoverDate: new Date("2026-09-30T08:00:00Z"),
    signatureUrl: TTD,
    penyetuju: { nama: null, tandaTangan: null },
    kodeVerifikasi: kodeQr,
    unit: "Divisi Teknologi Informasi",
    tanggalTandaTangan: new Date("2026-09-30T08:00:00Z"),
    items: [{ name: "Barang Contoh", quantity: 1, itemCode: "KODE-1" }],
  });
  const laySerah = tataLetak(berTtdSerah);
  const ttdSerah = laySerah.gambar.filter((z) => z.x > 350);
  const yNamaPenerimaTtd = ttdSerah.length ? cariDekat(laySerah.teks, "Penerima Contoh", ttdSerah[0].y)?.y : undefined;
  const celahSerah = ttdSerah.length && yNamaPenerimaTtd !== undefined ? ttdSerah[0].y - yNamaPenerimaTtd : NaN;
  cek("[serah] TTD penerima tercetak di dokumen", ttdSerah.length === 1,
      `jumlah gambar kolom kanan=${ttdSerah.length}`);
  cek("[serah] gambar TTD benar-benar berisi (berkas TTD terbaca)",
      ttdSerah.length === 1 && ttdSerah[0].w > 5 && ttdSerah[0].h > 5,
      ttdSerah.length ? `ukuran=${ttdSerah[0].w.toFixed(1)}x${ttdSerah[0].h.toFixed(1)}` : "tidak ada gambar");
  const peranSerah = laySerah.teks.find((b) => b.isi === "Yang menerima,");
  const namaSerah = yNamaPenerimaTtd !== undefined
    ? laySerah.teks.filter((b) => b.isi === "Penerima Contoh" && b.y === yNamaPenerimaTtd)[0] : undefined;
  const atasSerah = ttdSerah.length && peranSerah !== undefined
    ? (peranSerah.y - 0.30 * peranSerah.ukuran) - (ttdSerah[0].y + ttdSerah[0].h) : NaN;
  cek("[serah] TTD penerima tidak mengambang jauh dari namanya",
      celahSerah >= 20 && celahSerah <= 28,
      `jarak ke nama=${Number.isNaN(celahSerah) ? "?" : celahSerah.toFixed(1)}pt (harus 20..28)`);
  cek("[serah] TTD penerima tidak menutupi namanya", !(celahSerah < 0), `celah=${celahSerah}`);
  const bawahTintaSerah = ttdSerah.length && namaSerah !== undefined
    ? ttdSerah[0].y - (namaSerah.y + 1.07 * namaSerah.ukuran) : NaN;
  cek("[serah] TTD penerima DUDUK DI TENGAH ruangnya (tepi tinta atas = bawah)",
      !Number.isNaN(atasSerah) && !Number.isNaN(bawahTintaSerah) && Math.abs(atasSerah - bawahTintaSerah) <= 4,
      `atas=${Number.isNaN(atasSerah) ? "?" : atasSerah.toFixed(1)}pt bawah=${Number.isNaN(bawahTintaSerah) ? "?" : bawahTintaSerah.toFixed(1)}pt (selisih harus <=4)`);

  console.log(`\n  lulus=${lulus} gagal=${gagal.length}`);
  if (gagal.length) {
    gagal.forEach((g) => console.log("   - " + g));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
