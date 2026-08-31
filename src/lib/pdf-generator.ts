import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';

interface TransactionData {
  borrowerName: string;
  borrowerId?: string;
  department?: string;
  phone?: string;
  purpose?: string;
  notes?: string;
  borrowDate: Date;
  returnDate: Date;
  signatureUrl?: string | null;
  items: Array<{
    name: string;
    quantity: number;
    inventoryNumber?: string | null;
    notes?: string;
  }>;
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_LEFT = 56;
const MARGIN_RIGHT = 56;
const MARGIN_BOTTOM = 56;
const CONTENT_W = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT;

const cleanNotes = (text?: string) => {
  if (!text) return '';
  return text.replace(/^\[Portal\]\s*/i, '').trim();
};

const formatDate = (date: Date) =>
  date.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

function drawCentered(page: PDFPage, text: string, y: number, font: PDFFont, size: number, color = rgb(0, 0, 0)) {
  const tw = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (PAGE_W - tw) / 2, y, size, font, color });
}

// ── Gambar satu baris tabel (tanpa border luar, border luar ditangani terpisah) ──
function drawTableRow(
  page: PDFPage,
  rowY: number,
  colWidths: number[],
  cells: string[],
  font: PDFFont,
  fontSize: number,
  rowHeight: number,
  isHeader: boolean,
  startX: number,
  lineColor: ReturnType<typeof rgb>
) {
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);

  // Background header
  if (isHeader) {
    page.drawRectangle({
      x: startX,
      y: rowY - rowHeight,
      width: totalWidth,
      height: rowHeight,
      color: rgb(0.93, 0.93, 0.93),
    });
  }

  // Garis atas baris
  page.drawLine({
    start: { x: startX, y: rowY },
    end: { x: startX + totalWidth, y: rowY },
    thickness: isHeader ? 1 : 0.5,
    color: lineColor,
  });

  // Teks tiap sel
  let cellX = startX;
  cells.forEach((cell, cIdx) => {
    const padding = 6;
    const textY = rowY - rowHeight / 2 - fontSize / 3;
    // Center untuk kolom No (0) dan Jumlah (2)
    if (cIdx === 0 || cIdx === 2) {
      const tw = font.widthOfTextAtSize(cell, fontSize);
      page.drawText(cell, { x: cellX + (colWidths[cIdx] - tw) / 2, y: textY, size: fontSize, font, color: rgb(0, 0, 0) });
    } else {
      page.drawText(cell, { x: cellX + padding, y: textY, size: fontSize, font, color: rgb(0, 0, 0) });
    }
    cellX += colWidths[cIdx];
  });

  // Garis vertikal antar kolom
  let vx = startX;
  for (let c = 0; c <= colWidths.length; c++) {
    page.drawLine({
      start: { x: vx, y: rowY },
      end: { x: vx, y: rowY - rowHeight },
      thickness: c === 0 || c === colWidths.length ? 1 : 0.5,
      color: lineColor,
    });
    if (c < colWidths.length) vx += colWidths[c];
  }
}

// ── Gambar garis bawah tabel (penutup) ──
function drawTableBottomLine(
  page: PDFPage,
  y: number,
  startX: number,
  colWidths: number[],
  lineColor: ReturnType<typeof rgb>
) {
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  page.drawLine({
    start: { x: startX, y },
    end: { x: startX + totalWidth, y },
    thickness: 1,
    color: lineColor,
  });
}

