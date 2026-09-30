/**
 * Penjaga fitur persetujuan admin (tanda tangan + nama di dokumen).
 *
 * Diperiksa dari ISI DOKUMEN SUNGGUHAN — bukan dari kode — supaya kalau suatu
 * saat blok tanda tangan itu tidak lagi tercetak, penjaga ini gagal.
 *
 * Tiga keadaan yang harus benar:
 *   1. belum disetujui  -> kolom TTD kosong, tidak ada nama
 *   2. admin menyetujui -> nama admin TERCETAK di dokumen
 *   3. superadmin       -> "Disetujui oleh Admin", nama superadmin TIDAK muncul
 */
import { config } from "dotenv"; config({ path: ".env.local" });
import { generateBorrowingPDF } from "@/lib/pdf-generator";
import { generateHandoverPDF } from "@/lib/handover-pdf-generator";
import { penyetujuDari } from "@/lib/penyetuju";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";

const TOTAL = 13;
let lulus = 0;
const ok = (m: string) => { lulus++; console.log("  OK    " + m); };
const gagal = (m: string) => { console.log("  GAGAL " + m); };

/** Kumpulkan semua teks yang sungguh tercetak di PDF. */
async function teksPdf(buf: Buffer): Promise<string[]> {
  const doc = await PDFDocument.load(buf);
  const out: string[] = [];
  for (const p of doc.getPages()) {
    const c = p.node.Contents();
    const streams = (c as any).asArray ? (c as any).asArray() : [c];
    let raw = "";
    for (const s of streams) {
      const obj = doc.context.lookup((s as any).ref ?? s);
      if (obj instanceof PDFRawStream) raw += Buffer.from(decodePDFRawStream(obj).decode()).toString("latin1");
    }
    const re = /1 0 0 1 [\d.-]+ [\d.-]+ Tm\s*<([0-9A-Fa-f]*)>\s*Tj/g;
    let m;
    while ((m = re.exec(raw))) out.push(Buffer.from(m[1], "hex").toString("latin1"));
  }
  return out;
}

const dasarPinjam = {
  borrowerName: "Sabil Hudek", borrowerId: "21512001", department: "Informatika",
  phone: "08123456789", purpose: "Uji", notes: "",
  borrowDate: new Date("2026-09-30"), returnDate: new Date("2026-10-07"),
  items: [{ name: "Laptop Asus", quantity: 1, inventoryNumber: "409", itemCode: "FMIPA-2026-001", notes: "" }],
};

const dasarSerah = {
  receiverName: "Sabil Hudek", receiverNim: "21512001", unitName: "Informatika",
  department: "Informatika", phone: "08123456789", location: "Divisi TI",
  purpose: "Uji", notes: "", handoverDate: new Date("2026-09-30"),
  items: [{ name: "Laptop Asus", quantity: 1, assetNumber: "AST-1", inventoryNumber: "409", itemCode: "FMIPA-2026-001" }],
};

const NAMA_ADMIN = "Rizky Wibowo";
const NAMA_SUPER = "superadmin@gmail.local";

