/**
 * Uji tata letak label barang. Jalankan: npm run check:label
 *
 * Memeriksa geometri (bukan menggambar) — tiap perhitungan diuji terhadap
 * batas sel, jadi teks panjang/pendek tidak akan meluber keluar label.
 */
import { PDFDocument, StandardFonts, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import {
  LABEL_GEO as G,
  planLabels,
  fitText,
  generateLabelsPDF,
  type LabelData,
} from "@/lib/label-pdf-generator";

/** Baca teks yang benar-benar tertulis di PDF (per halaman). */
async function teksPerHalaman(buf: Uint8Array): Promise<string[][]> {
  const doc = await PDFDocument.load(buf);
  const hasil: string[][] = [];
  for (const p of doc.getPages()) {
    const c = p.node.Contents();
    const streams = (c as any).asArray ? (c as any).asArray() : [c];
    let raw = "";
    for (const s of streams) {
      const obj = doc.context.lookup((s as any).ref ?? s);
      if (obj instanceof PDFRawStream) {
        raw += Buffer.from(decodePDFRawStream(obj).decode()).toString("latin1");
      }
    }
    const re = /1 0 0 1 ([\d.-]+) ([\d.-]+) Tm\s*<([0-9A-Fa-f]*)>\s*Tj/g;
    const baris: string[] = [];
    let m;
    while ((m = re.exec(raw))) {
      // 0x85 adalah byte yang ditulis pdf-lib untuk "…"
      baris.push(Buffer.from(m[3], "hex").toString("latin1").replace(/\u0085/g, "\u2026"));
    }
    hasil.push(baris);
  }
  return hasil;
}

let gagal = 0;
const cek = (label: string, ok: boolean, detail = "") => {
  if (!ok) gagal++;
  console.log(`${ok ? "OK   " : "GAGAL"} ${label}${detail ? `  — ${detail}` : ""}`);
};

async function main() {
  const doc = await PDFDocument.create();
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };

  const EPS = 0.5;
  const penuh: LabelData = {
    itemCode: "FMIPA-TI-2026-001",
    name: "PC Rakitan",
    description: "I7 Gen 12 DDR 4 RAM 8GB SSD NVME 500GB",
    inventoryNumber: "409010025366",
    lastCheckDate: "6 Juli 2026",
    condition: "Baik",
  };

  console.log("=== 1. Jumlah label per halaman & halaman ===");
  for (const [n, harapHalaman] of [[1, 1], [5, 1], [6, 2], [11, 3], [30, 6]] as [number, number][]) {
    const plans = planLabels(Array.from({ length: n }, () => penuh), fonts);
    const halaman = new Set(plans.map((p) => p.page));
    cek(`${n} barang -> ${harapHalaman} halaman`, halaman.size === harapHalaman, `dapat ${halaman.size}`);
  }

  console.log("\n=== 2. Posisi grid (5 label: 2 per baris, 3 baris) ===");
  const p5 = planLabels(Array.from({ length: 5 }, () => penuh), fonts);
  cek("kelimanya di halaman 0", p5.every((p) => p.page === 0));
  cek("2 label di baris pertama", p5.filter((p) => p.cell.y > G.pageH / 2).length === 2);
  const kiri = p5[0].cell;
  const kanan = p5[1].cell;
  cek("label 1 di kolom kiri", Math.abs(kiri.x - G.margin) < EPS);
  cek("label 2 di kolom kanan", kanan.x > kiri.x + kiri.w, `${kanan.x.toFixed(1)} > ${(kiri.x + kiri.w).toFixed(1)}`);
  cek("label 3 pindah baris", p5[2].cell.y < kiri.y, `${p5[2].cell.y.toFixed(1)} < ${kiri.y.toFixed(1)}`);
  cek("label 3 kembali ke kolom kiri", Math.abs(p5[2].cell.x - G.margin) < EPS);

  console.log("\n=== 3. Semua sel di dalam area cetak (margin terhormat) ===");
  const semua = planLabels(Array.from({ length: 30 }, () => penuh), fonts);
  cek("tidak ada sel keluar kiri", semua.every((p) => p.cell.x >= G.margin - EPS));
  cek("tidak ada sel keluar kanan", semua.every((p) => p.cell.x + p.cell.w <= G.pageW - G.margin + EPS));
  cek("tidak ada sel keluar atas", semua.every((p) => p.cell.y + p.cell.h <= G.pageH - G.margin + EPS));
  cek("tidak ada sel keluar bawah", semua.every((p) => p.cell.y >= G.margin - EPS));

  console.log("\n=== 4. Teks tidak keluar sel & tidak tumpah ke baris bawah ===");
  const cekDalam = (nama: string, items: LabelData[]) => {
    const plans = planLabels(items, fonts);
    let maxKanan = 0;
    let minBawah = Infinity;
    for (const p of plans) {
      for (const l of p.lines) {
        maxKanan = Math.max(maxKanan, l.x + l.width);
        if (l.x + l.width > p.cell.x + p.cell.w - G.padX + EPS) {
          cek(`${nama}: "${l.text.slice(0, 30)}" tidak keluar kanan`, false, `kanan ${(l.x + l.width).toFixed(1)} > ${(p.cell.x + p.cell.w - G.padX).toFixed(1)}`);
          return;
        }
      }
      minBawah = Math.min(minBawah, p.bottom);
      if (p.bottom < p.cell.y + G.padY - EPS) {
        cek(`${nama}: teks tidak tumpah ke bawah`, false, `dasar ${p.bottom.toFixed(1)} < ${(p.cell.y + G.padY).toFixed(1)}`);
        return;
      }
    }
    cek(`${nama}: teks muat (kanan maks ${maxKanan.toFixed(1)}, dasar min ${minBawah.toFixed(1)})`, true);
  };

  cekDalam("data lengkap", [penuh]);
  cekDalam("nama sangat panjang", [{
    ...penuh,
    name: "Proyektor Epson EB-X51 LCD 3600 Lumens XGA dengan Remote dan Tas Jinjing",
  }]);
  cekDalam("spesifikasi sangat panjang", [{
    ...penuh,
    description: "Intel Core i7-12700 12th Gen, DDR4 8GB 3200MHz, SSD NVMe 500GB, VGA Onboard, PSU 500W 80+ Bronze, Casing Mid Tower dengan 3 Fan RGB",
  }]);
  cekDalam("kode sangat panjang", [{
    ...penuh,
    itemCode: "FMIPA-LABORATORIUM-RISET-KIMIA-2026-999",
  }]);
  cekDalam("semua field maksimum", [{
    itemCode: "FMIPA-LABORATORIUM-RISET-KIMIA-2026-999",
    name: "Proyektor Epson EB-X51 LCD 3600 Lumens XGA dengan Remote dan Tas Jinjing",
    description: "Intel Core i7-12700 12th Gen, DDR4 8GB 3200MHz, SSD NVMe 500GB, VGA Onboard, PSU 500W 80+ Bronze, Casing Mid Tower dengan 3 Fan RGB",
    inventoryNumber: "409010025366-EXTRA-PANJANG-SEKALI",
    lastCheckDate: "6 Juli 2026",
    condition: "Rusak Ringan, Perlu Servis",
  }]);

  console.log("\n=== 5. Logo di pojok kiri atas & tidak ditabrak teks ===");
  const plansKode = planLabels(Array.from({ length: 30 }, () => penuh), fonts);
  cek("logo menempel kiri sel", plansKode.every((p) => Math.abs(p.logo.x - (p.cell.x + G.padX)) < EPS));
  cek("logo di sisi ATAS sel (bukan kanan)",
    plansKode.every((p) => p.logo.x < p.cell.x + p.cell.w / 2),
    `logo.x ${plansKode[0].logo.x.toFixed(1)} vs tengah sel ${(plansKode[0].cell.x + plansKode[0].cell.w / 2).toFixed(1)}`);
  cek("logo menempel atas sel",
    plansKode.every((p) => Math.abs((p.logo.y + p.logo.h) - (p.cell.y + p.cell.h - G.padY)) < EPS));

  // Semua teks harus MULAI di bawah logo
  const diBawahLogo = plansKode.every((p) => p.lines.every((l) => l.y + l.size <= p.logo.y + EPS));
  cek("semua baris teks di bawah logo", diBawahLogo,
    `baris teratas y+size ${(plansKode[0].lines[0].y + plansKode[0].lines[0].size).toFixed(1)} vs dasar logo ${plansKode[0].logo.y.toFixed(1)}`);
  cek("baris kode selebar isi sel (tidak lagi dipotong karena logo)",
    plansKode.every((p) => p.lines[0].width <= p.cell.w - G.padX * 2 + EPS));
  cek("logo di dalam sel", plansKode.every((p) =>
    p.logo.x >= p.cell.x && p.logo.x + p.logo.w <= p.cell.x + p.cell.w &&
    p.logo.y >= p.cell.y && p.logo.y + p.logo.h <= p.cell.y + p.cell.h
  ));

  console.log("\n=== 6. Baris opsional hanya muncul kalau datanya ada ===");
  const tanpaInv = planLabels([{ ...penuh, inventoryNumber: null }], fonts)[0];
  cek("tanpa No. Inventaris -> 5 baris", tanpaInv.lines.length === 5, `dapat ${tanpaInv.lines.length}`);
  cek("tanpa No. Inventaris -> tidak ada teks 'No. Inventaris'",
    !tanpaInv.lines.some((l) => l.text.includes("No. Inventaris")));
  const lengkap = planLabels([penuh], fonts)[0];
  cek("dengan No. Inventaris -> 6 baris", lengkap.lines.length === 6, `dapat ${lengkap.lines.length}`);
  cek("label pengganti: 'Kondisi Baik'", lengkap.lines.at(-1)!.text === "Kondisi Baik");
  cek("'Tanggal Cek:' dengan titik dua", lengkap.lines.at(-2)!.text === "Tanggal Cek: 6 Juli 2026");

  console.log("\n=== 7. Data kosong tidak meledak ===");
  const kosong = planLabels([{ itemCode: "FMIPA-TI-2026-001", name: "Barang" }], fonts)[0];
  cek("hanya kode + nama -> 2 baris", kosong.lines.length === 2, `dapat ${kosong.lines.length}`);
  const spasi = planLabels([{ itemCode: "FMIPA-TI-2026-001", name: "  ", description: "   ", condition: "" }], fonts)[0];
  cek("field berisi spasi diabaikan", spasi.lines.length === 1, `dapat ${spasi.lines.length}`);

  console.log("\n=== 8. Pemotongan teks ===");
  const panjang = "FMIPA-LABORATORIUM-RISET-KIMIA-2026-999-YANG-SANGAT-PANJANG-SEKALI";
  const f = fitText(panjang, fonts.bold, G.sizeKode, 200);
  cek("teks panjang dipotong", f.endsWith("…") && f.length < panjang.length, `"${f}"`);
  cek("hasil potongan muat", fonts.bold.widthOfTextAtSize(f, G.sizeKode) <= 200);
  cek("teks pendek tidak diubah", fitText("FMIPA-TI-2026-001", fonts.bold, G.sizeKode, 200) === "FMIPA-TI-2026-001");

  console.log("\n=== 9. Geometri halaman ===");
  cek("A4 landscape (29.7 x 21 cm)", Math.abs(G.pageW - 841.89) < 0.5 && Math.abs(G.pageH - 595.28) < 0.5,
    `${G.pageW.toFixed(2)} x ${G.pageH.toFixed(2)} pt`);
  cek("5 label per halaman", G.perPage === 5);

  console.log("\n=== 10. PDF nyata: isi & halaman ===");
  const data = [
    { ...penuh },
    { itemCode: "FMIPA-LRK-2026-001", name: "Monitor LG", description: "port VGA", lastCheckDate: "6 Juli 2026", condition: "Baik" },
    { itemCode: "FMIPA-KEU-2026-007", name: "Proyektor Epson EB-X51", description: "Lampu 3600 lumens", inventoryNumber: "409010025999", lastCheckDate: "18 September 2026", condition: "Rusak Ringan" },
    { itemCode: "FMIPA-OSCE-2026-012", name: "Kursi Roda", description: "Stainless, lipat", lastCheckDate: "1 Januari 2026", condition: "Baik" },
    { itemCode: "FMIPA-DEK-2026-003", name: "Lemari Arsip", description: "Besi, 4 pintu", condition: "Baik" },
    { itemCode: "FMIPA-FAR-2026-021", name: "Mikroskop Binokuler", description: "Perbesaran 1000x", inventoryNumber: "409010030001", lastCheckDate: "20 September 2026", condition: "Baik" },
  ];
  const pdf = await generateLabelsPDF(data);
  const halaman = await teksPerHalaman(pdf);
  cek("6 label -> 2 halaman", halaman.length === 2, `dapat ${halaman.length}`);

  const teksSemua = halaman.flat();
  for (const w of ["FMIPA-TI-2026-001", "PC Rakitan", "Kondisi Baik", "Mikroskop Binokuler", "FMIPA-FAR-2026-021"]) {
    cek(`tertulis di PDF: ${w}`, teksSemua.some((b) => b.includes(w)));
  }
  const nInv = teksSemua.filter((b) => b.startsWith("No. Inventaris")).length;
  cek("hanya 3 baris 'No. Inventaris' (yang punya saja)", nInv === 3, `dapat ${nInv}`);
  cek("label ke-6 di halaman 2", halaman[1].some((b) => b.includes("Mikroskop")));
  cek("halaman 2 tidak memuat label ke-1", !halaman[1].some((b) => b.includes("FMIPA-TI-2026-001")));
  cek("baris 'Kondisi' lengkap", teksSemua.filter((b) => b.startsWith("Kondisi ")).length === 6);
  cek("'Tanggal Cek:' pakai titik dua", teksSemua.some((b) => b.startsWith("Tanggal Cek: ")));

  // 1 label tetap 1 halaman
  const satu = await teksPerHalaman(await generateLabelsPDF([penuh]));
  cek("1 label -> 1 halaman", satu.length === 1);
  cek("1 label: hanya 6 baris teks", satu[0].length === 6, `dapat ${satu[0].length}`);

  console.log(gagal ? `\n>>> ${gagal} GAGAL` : "\n>>> SEMUA LOLOS");
  process.exit(gagal ? 1 : 0);
}

main().catch((e) => {
  console.error("ERR:", e);
  process.exit(1);
});
