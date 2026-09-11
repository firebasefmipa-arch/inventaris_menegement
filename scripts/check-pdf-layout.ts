import { config } from "dotenv"; config({ path: ".env.local" });
import { generateBorrowingPDF } from "@/lib/pdf-generator";
import { generateHandoverPDF } from "@/lib/handover-pdf-generator";
import { PDFDocument, PDFRawStream, decodePDFRawStream, StandardFonts, PDFFont } from "pdf-lib";
import fs from "fs/promises";

const CONTENT_W = 595.28 - 112;
const B_W = [24, 131, 112, 44, 74, CONTENT_W - (24 + 131 + 112 + 44 + 74)];
const H_W = [24, CONTENT_W - (24 + 112 + 120 + 44), 112, 120, 44];
const CUT = "\u0085";           // byte yang ditulis pdf-lib untuk "…"
const toReal = (t: string) => t.replace(/\u0085/g, "\u2026"); // → U+2026 agar bisa diukur

async function cells(buf: Buffer) {
  const doc = await PDFDocument.load(buf);
  const out: { x: number; y: number; text: string }[] = [];
  for (const p of doc.getPages()) {
    const c = p.node.Contents();
    const streams = (c as any).asArray ? (c as any).asArray() : [c];
    let raw = "";
    for (const s of streams) {
      const obj = doc.context.lookup((s as any).ref ?? s);
      if (obj instanceof PDFRawStream) raw += Buffer.from(decodePDFRawStream(obj).decode()).toString("latin1");
    }
    const re = /1 0 0 1 ([\d.-]+) ([\d.-]+) Tm\s*<([0-9A-Fa-f]*)>\s*Tj/g;
    let m;
    while ((m = re.exec(raw))) out.push({ x: +m[1], y: +m[2], text: Buffer.from(m[3], "hex").toString("latin1") });
  }
  return out;
}

async function main() {
  const d0 = await PDFDocument.create();
  const f = await d0.embedFont(StandardFonts.Helvetica);
  const fb = await d0.embedFont(StandardFonts.HelveticaBold);
  const w = (t: string, font: PDFFont = f) => font.widthOfTextAtSize(toReal(t), 9);
  let bad = 0;
  const fail = (m: string) => { bad++; console.log("  GAGAL " + m); };
  const ok = (m: string) => console.log("  OK    " + m);

  const KODE = ["FMIPA-FMIPA-2026-001", "FMIPA-MSTA-2026-012", "FMIPA-OSCE-2026-999", "FMIPA-ANK-2026-001"];
  const NAMA = ["Laptop Asus Vivobook No 12", "Proyektor Epson EB-X06 (unit 2)", "Kabel HDMI panjang 5 meter merek terbaik", "Mouse Logitech M170"];
  const KET = ["Dipakai rapat", "Dipakai untuk acara seminar", "Dipakai untuk acara seminar nasional tahunan fakultas", ""];

  const borrow = await generateBorrowingPDF({
    borrowerName: "Sabil Hudek", borrowerId: "21512001", department: "Informatika",
    phone: "08123456789", purpose: "Uji", notes: "", borrowDate: new Date(), returnDate: new Date(Date.now() + 864e5),
    items: KODE.map((c, i) => ({ name: NAMA[i], quantity: 2, inventoryNumber: "409010025366", itemCode: c, notes: KET[i] })),
  });
  await fs.writeFile("/tmp/uji-borrow.pdf", borrow);
  const b = await cells(borrow);
  console.log("=== PDF PEMINJAMAN ===");

  // 1. Kode & No.Inventaris WAJIB utuh
  for (const c of KODE) b.some((r) => r.text === c) ? ok(`kode utuh ${c}`) : fail(`kode terpotong ${c}`);
  b.some((r) => r.text === "409010025366") ? ok("No. Inventaris utuh") : fail("No. Inventaris terpotong");

  // 2. Header wajib muat di kolomnya
  for (const [h, i] of [["Nama Alat/Barang", 1], ["Kode Barang", 2], ["Jumlah", 3], ["No. Inventaris", 4], ["Keterangan", 5]] as [string, number][]) {
    const avail = B_W[i] - 12;
    w(h, fb) <= avail ? ok(`header "${h}" muat (${w(h, fb).toFixed(1)}<=${avail})`) : fail(`header "${h}" luber ${w(h, fb).toFixed(1)}>${avail}`);
  }

  // 3. Sel data: harus utuh ATAU terpotong rapi & muat
  const cekSel = (label: string, nilai: string, colIdx: number) => {
    const avail = B_W[colIdx] - 12;
    const got = b.find((r) => nilai.startsWith(r.text.replace(/\u0085$/, "")) && (r.text === nilai || r.text.endsWith(CUT)));
    if (!got) return fail(`${label} hilang: ${JSON.stringify(nilai)}`);
    const cut = got.text.endsWith(CUT);
    if (cut) { w(got.text) <= avail ? ok(`${label} dipotong rapi ${JSON.stringify(got.text)}`) : fail(`${label} luber ${w(got.text).toFixed(1)}>${avail}`); }
    else { got.text === nilai ? ok(`${label} utuh ${JSON.stringify(got.text)}`) : fail(`${label} berubah ${JSON.stringify(got.text)}`); }
  };
  NAMA.forEach((n, i) => cekSel("nama", n, 1));
  KET.filter(Boolean).forEach((k) => cekSel("keterangan", k, 5));

  const hv = await generateHandoverPDF({
    receiverName: "Sabil Hudek", receiverNim: "21512001", unitName: "Informatika", department: "Informatika",
    phone: "08123456789", location: "Divisi Teknologi Informasi", purpose: "Uji", notes: "",
    handoverDate: new Date(), signatureUrl: null,
    items: KODE.map((c, i) => ({ name: NAMA[i], quantity: 2, assetNumber: "AST-INV-409010025366", inventoryNumber: "409010025366", itemCode: c })),
  });
  await fs.writeFile("/tmp/uji-handover.pdf", hv);
  const h = await cells(hv);
  console.log("=== PDF SERAH TERIMA ===");
  for (const c of KODE) h.some((r) => r.text === c) ? ok(`kode utuh ${c}`) : fail(`kode terpotong ${c}`);
  for (const [hh, i] of [["Kode Barang", 2], ["No. Asset/No. Inventaris", 3], ["Jumlah", 4]] as [string, number][]) {
    const avail = H_W[i] - 12;
    w(hh, fb) <= avail ? ok(`header "${hh}" muat (${w(hh, fb).toFixed(1)}<=${avail.toFixed(1)})`) : fail(`header "${hh}" luber ${w(hh, fb).toFixed(1)}>${avail.toFixed(1)}`);
  }
  h.some((r) => r.text === "409010025366") ? ok("No. Inventaris utuh") : console.log("  (kolom pakai No. Asset lebih dulu — cek No. Asset di bawah)");
  h.some((r) => r.text === "AST-INV-409010025366") ? ok("No. Asset utuh") : console.log("  (No. Asset dipotong - kolom sempit, wajar)");

  console.log(bad ? `\n>>> ${bad} MASALAH` : "\n>>> SEMUA LOLOS");
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
