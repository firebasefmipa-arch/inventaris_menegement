import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";

/**
 * Label barang fisik — PDF siap cetak, mengikuti berkas template
 * "Pelabelan Barang-1.docx" milik pemilik produk. Semua angka di LABEL_GEO
 * disalin dari ukuran template (twips → cm), bukan dikira-kira:
 *
 *   kertas     A4 mendatar 29,7 x 21 cm
 *   tabel      17,74 cm, dipusatkan → mulai 5,98 cm dari tepi kiri
 *   kolom      0,50 (kosong) | 8,61 | 0,40 (kosong) | 8,23  cm
 *   tinggi      4,03 / 4,15 / 4,57 cm — baris ke-3 sengaja cuma 1 label
 *              (total 5 label per halaman, sama seperti template)
 *   atas       0,93 cm dari tepi atas kertas
 *   logo       3,10 x 0,84 cm di pojok kiri atas tiap kotak
 *   huruf      Calibri, ukuran TERBESAR 12pt — dikecilkan bertahap (batas bawah
 *              7pt) sampai SEMUA baris muat dalam kotak; satu kotak satu ukuran
 *   garis      seluruh kotak bergaris hitam (setelan "Table Grid" di template)
 *
 * Isi tiap kotak (urut atas→bawah): logo FMIPA · Kode Barang · Nama ·
 * Spesifikasi · Tanggal Cek · Kondisi. Nomor inventaris TIDAK dicetak —
 * di template memang tidak ada (dikonfirmasi 2 Okt 2026).
 *
 * Spesifikasi yang panjang TIDAK dipotong "…" — huruf seluruh kotak dikecilkan
 * supaya jumlah barisnya muat (permintaan pemilik produk, 2 Okt 2026).
 */

export type LabelData = {
  itemCode: string;
  name: string;
  description?: string | null;
  inventoryNumber?: string | null;
  lastCheckDate?: string | null;
  condition?: string | null;
};

const CM = 72 / 2.54;

export const LABEL_GEO = {
  pageW: 29.7 * CM,
  pageH: 21 * CM,
  tableW: 17.74 * CM,
  tableAwal: 0.5 * CM, // kolom kosong tipis di kiri tabel (ada di template)
  colKiri: 8.61 * CM,
  colCelah: 0.4 * CM,
  colKanan: 8.23 * CM,
  atasTabel: 0.927 * CM, // tepi atas kertas → tepi atas tabel
  tinggiBaris: [4.031 * CM, 4.154 * CM, 4.571 * CM],
  perRow: 2,
  perPage: 5,
  padX: 0.15 * CM,
  padY: 0.12 * CM,
  logoW: 3.1 * CM,
  logoH: 0.844 * CM,
  logoGap: 0.06 * CM, // jarak logo ke baris teks pertama
  fontSize: 12,       // ukuran TERBESAR; tiap kotak boleh memakai lebih kecil
  fontMin: 7,         // batas bawah pengecilan huruf
  fontStep: 0.5,      // besar langkah pengecilan (pt)
};

/** Nama huruf di berkas font — Carlito adalah kembaran Calibri (ukuran sama). */
const BERKAS_FONT = "Carlito-Regular.ttf";

/** Potong teks agar muat dalam maxW, tambahkan "…" kalau terpotong. */
export function fitText(text: string, font: PDFFont, size: number, maxW: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxW) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(t + "…", size) > maxW) t = t.slice(0, -1);
  return t + "…";
}

/** Bungkus teks jadi beberapa baris TANPA batas jumlah (tidak ada "…"). */
function wrapSemua(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= maxW) {
      cur = next;
      continue;
    }
    if (cur) lines.push(cur);
    cur = w;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Semua baris satu label pada ukuran huruf tertentu (isi lengkap, tanpa potong). */
function susunIsi(item: LabelData, font: PDFFont, size: number, innerW: number): string[] {
  const bagian = [
    item.itemCode,
    item.name?.trim() ?? "",
    item.description?.trim() ?? "",
    item.lastCheckDate?.trim() ? `Tanggal Cek: ${item.lastCheckDate}` : "",
    item.condition?.trim() ? `Kondisi ${item.condition}` : "",
  ].filter(Boolean);

  // Urutan sama seperti template: kode · nama · spesifikasi · tanggal cek · kondisi.
  // Kode & tanggal & kondisi dipecah juga (bukan dipotong) supaya tidak ada "…"
  // sama sekali selama masih muat.
  return bagian.flatMap((t) => wrapSemua(t, font, size, innerW));
}

type Line = { text: string; size: number; font: PDFFont; width: number };

/**
 * Susun baris teks satu label.
 *
 * Ukuran huruf dikecilkan bertahap (12 → 7pt) sampai SELURUH isi muat, baik
 * dari jumlah baris (dihitung dari tinggi yang tersisa pada ukuran ITU) maupun
 * lebar. Satu kotak memakai SATU ukuran seragam — bukan campur. Pemotongan "…"
 * hanya dipakai kalau bahkan ukuran terkecil masih tidak muat (mis. kode
 * barang satu kata yang sangat panjang).
 */