// ── Gambar blok footer (tanda tangan + ketentuan) ──
async function drawFooter(
  pdfDoc: PDFDocument,
  page: PDFPage,
  startY: number,
  borrowerName: string,
  borrowDate: Date,
  font: PDFFont,
  boldFont: PDFFont,
  italicFont: PDFFont,
  boldItalicFont: PDFFont,
  signatureUrl?: string | null
) {
  const col1X = MARGIN_LEFT;
  const col2X = MARGIN_LEFT + 190;
  const col3X = PAGE_W - MARGIN_RIGHT - 130;
  const colW = 130;
  let y = startY;

  const centerText = (text: string, colStart: number, width: number, f: PDFFont, size: number, yPos: number) => {
    const tw = f.widthOfTextAtSize(text, size);
    page.drawText(text, { x: colStart + (width - tw) / 2, y: yPos, size, font: f, color: rgb(0, 0, 0) });
  };

  page.drawText('Tanggal kembali:', { x: col1X, y, size: 10, font: boldFont, color: rgb(0, 0, 0) });
  page.drawText(`Yogyakarta, ${formatDate(borrowDate)}`, { x: col3X, y, size: 10, font, color: rgb(0, 0, 0) });

  y -= 14;
  page.drawLine({ start: { x: col1X, y }, end: { x: col1X + 120, y }, thickness: 0.5, color: rgb(0, 0, 0) });

  y -= 24;
  centerText('Yang menyerahkan,', col2X, colW, font, 10, y);
  centerText('Peminjam,', col3X, colW, font, 10, y);

  // Embed TTD gambar jika ada
  if (signatureUrl) {
    try {
      const sigPath = path.join(process.cwd(), 'public', signatureUrl);
      const sigBytes = await fs.readFile(sigPath);
      const ext = path.extname(signatureUrl).toLowerCase();
      let sigImg;
      if (ext === '.png') {
        sigImg = await pdfDoc.embedPng(sigBytes);
      } else {
        sigImg = await pdfDoc.embedJpg(sigBytes);
      }
      const sigDims = sigImg.scaleToFit(colW - 10, 55);
      page.drawImage(sigImg, {
        x: col3X + (colW - sigDims.width) / 2,
        y: y - 60,
        width: sigDims.width,
        height: sigDims.height,
      });
    } catch { /* Jika gagal load TTD, biarkan kosong */ }
  }

  y -= 70;
  page.drawLine({ start: { x: col1X, y: y + 12 }, end: { x: col1X + colW, y: y + 12 }, thickness: 0.5, color: rgb(0, 0, 0) });
  page.drawLine({ start: { x: col2X, y: y + 12 }, end: { x: col2X + colW, y: y + 12 }, thickness: 0.5, color: rgb(0, 0, 0) });

  // Underline nama peminjam sesuai lebar teks
  const nameTw = boldFont.widthOfTextAtSize(borrowerName, 10);
  const nameX = col3X + (colW - nameTw) / 2;
  page.drawLine({ start: { x: nameX, y: y + 12 }, end: { x: nameX + nameTw, y: y + 12 }, thickness: 0.5, color: rgb(0, 0, 0) });

  centerText('Penerima Barang Kembali', col1X, colW, boldFont, 9, y);
  centerText('Divisi Informasi Teknologi', col2X, colW, boldFont, 9, y);
  page.drawText(borrowerName, { x: nameX, y, size: 10, font: boldFont, color: rgb(0, 0, 0) });

  y -= 30;
  page.drawText('Ketentuan Peminjaman:', { x: MARGIN_LEFT, y, size: 9, font: boldItalicFont, color: rgb(0, 0, 0) });

  const disclaimerLines = [
    'Peralatan di atas diterima dalam kondisi baik, dan akan dikembalikan dalam kondisi baik.',
    'Kerusakan atau kehilangan barang/alat yang dipinjam, maka peminjam sanggup mengganti',
    'dengan barang yang sama dalam waktu secepatnya.',
  ];
  disclaimerLines.forEach((line) => {
    y -= 13;
    page.drawText(line, { x: MARGIN_LEFT, y, size: 8, font: italicFont, color: rgb(0, 0, 0) });
  });
}

