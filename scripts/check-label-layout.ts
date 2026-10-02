/**
 * Uji tata letak label barang. Jalankan: npm run check:label
 *
 * Angka pembanding diambil dari berkas template milik pemilik produk
 * ("Pelabelan Barang-1.docx"), ditulis harfiah di sini sebagai patokan:
 * tabel 17,74 cm dipusatkan · kolom 0,50/8,61/0,40/8,23 cm ·
 * tinggi baris 4,03/4,15/4,57 cm · mulai 0,93 cm dari tepi atas ·
 * semua huruf 12pt Calibri · logo 3,10 x 0,84 cm · isi = kode, nama,
 * spesifikasi, tanggal cek, kondisi (TANPA nomor inventaris).
 *
 * Kalau ada yang mengubah LABEL_GEO tanpa menyesuaikan template, uji ini gagal.
 */
import { PDFDocument, PDFRawStream, PDFDict, PDFName, decodePDFRawStream } from "pdf-lib";
import {
  LABEL_GEO as G,
  planLabels,
  fitText,
  generateLabelsPDF,
  muatFontLabel,
  type LabelData,
} from "@/lib/label-pdf-generator";

/** Hitung operator Tj (perintah "tulis teks") di seluruh halaman PDF. */
async function jumlahTeksTertulis(buf: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(buf);
  const hasil: number[] = [];
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
    hasil.push((raw.match(/\bTj\b/g) ?? []).length);
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
  const font = await muatFontLabel(doc);
  const namaFont = String((font as any).name ?? "?");

  const CM = 72 / 2.54;
  const EPS = 0.5;
  const cm = (pt: number) => pt / CM;

  const penuh: LabelData = {
    itemCode: "FMIPA-TI-2026-001",
    name: "PC Rakitan",
    description: "I7 Gen 12 DDR 4 RAM 8GB SSD NVME 500GB",
    inventoryNumber: "409010025366",
    lastCheckDate: "6 Juli 2026",
    condition: "Baik",
  };

  console.log("=== 1. Huruf: Calibri (berkas Carlito) ===");
  cek("huruf label = Calibri", /Carlito|Calibri/i.test(namaFont), `dimuat: ${namaFont}`);
  cek("ukuran semua baris 12pt", G.fontSize === 12, `${G.fontSize}pt`);

  console.log("\n=== 2. Angka geometri sama dengan template (satuan cm) ===");
  cek("lebar tabel 17,74 cm", Math.abs(cm(G.tableW) - 17.74) < 0.01, `${cm(G.tableW).toFixed(2)}`);
  cek("kolom 1 = 8,61 cm", Math.abs(cm(G.colKiri) - 8.61) < 0.01, `${cm(G.colKiri).toFixed(2)}`);
  cek("celah antar kolom = 0,40 cm", Math.abs(cm(G.colCelah) - 0.4) < 0.01, `${cm(G.colCelah).toFixed(2)}`);
  cek("kolom 2 = 8,23 cm", Math.abs(cm(G.colKanan) - 8.23) < 0.01, `${cm(G.colKanan).toFixed(2)}`);
  cek("lebar 4 kolom = lebar tabel",
    Math.abs((G.tableAwal + G.colKiri + G.colCelah + G.colKanan) - G.tableW) < EPS,
    `${cm(G.tableAwal + G.colKiri + G.colCelah + G.colKanan).toFixed(2)}cm`);
  cek("tabel mulai 0,93 cm dari tepi atas", Math.abs(cm(G.atasTabel) - 0.93) < 0.01, `${cm(G.atasTabel).toFixed(2)}`);
  cek("tinggi baris 4,03 / 4,15 / 4,57 cm",
    Math.abs(cm(G.tinggiBaris[0]) - 4.03) < 0.01 &&
    Math.abs(cm(G.tinggiBaris[1]) - 4.15) < 0.02 &&
    Math.abs(cm(G.tinggiBaris[2]) - 4.57) < 0.01,
    G.tinggiBaris.map((t) => cm(t).toFixed(2)).join(" / "));
  cek("logo 3,10 x 0,84 cm",
    Math.abs(cm(G.logoW) - 3.1) < 0.01 && Math.abs(cm(G.logoH) - 0.844) < 0.01,
    `${cm(G.logoW).toFixed(2)} x ${cm(G.logoH).toFixed(2)}`);
  cek("A4 mendatar (29,7 x 21 cm)", Math.abs(G.pageW - 841.89) < 0.5 && Math.abs(G.pageH - 595.28) < 0.5,
    `${G.pageW.toFixed(2)} x ${G.pageH.toFixed(2)} pt`);
  cek("5 label per halaman", G.perPage === 5);

  console.log("\n=== 3. Tabel dipusatkan & susunan baris seperti template ===");
  const p5 = planLabels(Array.from({ length: 5 }, () => penuh), font);
  const kiri = p5[0].cell;
  const kanan = p5[1].cell;
  const sisaKiri = kiri.x - G.tableAwal;
  const sisaKanan = G.pageW - (kanan.x + kanan.w);
  cek("tabel dipusatkan (sisa kiri = sisa kanan)",
    Math.abs(sisaKiri - sisaKanan) < 0.02, `kiri ${cm(sisaKiri).toFixed(2)}cm, kanan ${cm(sisaKanan).toFixed(2)}cm`);
  cek("sisa pinggir = (29,7 − 17,74)/2 = 5,98 cm",
    Math.abs(cm(sisaKiri) - 5.98) < 0.02, `${cm(sisaKiri).toFixed(2)}cm`);
  cek("jarak kolom kiri→kanan = kolom1 + celah",
    Math.abs((kanan.x - kiri.x) - (G.colKiri + G.colCelah)) < EPS);
  cek("3 baris bertingkat ke bawah (atas→tengah→bawah)",
    p5[0].cell.y > p5[2].cell.y && p5[2].cell.y > p5[4].cell.y,
    `baris1 ${cm(p5[0].cell.y).toFixed(2)} > baris2 ${cm(p5[2].cell.y).toFixed(2)} > baris3 ${cm(p5[4].cell.y).toFixed(2)}`);
  cek("pasangan kiri-kanan sebaris", Math.abs(p5[0].cell.y - p5[1].cell.y) < EPS && Math.abs(p5[2].cell.y - p5[3].cell.y) < EPS);
  cek("label 3 kembali ke kolom kiri", Math.abs(p5[2].cell.x - kiri.x) < EPS);
  cek("baris 3 hanya 1 label (seperti template)", p5[4].cell.x === kiri.x);
  cek("lebar kotak = lebar kolom", Math.abs(kiri.w - G.colKiri) < EPS && Math.abs(kanan.w - G.colKanan) < EPS);
  cek("tinggi kotak = tinggi baris template",
    Math.abs(p5[0].cell.h - G.tinggiBaris[0]) < EPS && Math.abs(p5[4].cell.h - G.tinggiBaris[2]) < EPS);

  console.log("\n=== 4. Jumlah label & halaman ===");
  for (const [n, harapHalaman] of [[1, 1], [5, 1], [6, 2], [11, 3], [30, 6]] as [number, number][]) {
    const plans = planLabels(Array.from({ length: n }, () => penuh), font);
    const halaman = new Set(plans.map((p) => p.page));
    cek(`${n} barang -> ${harapHalaman} halaman`, halaman.size === harapHalaman, `dapat ${halaman.size}`);
  }

  console.log("\n=== 5. Label tetap di dalam kertas ===");
  const semua = planLabels(Array.from({ length: 30 }, () => penuh), font);
  cek("tidak ada sel keluar kiri", semua.every((p) => p.cell.x >= -EPS));
  cek("tidak ada sel keluar kanan", semua.every((p) => p.cell.x + p.cell.w <= G.pageW + EPS));
  cek("tidak ada sel keluar atas", semua.every((p) => p.cell.y + p.cell.h <= G.pageH + EPS));
  cek("tidak ada sel keluar bawah", semua.every((p) => p.cell.y >= -EPS));

  console.log("\n=== 6. Teks tidak keluar kotak & tidak tumpah ke label bawah ===");
  const cekDalam = (nama: string, items: LabelData[]) => {
    const plans = planLabels(items, font);
    let maxKanan = 0;
    let minBawah = Infinity;
    for (const p of plans) {
      for (const l of p.lines) {
        maxKanan = Math.max(maxKanan, l.x + l.width);
        if (l.x + l.width > p.cell.x + p.cell.w + EPS) {
          cek(`${nama}: "${l.text.slice(0, 28)}" tidak keluar kanan`, false,
            `kanan ${cm(l.x + l.width).toFixed(2)}cm > ${cm(p.cell.x + p.cell.w).toFixed(2)}cm`);
          return;
        }
      }
      minBawah = Math.min(minBawah, p.bottom);
      if (p.bottom < p.cell.y) {
        cek(`${nama}: teks tidak tumpah ke bawah`, false,
          `dasar ${cm(p.bottom).toFixed(2)}cm < ${cm(p.cell.y).toFixed(2)}cm`);
        return;
      }
    }
    cek(`${nama}: teks muat`, true, `kanan ≤ ${cm(maxKanan).toFixed(2)}cm, dasar ${cm(minBawah).toFixed(2)}cm`);
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
  cekDalam("kode sangat panjang", [{ ...penuh, itemCode: "FMIPA-LABORATORIUM-RISET-KIMIA-2026-999" }]);
  cekDalam("semua isian maksimum", [{
    itemCode: "FMIPA-LABORATORIUM-RISET-KIMIA-2026-999",
    name: "Proyektor Epson EB-X51 LCD 3600 Lumens XGA dengan Remote dan Tas Jinjing",
    description: "Intel Core i7-12700 12th Gen, DDR4 8GB 3200MHz, SSD NVMe 500GB, VGA Onboard, PSU 500W 80+ Bronze, Casing Mid Tower dengan 3 Fan RGB",
    lastCheckDate: "18 September 2026",
    condition: "Rusak Ringan, Perlu Servis",
  }]);

  console.log("\n=== 7. Logo di pojok kiri atas & tidak ditabrak teks ===");
  const plansKode = planLabels(Array.from({ length: 30 }, () => penuh), font);
  cek("logo menempel kiri kotak", plansKode.every((p) => Math.abs(p.logo.x - (p.cell.x + G.padX)) < EPS));
  cek("logo di sisi atas kotak", plansKode.every((p) => p.logo.x < p.cell.x + p.cell.w / 2));
  cek("logo menempel atas kotak",
    plansKode.every((p) => Math.abs((p.logo.y + p.logo.h) - (p.cell.y + p.cell.h - G.padY)) < EPS));
  cek("semua baris teks di bawah logo",
    plansKode.every((p) => p.lines.every((l) => l.y + l.size <= p.logo.y + EPS)));
  cek("logo di dalam kotak", plansKode.every((p) =>
    p.logo.x >= p.cell.x && p.logo.x + p.logo.w <= p.cell.x + p.cell.w &&
    p.logo.y >= p.cell.y && p.logo.y + p.logo.h <= p.cell.y + p.cell.h
  ));

  console.log("\n=== 8. Isi label = urutan di template ===");
  const lengkap = planLabels([penuh], font)[0];
  const teks = lengkap.lines.map((l) => l.text);
  cek("baris pertama = kode barang", teks[0] === "FMIPA-TI-2026-001", teks[0]);
  cek("lalu nama barang", teks[1] === "PC Rakitan", teks[1]);
  cek("ada spesifikasi", teks.some((t) => t.includes("I7 Gen 12 DDR 4")), teks[2]);
  cek("ada 'Tanggal Cek: …'", teks.some((t) => t === "Tanggal Cek: 6 Juli 2026"));
  cek("ada 'Kondisi …'", teks.some((t) => t === "Kondisi Baik"));
  cek("urutan: kode → nama → spesifikasi → tanggal → kondisi",
    teks.findIndex((t) => t.includes("I7 Gen 12")) < teks.findIndex((t) => t.startsWith("Tanggal Cek:")) &&
    teks.findIndex((t) => t.startsWith("Tanggal Cek:")) < teks.findIndex((t) => t.startsWith("Kondisi ")));
  cek("TIDAK ada baris 'No. Inventaris' (template tidak punya)",
    !teks.some((t) => t.includes("No. Inventaris")));
  cek("tidak ada huruf tebal di label", lengkap.lines.every((l) => l.font === font));

  console.log("\n=== 9. Data kosong tidak meledak ===");
  const kosong = planLabels([{ itemCode: "FMIPA-TI-2026-001", name: "Barang" }], font)[0];
  cek("hanya kode + nama -> 2 baris", kosong.lines.length === 2, `dapat ${kosong.lines.length}`);
  const spasi = planLabels([{ itemCode: "FMIPA-TI-2026-001", name: "  ", description: "   ", condition: "" }], font)[0];
  cek("isian berisi spasi diabaikan", spasi.lines.length === 1, `dapat ${spasi.lines.length}`);

  console.log("\n=== 10. Pemotongan teks ===");
  const panjang = "FMIPA-LABORATORIUM-RISET-KIMIA-2026-999-YANG-SANGAT-PANJANG-SEKALI";
  const f = fitText(panjang, font, G.fontSize, 200);
  cek("teks panjang dipotong", f.endsWith("…") && f.length < panjang.length, `"${f}"`);
  cek("hasil potongan muat", font.widthOfTextAtSize(f, G.fontSize) <= 200);
  cek("teks pendek tidak diubah", fitText("FMIPA-TI-2026-001", font, G.fontSize, 200) === "FMIPA-TI-2026-001");

  console.log("\n=== 11. PDF nyata: halaman, huruf tersemat, jumlah tulisan ===");
  const data: LabelData[] = [
    { ...penuh },
    { itemCode: "FMIPA-LRK-2026-001", name: "Monitor LG", description: "port VGA", lastCheckDate: "6 Juli 2026", condition: "Baik" },
    { itemCode: "FMIPA-KEU-2026-007", name: "Proyektor Epson EB-X51", description: "Lampu 3600 lumens", lastCheckDate: "18 September 2026", condition: "Rusak Ringan" },
    { itemCode: "FMIPA-OSCE-2026-012", name: "Kursi Roda", description: "Stainless, lipat", lastCheckDate: "1 Januari 2026", condition: "Baik" },
    { itemCode: "FMIPA-DEK-2026-003", name: "Lemari Arsip", description: "Besi, 4 pintu", condition: "Baik" },
    { itemCode: "FMIPA-FAR-2026-021", name: "Mikroskop Binokuler", description: "Perbesaran 1000x", lastCheckDate: "20 September 2026", condition: "Baik" },
  ];
  const pdf = await generateLabelsPDF(data);
  const perHalaman = await jumlahTeksTertulis(pdf);
  cek("6 label -> 2 halaman", perHalaman.length === 2, `dapat ${perHalaman.length}`);

  const plans = planLabels(data, font);
  for (const hal of [0, 1]) {
    const perkiraan = plans.filter((p) => p.page === hal).reduce((a, p) => a + p.lines.length, 0);
    cek(`halaman ${hal + 1} menulis tepat sebanyak baris labelnya`, perHalaman[hal] === perkiraan,
      `tertulis ${perHalaman[hal]} vs baris ${perkiraan}`);
  }

  // Huruf benar-benar tersemat: nama huruf dibaca dari objek PDF, bukan dari
  // byte mentah (isi PDF dikompresi di dalam /ObjStm, jadi byte mentah tidak
  // memperlihatkan apa pun). Helvetica bawaan pdf-lib tidak boleh dipakai.
  const docPdf = await PDFDocument.load(pdf);
  const namaHuruf = new Set<string>();
  let berkasHuruf = 0;
  for (const [, obj] of docPdf.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFDict) {
      const bf = obj.get(PDFName.of("BaseFont"));
      if (bf) namaHuruf.add(String(bf));
      if (obj.get(PDFName.of("FontFile2")) || obj.get(PDFName.of("FontFile3"))) berkasHuruf++;
    }
  }
  cek("huruf Calibri tersemat di dalam PDF",
    namaHuruf.size > 0 && [...namaHuruf].every((h) => /Carlito|Calibri/i.test(h)),
    [...namaHuruf].join(", ") || "(kosong)");
  cek("tidak ada Helvetica bawaan tersisa", ![...namaHuruf].some((h) => /Helvetica/i.test(h)));
  cek("berkas huruf ikut tertanam", berkasHuruf > 0, `${berkasHuruf} berkas`);

  const satu = await jumlahTeksTertulis(await generateLabelsPDF([penuh]));
  cek("1 label -> 1 halaman", satu.length === 1, `dapat ${satu.length}`);

  console.log("\n=== 12. Huruf mengecil & baris bertambah supaya TIDAK ada \"…\" ===");
  // Permintaan pemilik produk 2 Okt 2026: spesifikasi panjang jangan dipotong
  // "...", melainkan TAMBAH BARISNYA lalu kecilkan huruf SATU KOTAK itu sampai muat.
  const spekPanjang =
    "Intel Core i7-12700 12th Gen, DDR4 8GB 3200MHz, SSD NVMe 500GB, VGA Onboard, " +
    "PSU 500W 80+ Bronze, Casing Mid Tower dengan 3 Fan RGB";

  const pendek = planLabels([penuh], font)[0];
  const labPanjang = planLabels([{ ...penuh, description: spekPanjang }], font)[0];

  const ukuranKotak = (p: typeof pendek) => new Set(p.lines.map((l) => l.size));
  const semuaKata = (teks: string) => teks.trim().split(/\s+/).filter(Boolean);

  cek("spesifikasi panjang TIDAK memakai \"…\"",
    labPanjang.lines.every((l) => !l.text.includes("…")),
    labPanjang.lines.map((l) => l.text).join(" | "));

  const gabung = labPanjang.lines.map((l) => l.text).join(" ");
  cek("seluruh kata spesifikasi ikut tercetak (tak ada yang hilang)",
    semuaKata(spekPanjang).every((k) => gabung.includes(k)),
    `kata hilang: ${semuaKata(spekPanjang).filter((k) => !gabung.includes(k)).join(", ") || "(tidak ada)"}`);

  cek("barisnya BERTAMBAH dari label biasa (bukan tetap)",
    labPanjang.lines.length > pendek.lines.length,
    `${pendek.lines.length} -> ${labPanjang.lines.length} baris`);

  cek("huruf kotak itu MENGEcil", labPanjang.lines[0].size < G.fontSize,
    `${G.fontSize}pt -> ${labPanjang.lines[0].size}pt`);
  cek("satu kotak satu ukuran huruf (tidak campur)",
    ukuranKotak(labPanjang).size === 1, [...ukuranKotak(labPanjang)].join(", "));
  cek("huruf tidak pernah lebih kecil dari batas bawah (7pt)",
    labPanjang.lines[0].size >= G.fontMin, `${labPanjang.lines[0].size}pt`);
  cek("label pendek tetap 12pt (tidak mengecil tanpa alasan)",
    pendek.lines.every((l) => l.size === G.fontSize),
    `${[...ukuranKotak(pendek)].join(", ")}pt`);

  // Semua isi harus tetap ada walau hurufnya dikecilkan.
  for (const [nama, t] of [
    ["kode", penuh.itemCode],
    ["nama barang", penuh.name],
    ["tanggal cek", `Tanggal Cek: ${penuh.lastCheckDate}`],
    ["kondisi", `Kondisi ${penuh.condition}`],
  ] as [string, string][]) {
    cek(`label panjang tetap memuat ${nama}`,
      t.split(/\s+/).every((k) => gabung.includes(k)), t);
  }

  // Kotak "kepepet": spesifikasi yang bahkan pada 7pt tak muat — tetap tidak
  // boleh memakai "…" untuk spesifikasi selama pemotongan masih bisa dihindari
  // lewat jumlah baris; yang dijamin adalah teksnya tidak keluar kotak.
  const kepepet = planLabels([{
    ...penuh,
    description: Array.from({ length: 40 }, (_, i) => `spesifikasi${i + 1}`).join(" "),
  }], font)[0];
  cek("kotak kepepet: teks tidak keluar kotak",
    kepepet.lines.every((l) => l.x + l.width <= kepepet.cell.x + kepepet.cell.w + EPS),
    `kanan ${cm(Math.max(...kepepet.lines.map((l) => l.x + l.width))).toFixed(2)}cm`);
  cek("kotak kepepet: teks tidak tumpah ke bawah",
    kepepet.bottom >= kepepet.cell.y - EPS,
    `dasar ${cm(kepepet.bottom).toFixed(2)}cm >= ${cm(kepepet.cell.y).toFixed(2)}cm`);

  console.log("\n=== 13. PDF nyata dengan huruf mengecil ===");
  const pdfCampur = await generateLabelsPDF([
    penuh,
    { ...penuh, itemCode: "FMIPA-TI-2026-002", description: spekPanjang },
    { itemCode: "FMIPA-TI-2026-003", name: "PC Rakitan", description: spekPanjang, lastCheckDate: "6 Juli 2026", condition: "Baik" },
  ]);
  const halamanCampur = await jumlahTeksTertulis(pdfCampur);
  cek("3 label campur -> 1 halaman", halamanCampur.length === 1, `dapat ${halamanCampur.length}`);

  const plansCampur = planLabels([
    penuh,
    { ...penuh, itemCode: "FMIPA-TI-2026-002", description: spekPanjang },
    { itemCode: "FMIPA-TI-2026-003", name: "PC Rakitan", description: spekPanjang, lastCheckDate: "6 Juli 2026", condition: "Baik" },
  ], font);
  cek("PDF menulis tepat sebanyak baris yang direncanakan",
    halamanCampur[0] === plansCampur.reduce((a, p) => a + p.lines.length, 0),
    `tertulis ${halamanCampur[0]} vs baris ${plansCampur.reduce((a, p) => a + p.lines.length, 0)}`);

  console.log(gagal ? `\n>>> ${gagal} GAGAL` : "\n>>> SEMUA LOLOS");
  process.exit(gagal ? 1 : 0);
}

main().catch((e) => {
  console.error("ERR:", e);
  process.exit(1);
});
