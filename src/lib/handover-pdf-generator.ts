import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';

export interface HandoverData {
  receiverName: string;
  receiverNim?: string;
  unitName?: string;
  department?: string;
  phone?: string;
  location?: string;
  purpose?: string;
  notes?: string;
  handoverDate: Date;
  signatureUrl?: string | null;
  items: Array<{
    name: string;
    quantity: number;
    assetNumber?: string | null;
    inventoryNumber?: string | null;
  }>;
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_LEFT = 56;
const MARGIN_RIGHT = 56;
const MARGIN_BOTTOM = 56;
const CONTENT_W = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT;

const formatDate = (date: Date) =>
  date.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

const formatDateShort = (date: Date) => {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
};

const getDayName = (date: Date) => {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  return days[date.getDay()];
};

function drawCentered(page: PDFPage, text: string, y: number, font: PDFFont, size: number, color = rgb(0, 0, 0)) {
  const tw = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (PAGE_W - tw) / 2, y, size, font, color });
}

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

  if (isHeader) {
    page.drawRectangle({
      x: startX,
      y: rowY - rowHeight,
      width: totalWidth,
      height: rowHeight,
      color: rgb(0.93, 0.93, 0.93),
    });
  }

  page.drawLine({
    start: { x: startX, y: rowY },
    end: { x: startX + totalWidth, y: rowY },
    thickness: isHeader ? 1 : 0.5,
    color: lineColor,
  });

  let cellX = startX;
  cells.forEach((cell, cIdx) => {
    const padding = 6;
    const textY = rowY - rowHeight / 2 - fontSize / 3;
    // Center untuk kolom No (0), No. Asset/No. Inventaris (2), dan Jumlah (3)
    if (cIdx === 0 || cIdx === 2 || cIdx === 3) {
      const tw = font.widthOfTextAtSize(cell, fontSize);
      page.drawText(cell, { x: cellX + (colWidths[cIdx] - tw) / 2, y: textY, size: fontSize, font, color: rgb(0, 0, 0) });
    } else {
      page.drawText(cell, { x: cellX + padding, y: textY, size: fontSize, font, color: rgb(0, 0, 0) });
    }
    cellX += colWidths[cIdx];
  });

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