async function main() {
  console.log("=== 1. Belum disetujui (dokumen pengajuan) ===");
  {
    const t = await teksPdf(await generateBorrowingPDF({ ...dasarPinjam }));
    !t.includes(NAMA_ADMIN) && !t.some((x) => x.includes("Disetujui oleh Admin"))
      ? ok("peminjaman: tanpa nama admin & tanpa tulisan 'Disetujui oleh Admin'")
      : gagal("peminjaman: dokumen pengajuan memuat nama penyetuju");

    const s = await teksPdf(await generateHandoverPDF({ ...dasarSerah }));
    !s.some((x) => x.includes("Disetujui oleh Admin"))
      ? ok("serah terima: tanpa tulisan 'Disetujui oleh Admin' (kolom kosong)")
      : gagal("serah terima: dokumen pengajuan memuat blok penyetuju");
  }

  console.log("=== 2. Disetujui admin — nama WAJIB tercetak ===");
  {
    const penyetuju = { nama: NAMA_ADMIN, tandaTangan: null };
    const t = await teksPdf(await generateBorrowingPDF({ ...dasarPinjam, penyetuju }));
    t.includes(NAMA_ADMIN)
      ? ok(`peminjaman: nama admin "${NAMA_ADMIN}" tercetak`)
      : gagal("peminjaman: nama admin TIDAK tercetak");

    const s = await teksPdf(await generateHandoverPDF({ ...dasarSerah, penyetuju }));
    s.includes(NAMA_ADMIN)
      ? ok(`serah terima: nama admin "${NAMA_ADMIN}" tercetak`)
      : gagal("serah terima: nama admin TIDAK tercetak");
  }

  console.log("=== 3. Disetujui superadmin — nama TIDAK boleh tercetak ===");
  {
    // Sejak kotak QR diperkenalkan (Audit #22), tulisan "Disetujui oleh Admin"
    // DIGANTI "Admin <unit barang>" + kotak QR. Tulisan lama itu justru
    // membocorkan rahasia: admin biasa namanya tercetak, jadi tulisan "Admin"
    // saja langsung menandakan penyetujunya superadmin.
    //
    // Unit & kode WAJIB dikirim di sini — tanpa keduanya labelnya jatuh ke
    // "Admin FMIPA UII" dan kotak QR-nya memang tidak digambar, jadi ujinya
    // akan gagal karena bahan ujinya kurang, bukan karena kodenya salah.
    const penyetuju = { nama: null, tandaTangan: null };
    const KODE = "ABCD2345EFGH6789";
    const t = await teksPdf(await generateBorrowingPDF({
      ...dasarPinjam, penyetuju, kodeVerifikasi: KODE, unit: "Divisi Teknologi Informasi",
    }));
    !t.includes("Disetujui oleh Admin")
      ? ok("peminjaman: tulisan lama 'Disetujui oleh Admin' sudah tidak dipakai")
      : gagal("peminjaman: tulisan lama 'Disetujui oleh Admin' masih ada");
    t.some((x) => x.includes("Admin Divisi Teknologi Informasi"))
      ? ok("peminjaman: tertulis 'Admin <unit barang>'")
      : gagal("peminjaman: label 'Admin <unit barang>' tidak ada");
    t.some((x) => x.includes("Pindai untuk memeriksa"))
      ? ok("peminjaman: ada keterangan kotak QR")
      : gagal("peminjaman: keterangan kotak QR tidak ada");
    !t.includes(NAMA_SUPER)
      ? ok("peminjaman: nama superadmin tidak tercetak")
      : gagal("peminjaman: nama superadmin ikut tercetak");

    const s = await teksPdf(await generateHandoverPDF({
      ...dasarSerah, penyetuju, kodeVerifikasi: KODE, unit: "Divisi Teknologi Informasi",
    }));
    !s.includes("Disetujui oleh Admin")
      ? ok("serah terima: tulisan lama 'Disetujui oleh Admin' sudah tidak dipakai")
      : gagal("serah terima: tulisan lama 'Disetujui oleh Admin' masih ada");
    s.some((x) => x.includes("Admin Divisi Teknologi Informasi"))
      ? ok("serah terima: tertulis 'Admin <unit barang>'")
      : gagal("serah terima: label 'Admin <unit barang>' tidak ada");
    s.some((x) => x.includes("Pindai untuk memeriksa"))
      ? ok("serah terima: ada keterangan kotak QR")
      : gagal("serah terima: keterangan kotak QR tidak ada");
    !s.includes(NAMA_SUPER)
      ? ok("serah terima: nama superadmin tidak tercetak")
      : gagal("serah terima: nama superadmin ikut tercetak");
  }

  console.log("=== 4. Dokumen LAMA (approved_at kosong) tetap tanpa nama ===");
  {
    // Pengajuan yang disetujui sebelum fitur ini tidak punya catatan penyetuju.
    // Dibuat ulang → kolom TTD harus tetap kosong, bukan menebak siapa pun.
    const lama = penyetujuDari({ approvedAt: null, approvedBy: null, approvedSignatureUrl: null });
    const t = await teksPdf(await generateBorrowingPDF({ ...dasarPinjam, penyetuju: lama }));
    lama === null && !t.some((x) => x.includes("Disetujui oleh Admin"))
      ? ok("dokumen lama: penyetuju null & kolom tetap kosong")
      : gagal("dokumen lama: menebak penyetuju");
  }

  console.log(`\n>>> ${lulus}/${TOTAL} lulus`);
  process.exit(lulus === TOTAL ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
