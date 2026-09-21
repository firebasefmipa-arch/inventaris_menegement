import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";

/**
 * Label barang fisik — PDF siap cetak, mengikuti template "Pelabelan Barang":
 * A4 landscape, 2 kolom x 3 baris, maksimum 5 label per halaman
 * (baris terakhir sengaja cuma 1 label, sama seperti template).
 *
 * Bilah teks per label (urut dari atas):
 *   Kode Barang · Nama · Spesifikasi · [No. Inventaris] · Tanggal Cek · Kondisi
 * Baris dalam [] hanya muncul kalau datanya ada.
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
  pageW: 29.7 * CM, // A4 landscape
  pageH: 21 * CM,
  margin: 2.54 * CM,
  colGap: 20,
  rowGap: 10,
  perRow: 2,
  perPage: 5,
  padX: 10,
  padY: 9,
  logoW: 87.75,
  logoH: 23.93,
  sizeKode: 12,
  sizeNama: 12,
  sizeSpesifikasi: 11,
  sizeKecil: 10,
};

type Fonts = { regular: PDFFont; bold: PDFFont };

/** Potong teks agar muat dalam maxW, tambahkan "…" kalau terpotong. */
export function fitText(text: string, font: PDFFont, size: number, maxW: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxW) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(t + "…", size) > maxW) t = t.slice(0, -1);
  return t + "…";
}

/** Bungkus teks jadi beberapa baris, maksimum maxLines (baris terakhir dipotong). */
function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxW: number,
  maxLines: number
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let cur = "";
  let truncated = false;

  for (let i = 0; i < words.length; i++) {
    const next = cur ? `${cur} ${words[i]}` : words[i];
    if (font.widthOfTextAtSize(next, size) <= maxW) {
      cur = next;
      continue;
    }
    if (cur) lines.push(cur);
    cur = words[i];
    if (lines.length === maxLines) {
      truncated = true;
      break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);

  if (lines.length === maxLines && (truncated || cur)) {
    // masih ada kata tersisa → tandai terpotong
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = last === cur && !truncated
      ? fitText(last, font, size, maxW)
      : fitText(`${last} …`, font, size, maxW);
  }
  return lines.slice(0, maxLines);
}

type Line = { text: string; size: number; font: PDFFont; width: number };

/** Susun baris teks satu label (belum ada koordinat). */
function buildLines(item: LabelData, fonts: Fonts, innerW: number, firstW: number): Line[] {
  const out: Line[] = [];
  const add = (text: string, size: number, font: PDFFont, width: number) => {
    const w = font.widthOfTextAtSize(text, size);
    out.push({ text, size, font, width: Math.min(w, width) });
  };

  // Baris 1: kode barang (satu baris, dipotong kalau perlu, tidak boleh kena logo)
  add(fitText(item.itemCode, fonts.bold, LABEL_GEO.sizeKode, firstW), LABEL_GEO.sizeKode, fonts.bold, firstW);

  // Nama barang — maksimum 2 baris
  for (const l of wrapText(item.name, fonts.regular, LABEL_GEO.sizeNama, innerW, 2)) {
    add(l, LABEL_GEO.sizeNama, fonts.regular, innerW);
  }

  // Spesifikasi — maksimum 2 baris
  if (item.description?.trim()) {
    for (const l of wrapText(item.description, fonts.regular, LABEL_GEO.sizeSpesifikasi, innerW, 2)) {
      add(l, LABEL_GEO.sizeSpesifikasi, fonts.regular, innerW);
    }
  }

  // Nomor inventaris — hanya kalau ada
  if (item.inventoryNumber?.trim()) {
    add(
      fitText(`No. Inventaris: ${item.inventoryNumber}`, fonts.regular, LABEL_GEO.sizeKecil, innerW),
      LABEL_GEO.sizeKecil,
      fonts.regular,
      innerW
    );
  }

  if (item.lastCheckDate?.trim()) {
    add(
      fitText(`Tanggal Cek: ${item.lastCheckDate}`, fonts.regular, LABEL_GEO.sizeKecil, innerW),
      LABEL_GEO.sizeKecil,
      fonts.regular,
      innerW
    );
  }

  if (item.condition?.trim()) {
    add(
      fitText(`Kondisi ${item.condition}`, fonts.regular, LABEL_GEO.sizeKecil, innerW),
      LABEL_GEO.sizeKecil,
      fonts.regular,
      innerW
    );
  }

  return out;
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
export function planLabels(items: LabelData[], fonts: Fonts): LabelPlan[] {
  const g = LABEL_GEO;
  const gridW = g.pageW - g.margin * 2;
  const gridH = g.pageH - g.margin * 2;
  const cellW = (gridW - g.colGap * (g.perRow - 1)) / g.perRow;
  const cellH = (gridH - g.rowGap * 2) / 3;
  const innerW = cellW - g.padX * 2;
  const firstW = innerW - g.logoW - 6; // baris kode tidak boleh menabrak logo

  return items.map((item, i) => {
    const onPage = i % g.perPage;
    const row = Math.floor(onPage / g.perRow);
    const col = onPage % g.perRow;

    const x = g.margin + col * (cellW + g.colGap);
    const yTop = g.pageH - g.margin - row * (cellH + g.rowGap);
    const cell = { x, y: yTop - cellH, w: cellW, h: cellH };

    const logo = {
      x: cell.x + cellW - g.padX - g.logoW,
      y: cell.y + cellH - g.padY - g.logoH,
      w: g.logoW,
      h: g.logoH,
    };

    const lines = buildLines(item, fonts, innerW, firstW);

    let cursor = cell.y + cellH - g.padY;
    const placed = lines.map((l) => {
      cursor -= l.size + 2;
      return { ...l, x: cell.x + g.padX, y: cursor };
    });

    return { item, page: Math.floor(i / g.perPage), cell, logo, lines: placed, bottom: cursor };
  });
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
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };

  const plans = planLabels(items, fonts);
  const logoBytes = readLogo();
  const logoImg = logoBytes ? await doc.embedPng(logoBytes) : null;

  const pages = Math.max(1, Math.ceil(items.length / LABEL_GEO.perPage));
  for (let p = 0; p < pages; p++) {
    const page = doc.addPage([LABEL_GEO.pageW, LABEL_GEO.pageH]);
    for (const plan of plans.filter((x) => x.page === p)) {
      // Garis potong tipis (bukan bagian dari template, tapi memudahkan gunting)
      page.drawRectangle({
        x: plan.cell.x,
        y: plan.cell.y,
        width: plan.cell.w,
        height: plan.cell.h,
        borderColor: rgb(0.8, 0.8, 0.8),
        borderWidth: 0.5,
        borderDashArray: [2, 3],
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
