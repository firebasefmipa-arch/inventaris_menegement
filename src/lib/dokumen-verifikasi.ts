/**
 * Kode pemeriksaan dokumen + isi halaman pemeriksaan publik.
 *
 * Setiap dokumen yang disetujui bisa diberi kode acak 16 huruf. Kode itu dicetak
 * sebagai kotak QR; siapa pun yang memindainya dibawa ke /cek/<kode> — halaman
 * yang bisa dibuka TANPA masuk, karena yang memeriksa biasanya pihak luar
 * (atasan, auditor) yang tidak punya akun.
 *
 * Kode sengaja ACAK, bukan nomor urut. Kalau nomor urut, orang bisa mengubah
 * angkanya dan mengintip dokumen milik orang lain.
 *
 * Yang tampil di halaman itu SENGAJA terbatas: nomor pengajuan, tanggal, unit,
 * status, dan siapa penyetujunya. Nama/NIM/HP peminjam dan daftar barang TIDAK
 * ditampilkan — halaman ini bisa dibuka siapa saja yang punya kodenya.
 */
import { db } from "@/db";
import { transactions, handovers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { rgb } from "pdf-lib";
import type { PDFDocument, PDFPage, PDFFont } from "pdf-lib";
import { BASE_PATH } from "@/lib/basepath";
import type { Penyetuju } from "@/lib/penyetuju";

// Tanpa 0/O/1/I/L — huruf yang mudah tertukar waktu dibaca manusia.
const ABJAD = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const PANJANG_KODE = 16;

/** Kode pemeriksaan acak, 16 huruf. */
export function kodeBaru(): string {
  const b = randomBytes(PANJANG_KODE);
  let kode = "";
  for (let i = 0; i < PANJANG_KODE; i++) kode += ABJAD[b[i] % ABJAD.length];
  return kode;
}

/** Rapikan kode dari URL: buang tanda hubung/spasi, jadikan huruf besar. */
export function rapikanKode(mentah: string): string {
  return (mentah || "").toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, PANJANG_KODE);
}

/** Bentuk yang enak dibaca mata: 7K3M-9XQ2-B4TN-8WRD. */
export function kodeTerbaca(kode: string): string {
  return (kode.match(/.{1,4}/g) || []).join("-");
}

/**
 * Alamat yang disimpan di dalam kotak QR. Harus alamat LENGKAP (https://...)
 * karena pemindai perlu alamat utuh, bukan path relatif.
 */
export function urlPemeriksaan(kode: string): string {
  const dasar = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
  // NEXTAUTH_URL sudah memuat basePath (…/logistik), jadi jangan ditambah lagi.
  return `${dasar}/cek/${kode}`;
}

/**
 * Nama penyetuju untuk ditampilkan.
 *
 * Superadmin sengaja TIDAK dibedakan dari admin biasa: kalau halaman menulis
 * "Admin" begitu saja, orang bisa menyimpulkan "berarti ini superadmin, karena
 * admin biasa namanya tercetak". Jadi nama unit yang dipakai menutupinya.
 */
export function labelPenyetuju(penyetuju: Penyetuju, unit: string | null | undefined): string | null {
  if (!penyetuju) return null;
  if (penyetuju.nama) return penyetuju.nama; // admin biasa — namanya memang dicetak
  const u = (unit || "").trim();
  return u ? `Admin ${u}` : "Admin FMIPA UII";
}

/** Nama status dalam bahasa yang dipakai sehari-hari di aplikasi. */
const LABEL_STATUS: Record<string, string> = {
  pending_approval: "Menunggu Persetujuan",
  pending_signature: "Menunggu Dokumen",
  approved: "Disetujui",
  rejected: "Ditolak",
  active: "Sedang Dipinjam",
  returned: "Dikembalikan",
  completed: "Serah Terima Selesai",
  cancelled: "Dibatalkan",
};

export const labelStatus = (s: string) => LABEL_STATUS[s] || s;

/** Status yang berarti dokumen sudah tidak berlaku lagi. */
export const statusBatal = (s: string) => s === "rejected" || s === "cancelled";