export async function generateBorrowingPDF(data: TransactionData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();

  const font         = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont     = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italicFont   = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const boldItalicFont = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);

  // ── Halaman pertama ──
  let currentPage = pdfDoc.addPage([PAGE_W, PAGE_H]);

  // ── Logo ──
  let y = PAGE_H - 50;
  try {
    const logoBytes = await fs.readFile(path.join(process.cwd(), 'public', 'fmipa-logo.png'));
    const logoImg   = await pdfDoc.embedPng(logoBytes);
    const dims      = logoImg.scaleToFit(340, 55);
    const logoY     = PAGE_H - 45 - dims.height;
    currentPage.drawImage(logoImg, { x: MARGIN_LEFT, y: logoY, width: dims.width, height: dims.height });
    y = logoY - 8;
  } catch {
    y = PAGE_H - 70;
  }

  // ── Garis bawah logo ──
  currentPage.drawLine({
    start: { x: MARGIN_LEFT, y }, end: { x: PAGE_W - MARGIN_RIGHT, y },
    thickness: 1.5, color: rgb(0.15, 0.3, 0.55),
  });
  y -= 20;

  // ── Judul ──
  drawCentered(currentPage, 'FORMULIR PEMINJAMAN ALAT & BARANG', y, boldFont, 13, rgb(0.1, 0.1, 0.1));
  y -= 16;
  drawCentered(currentPage, 'DIVISI TI FMIPA UII', y, boldFont, 11, rgb(0.25, 0.25, 0.25));
  y -= 30;

  // ── Data peminjam ──
  const labelX = MARGIN_LEFT;
  const colonX = MARGIN_LEFT + 110;
  const valueX = colonX + 12;
  const fieldSpacing = 18;

  const fields: [string, string][] = [
    ['Nama Lengkap',   data.borrowerName || ''],
    ['NIM / NIK',      data.borrowerId   || ''],
    ['Departemen',     data.department   || ''],
    ['No. HP',         data.phone        || ''],
    ['Keperluan',      cleanNotes(data.purpose)],
    ['Tanggal Pinjam', formatDate(data.borrowDate)],
    ['Tanggal Kembali',formatDate(data.returnDate)],
  ];

  fields.forEach(([label, value]) => {
    currentPage.drawText(label, { x: labelX, y, size: 10, font,     color: rgb(0, 0, 0) });
    currentPage.drawText(':',   { x: colonX, y, size: 10, font,     color: rgb(0, 0, 0) });
    currentPage.drawText(value, { x: valueX, y, size: 10, font,     color: rgb(0, 0, 0) });
    y -= fieldSpacing;
  });

  y -= 10;

  // ── Judul tabel ──
  currentPage.drawText('Daftar Barang yang Dipinjam', {
    x: MARGIN_LEFT, y, size: 10, font: boldFont, color: rgb(0, 0, 0),
  });
  y -= 18;

  // ── Setup tabel ──
  const colWidths  = [30, 210, 50, 110, CONTENT_W - 30 - 210 - 50 - 110];
  const rowHeight  = 22;
  const lineColor  = rgb(0, 0, 0);

  // Baris data (minimal 5 baris kosong jika data sedikit)
  const dataRows: string[][] = data.items.map((item, idx) => [
    String(idx + 1),
    item.name,
    String(item.quantity),
    item.inventoryNumber || '',
    item.notes || '',
  ]);
  while (dataRows.length < 5) {
    dataRows.push([String(dataRows.length + 1), '', '', '', '']);
  }

  // ── Tinggi yang dibutuhkan footer ──
  const FOOTER_HEIGHT = 220; // catatan + tanda tangan + ketentuan
  const NOTE_HEIGHT   = 30;

  // ── Render header tabel ──
  drawTableRow(currentPage, y, colWidths, ['No', 'Nama Alat/Barang', 'Jumlah', 'No. Inventaris', 'Keterangan'],
    boldFont, 9, rowHeight, true, MARGIN_LEFT, lineColor);
  y -= rowHeight;

  // ── Render baris data satu per satu, buat halaman baru jika perlu ──
  for (let i = 0; i < dataRows.length; i++) {
    const isLastRow = i === dataRows.length - 1;
    // Hitung ruang yang dibutuhkan: baris ini + (kalau terakhir: garis bawah + catatan + footer)
    const spaceNeeded = rowHeight + (isLastRow ? NOTE_HEIGHT + FOOTER_HEIGHT : 0);

    if (y - spaceNeeded < MARGIN_BOTTOM) {
      // Tutup tabel di halaman ini dengan garis bawah
      drawTableBottomLine(currentPage, y, MARGIN_LEFT, colWidths, lineColor);

      // Buat halaman baru
      currentPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN_BOTTOM;

      // Ulangi header tabel di halaman baru
      drawTableRow(currentPage, y, colWidths, ['No', 'Nama Alat/Barang', 'Jumlah', 'No. Inventaris', 'Keterangan'],
        boldFont, 9, rowHeight, true, MARGIN_LEFT, lineColor);
      y -= rowHeight;
    }

    drawTableRow(currentPage, y, colWidths, dataRows[i],
      font, 9, rowHeight, false, MARGIN_LEFT, lineColor);
    y -= rowHeight;
  }

  // ── Garis bawah tabel ──
  drawTableBottomLine(currentPage, y, MARGIN_LEFT, colWidths, lineColor);

  // ── Catatan lain ──
  y -= 14;
  currentPage.drawText(`Catatan Lain: ${cleanNotes(data.notes)}`, {
    x: MARGIN_LEFT, y, size: 10, font, color: rgb(0, 0, 0),
  });

  // ── Cek apakah footer muat, kalau tidak buat halaman baru ──
  y -= 28;
  if (y - FOOTER_HEIGHT < MARGIN_BOTTOM) {
    currentPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - 80;
  }

  // ── Footer (tanda tangan + ketentuan) ──
  await drawFooter(pdfDoc, currentPage, y, data.borrowerName, data.borrowDate, font, boldFont, italicFont, boldItalicFont, data.signatureUrl);

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