export async function generateHandoverPDF(data: HandoverData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font         = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont     = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italicFont   = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const boldItalicFont = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);

  let currentPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - 50;

  // ── Logo ──
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
  drawCentered(currentPage, 'FORMULIR SERAH TERIMA ALAT/BARANG', y, boldFont, 13, rgb(0.1, 0.1, 0.1));
  y -= 16;
  drawCentered(currentPage, 'DIVISI TI FMIPA UII', y, boldFont, 11, rgb(0.25, 0.25, 0.25));
  y -= 24;

  // ── Salam ──
  currentPage.drawText("Assalamu'alaikum wr. Wb.", { x: MARGIN_LEFT, y, size: 10, font: italicFont, color: rgb(0, 0, 0) });
  y -= 14;
  currentPage.drawText('Menerangkan bahwa telah dilakukan serah terima alat/barang pada :', {
    x: MARGIN_LEFT, y, size: 10, font, color: rgb(0, 0, 0),
  });
  y -= 20;

  // ── Info serah terima ──
  const labelX = MARGIN_LEFT;
  const colonX = MARGIN_LEFT + 110;
  const valueX = colonX + 12;

  const infoFields: [string, string][] = [
    ['Hari',                 getDayName(data.handoverDate)],
    ['Tanggal serah terima', formatDateShort(data.handoverDate)],
    ['Tempat',               data.location || ''],
  ];

  infoFields.forEach(([label, value]) => {
    currentPage.drawText(label, { x: labelX, y, size: 10, font, color: rgb(0, 0, 0) });
    currentPage.drawText(':', { x: colonX, y, size: 10, font, color: rgb(0, 0, 0) });
    if (value) currentPage.drawText(value, { x: valueX, y, size: 10, font, color: rgb(0, 0, 0) });
    y -= 16;
  });

  y -= 8;
  currentPage.drawText('Dengan rincian sebagai berikut:', {
    x: MARGIN_LEFT, y, size: 10, font, color: rgb(0, 0, 0),
  });
  y -= 18;

  // ── Tabel barang ──
  // No | Nama Barang | No. Asset/No. Inventaris | Jumlah
  const colWidths = [30, CONTENT_W - 30 - 120 - 40, 120, 40];
  const rowHeight = 22;
  const lineColor = rgb(0, 0, 0);
  const FOOTER_HEIGHT = 260;

  const dataRows: string[][] = data.items.map((item, idx) => [
    String(idx + 1),
    item.name,
    item.assetNumber || item.inventoryNumber || '-',
    String(item.quantity),
  ]);
  // Minimal 4 baris kosong
  while (dataRows.length < 4) {
    dataRows.push([String(dataRows.length + 1), '', '', '']);
  }

  // Header tabel
  drawTableRow(
    currentPage, y, colWidths,
    ['No', 'Nama Barang', 'No. Asset/No. Inventaris', 'Jumlah'],
    boldFont, 9, rowHeight, true, MARGIN_LEFT, lineColor
  );
  y -= rowHeight;

  for (let i = 0; i < dataRows.length; i++) {
    const isLastRow = i === dataRows.length - 1;
    const spaceNeeded = rowHeight + (isLastRow ? FOOTER_HEIGHT : 0);

    if (y - spaceNeeded < MARGIN_BOTTOM) {
      drawTableBottomLine(currentPage, y, MARGIN_LEFT, colWidths, lineColor);
      currentPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN_BOTTOM;

      drawTableRow(
        currentPage, y, colWidths,
        ['No', 'Nama Barang', 'No. Asset/No. Inventaris', 'Jumlah'],
        boldFont, 9, rowHeight, true, MARGIN_LEFT, lineColor
      );
      y -= rowHeight;
    }

    drawTableRow(currentPage, y, colWidths, dataRows[i], font, 9, rowHeight, false, MARGIN_LEFT, lineColor);
    y -= rowHeight;
  }

  drawTableBottomLine(currentPage, y, MARGIN_LEFT, colWidths, lineColor);
  y -= 20;

  // ── Info penerima ──
  currentPage.drawText(
    'Dengan ditandatanganinya formulir serah terima ini, maka tanggung jawab pengelolaan alat/barang',
    { x: MARGIN_LEFT, y, size: 9.5, font, color: rgb(0, 0, 0) }
  );
  y -= 13;
  currentPage.drawText('diserahkan kepada pihak penerima alat/barang, yaitu :', {
    x: MARGIN_LEFT, y, size: 9.5, font, color: rgb(0, 0, 0),
  });
  y -= 18;

  const receiverFields: [string, string][] = [
    ['Nama Unit',             data.unitName || data.department || ''],
    ['Nama Penanggung Jawab', data.receiverName || ''],
    ['NIK/NIM',               data.receiverNim || ''],
    ['Unit/Jurusan/Divisi',   data.department || ''],
    ['No. Telp/WA',           data.phone || ''],
    ['Keperluan (Kegiatan)',   data.purpose || ''],
  ];

  // colonX khusus bagian info penerima — lebih lebar karena "Nama Penanggung Jawab"
  const receiverColonX = MARGIN_LEFT + 140;
  const receiverValueX = receiverColonX + 12;

  receiverFields.forEach(([label, value]) => {
    currentPage.drawText(label, { x: labelX, y, size: 10, font, color: rgb(0, 0, 0) });
    currentPage.drawText(':', { x: receiverColonX, y, size: 10, font, color: rgb(0, 0, 0) });
    if (value) currentPage.drawText(value, { x: receiverValueX, y, size: 10, font, color: rgb(0, 0, 0) });
    y -= 16;
  });

  y -= 10;

  // ── Penutup ──
  currentPage.drawText('Demikian dokumen serah terima ini dibuat agar dipergunakan sebagaimana mestinya.', {
    x: MARGIN_LEFT, y, size: 9.5, font, color: rgb(0, 0, 0),
  });
  y -= 13;
  currentPage.drawText("Wassalamu'alaikum wr. wb.", {
    x: MARGIN_LEFT, y, size: 9.5, font: italicFont, color: rgb(0, 0, 0),
  });
  y -= 30;

  // ── Tanda tangan ──
  if (y - 110 < MARGIN_BOTTOM) {
    currentPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - 80;
  }

  const col1X = MARGIN_LEFT;
  const col2X = PAGE_W - MARGIN_RIGHT - 130;
  const colW  = 130;

  // Label kolom
  currentPage.drawText('DIVISI TI FMIPA UII', { x: col1X, y, size: 10, font: boldFont, color: rgb(0, 0, 0) });
  const yogyaText = `Yogyakarta, ${formatDateShort(data.handoverDate)}`;
  const yogyaTw = font.widthOfTextAtSize(yogyaText, 10);
  currentPage.drawText(yogyaText, { x: col2X + (colW - yogyaTw) / 2, y, size: 10, font, color: rgb(0, 0, 0) });

  y -= 14;
  currentPage.drawText('Yang menyerahkan,', { x: col1X, y, size: 10, font, color: rgb(0, 0, 0) });
  const menerimaTw = font.widthOfTextAtSize('Yang menerima,', 10);
  currentPage.drawText('Yang menerima,', { x: col2X + (colW - menerimaTw) / 2, y, size: 10, font, color: rgb(0, 0, 0) });

  y -= 75;

  // Nama penerima dengan underline pendek (sesuai lebar nama)
  if (data.receiverName) {
    const nameTw = boldFont.widthOfTextAtSize(data.receiverName, 10);
    const nameX = col2X + (colW - nameTw) / 2;

    // Embed TTD jika ada
    if (data.signatureUrl) {
      try {
        const sigPath = path.join(process.cwd(), 'public', data.signatureUrl);
        const sigBytes = await fs.readFile(sigPath);
        const ext = path.extname(data.signatureUrl).toLowerCase();
        let sigImg;
        if (ext === '.png') {
          sigImg = await pdfDoc.embedPng(sigBytes);
        } else {
          sigImg = await pdfDoc.embedJpg(sigBytes);
        }
        const sigDims = sigImg.scaleToFit(colW - 10, 55);
        currentPage.drawImage(sigImg, {
          x: col2X + (colW - sigDims.width) / 2,
          y: y - sigDims.height + 10,
          width: sigDims.width,
          height: sigDims.height,
        });
      } catch { /* Gagal load TTD — biarkan kosong */ }
    }

    currentPage.drawText(data.receiverName, {
      x: nameX, y, size: 10, font: boldFont, color: rgb(0, 0, 0),
    });
    currentPage.drawLine({
      start: { x: nameX, y: y - 2 },
      end:   { x: nameX + nameTw, y: y - 2 },
      thickness: 0.8,
      color: rgb(0, 0, 0),
    });
  }

  // Garis kiri disejajarkan di posisi y - 2
  currentPage.drawLine({ start: { x: col1X, y: y - 2 }, end: { x: col1X + colW, y: y - 2 }, thickness: 0.8, color: rgb(0, 0, 0) });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