/** Ringkasan dokumen yang boleh dilihat publik. */
export type RingkasanDokumen = {
  jenis: "peminjaman" | "serah_terima";
  nomor: number;
  tanggal: Date;
  unit: string | null;
  status: string;
  penyetuju: string | null;
  tanggalSetuju: Date | null;
};

/**
 * Cari dokumen dari kodenya. Mengembalikan null kalau kode tidak terdaftar —
 * itu artinya kertas yang dipegang kemungkinan bukan keluaran resmi sistem.
 */
export async function cariDokumen(kodeMentah: string): Promise<RingkasanDokumen | null> {
  const kode = rapikanKode(kodeMentah);
  if (kode.length !== PANJANG_KODE) return null;

  const [tx] = await db
    .select({
      nomor: transactions.id,
      tanggal: transactions.borrowDate,
      unit: transactions.unit,
      status: transactions.status,
      approvedBy: transactions.approvedBy,
      approvedAt: transactions.approvedAt,
    })
    .from(transactions)
    .where(eq(transactions.verificationCode, kode))
    .limit(1);

  if (tx) {
    return {
      jenis: "peminjaman",
      nomor: tx.nomor,
      tanggal: tx.tanggal,
      unit: tx.unit,
      status: tx.status,
      // approvedAt ada & approvedBy kosong = superadmin (lihat @/lib/penyetuju)
      penyetuju: tx.approvedAt
        ? labelPenyetuju({ nama: tx.approvedBy ?? null, tandaTangan: null }, tx.unit)
        : null,
      tanggalSetuju: tx.approvedAt ?? null,
    };
  }

  const [hv] = await db
    .select({
      nomor: handovers.id,
      tanggal: handovers.handoverDate,
      unit: handovers.unit,
      status: handovers.status,
      approvedBy: handovers.approvedBy,
      approvedAt: handovers.approvedAt,
    })
    .from(handovers)
    .where(eq(handovers.verificationCode, kode))
    .limit(1);

  if (hv) {
    return {
      jenis: "serah_terima",
      nomor: hv.nomor,
      tanggal: hv.tanggal,
      unit: hv.unit,
      status: hv.status,
      penyetuju: hv.approvedAt
        ? labelPenyetuju({ nama: hv.approvedBy ?? null, tandaTangan: null }, hv.unit)
        : null,
      tanggalSetuju: hv.approvedAt ?? null,
    };
  }

  return null;
}

export { BASE_PATH };

/** Ukuran huruf terbesar (dari daftar) yang membuat teks muat dalam lebar kolom. */
export function ukuranMuat(font: PDFFont, teks: string, lebar: number, pilihan = [9, 8, 7, 6.5]): number {
  for (const s of pilihan) if (font.widthOfTextAtSize(teks, s) <= lebar) return s;
  return pilihan[pilihan.length - 1];
}

// ── Menggambar kotak QR di dokumen tercetak ────────────────────────────────

/**
 * Tempel kotak QR di halaman PDF. Dipakai blok penyetuju superadmin: dulu di
 * situ tertulis "Disetujui oleh Admin", sekarang kotak QR + keterangan kecil.
 *
 * Mengembalikan tinggi yang terpakai, supaya pemanggil bisa menyesuaikan tata
 * letak kalau perlu.
 */
export async function tempelQr(
  doc: PDFDocument,
  page: PDFPage,
  kode: string,
  x: number,
  yAtas: number,
  ukuran: number,
  font: PDFFont
): Promise<number> {
  const png = await gambarQr(kode);
  const img = await doc.embedPng(png);
  page.drawImage(img, { x, y: yAtas - ukuran, width: ukuran, height: ukuran });

  const teks = "Pindai untuk memeriksa";
  const tw = font.widthOfTextAtSize(teks, 6.5);
  page.drawText(teks, {
    x: x + (ukuran - tw) / 2,
    y: yAtas - ukuran - 9,
    size: 6.5,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });

  return ukuran + 12;
}

/** Kotak QR sebagai PNG siap tempel. */
export async function gambarQr(kode: string): Promise<Buffer> {
  return QRCode.toBuffer(urlPemeriksaan(kode), {
    type: "png",
    width: 300,
    margin: 1,
    errorCorrectionLevel: "M",
  });
}