function buildLines(item: LabelData, font: PDFFont, innerW: number, tersisa: number): Line[] {
  const g = LABEL_GEO;

  // Berapa baris yang muat pada ukuran tertentu — huruf lebih kecil, muat lebih
  // banyak. Dipakai untuk menilai apakah isi sudah masuk.
  const dayaTampung = (size: number) => Math.max(1, Math.floor(tersisa / font.heightAtSize(size)));

  let ukuran = g.fontSize;
  for (; ukuran > g.fontMin; ukuran -= g.fontStep) {
    const isi = susunIsi(item, font, ukuran, innerW);
    const muatBaris = isi.length <= dayaTampung(ukuran);
    const muatLebar = isi.every((t) => font.widthOfTextAtSize(t, ukuran) <= innerW);
    if (muatBaris && muatLebar) break;
  }

  let isi = susunIsi(item, font, ukuran, innerW);

  // Kepepet: bahkan pada ukuran terkecil belum muat.
  const maks = dayaTampung(ukuran);
  if (isi.length > maks) isi = isi.slice(0, maks);
  if (isi.some((t) => font.widthOfTextAtSize(t, ukuran) > innerW)) {
    isi = isi.map((t) =>
      font.widthOfTextAtSize(t, ukuran) > innerW ? fitText(t, font, ukuran, innerW) : t
    );
  }

  return isi.map((t) => ({
    text: t,
    size: ukuran,
    font,
    width: Math.min(font.widthOfTextAtSize(t, ukuran), innerW),
  }));
}

export type LabelPlan = {
  item: LabelData;
  page: number;
  cell: { x: number; y: number; w: number; h: number };
  logo: { x: number; y: number; w: number; h: number };
  lines: (Line & { x: number; y: number })[];
  bottom: number; // y terendah yang disentuh teks — harus di atas cell.y + padY
};

/**
 * Hitung posisi semua label. Murni geometri (tanpa menggambar) supaya bisa
 * diperiksa `scripts/check-label-layout.ts`.
 */
export function planLabels(items: LabelData[], font: PDFFont): LabelPlan[] {
  const g = LABEL_GEO;
  const tabelX = (g.pageW - g.tableW) / 2;
  const kolomX = [tabelX + g.tableAwal, tabelX + g.tableAwal + g.colKiri + g.colCelah];
  const kolomW = [g.colKiri, g.colKanan];

  return items.map((item, i) => {
    const onPage = i % g.perPage;
    const row = Math.floor(onPage / g.perRow);
    const col = onPage % g.perRow;

    const w = kolomW[col];
    const h = g.tinggiBaris[row];
    let yTop = g.pageH - g.atasTabel;
    for (let r = 0; r < row; r++) yTop -= g.tinggiBaris[r];
    const cell = { x: kolomX[col], y: yTop - h, w, h };

    const logo = {
      x: cell.x + g.padX,
      y: cell.y + h - g.padY - g.logoH,
      w: g.logoW,
      h: g.logoH,
    };

    // Tinggi yang tersisa untuk teks (di bawah logo, di atas garis kotak).
    const tersisa = h - g.padY * 2 - g.logoH - g.logoGap;

    const innerW = w - g.padX * 2;
    const lines = buildLines(item, font, innerW, tersisa);

    // Jarak antar baris mengikuti ukuran huruf kotak ini (kotak yang hurufnya
    // dikecilkan juga jadi lebih rapat, tidak menyisakan celah menganga).
    const lineAdvance = font.heightAtSize(lines[0]?.size ?? g.fontSize);

    let cursor = logo.y - g.logoGap;
    const placed = lines.map((l) => {
      cursor -= lineAdvance;
      return { ...l, x: cell.x + g.padX, y: cursor };
    });

    return { item, page: Math.floor(i / g.perPage), cell, logo, lines: placed, bottom: cursor };
  });
}

/** Huruf label: Calibri (berkas Carlito). Kalau hilang, jatuh ke Helvetica. */
export async function muatFontLabel(doc: PDFDocument): Promise<PDFFont> {
  try {
    const bytes = fs.readFileSync(path.join(process.cwd(), "assets", "fonts", BERKAS_FONT));
    doc.registerFontkit(fontkit);
    // subset: false — dengan subset: true, huruf-huruf di PDF tampil rusak
    // (teks bisa disalin tapi bentuknya berantakan saat dilihat/dicetak).
    // Berkas penuh 613 KB masih wajar untuk label.
    return await doc.embedFont(bytes, { subset: false });
  } catch {
    return doc.embedFont(StandardFonts.Helvetica);
  }
}

/** Logo FMIPA untuk label. Kalau berkas hilang, label tetap dicetak tanpa logo. */
function readLogo(): Buffer | null {
  try {
    return fs.readFileSync(path.join(process.cwd(), "public", "fmipa-logo.png"));
  } catch {
    return null;
  }
}

/** Bangun PDF label. `items` sudah harus punya itemCode. */
export async function generateLabelsPDF(items: LabelData[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await muatFontLabel(doc);

  const plans = planLabels(items, font);
  const logoBytes = readLogo();
  const logoImg = logoBytes ? await doc.embedPng(logoBytes) : null;

  const pages = Math.max(1, Math.ceil(items.length / LABEL_GEO.perPage));
  for (let p = 0; p < pages; p++) {
    const page = doc.addPage([LABEL_GEO.pageW, LABEL_GEO.pageH]);
    for (const plan of plans.filter((x) => x.page === p)) {
      // Garis kotak tiap label — di template semua sel bergaris (Table Grid).
      page.drawRectangle({
        x: plan.cell.x,
        y: plan.cell.y,
        width: plan.cell.w,
        height: plan.cell.h,
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.5,
      });

      if (logoImg) {
        page.drawImage(logoImg, {
          x: plan.logo.x,
          y: plan.logo.y,
          width: plan.logo.w,
          height: plan.logo.h,
        });
      }

      for (const l of plan.lines) {
        page.drawText(l.text, {
          x: l.x,
          y: l.y,
          size: l.size,
          font: l.font,
          color: rgb(0, 0, 0),
        });
      }
    }
  }

  return doc.save();
}
