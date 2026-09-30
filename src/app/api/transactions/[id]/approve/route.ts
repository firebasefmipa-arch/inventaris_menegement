import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, transactionItems } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/auth";
import { periksaAksesUnit } from "@/lib/akses-unit";
import { kembalikanKeStok } from "@/lib/pengembalian";
import { copyFile, mkdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { deleteUploadByUrl, deleteUploadIfDifferent } from "@/lib/delete-upload";
import { uploadPath, uploadPathFromUrl } from "@/lib/upload-dir";
import { jsonBody } from "@/lib/json-body";
import { buatDokumenPinjam } from "@/lib/dokumen-persetujuan";
import { tentukanPenyetuju, type Penyetuju } from "@/lib/penyetuju";
import { kodeBaru } from "@/lib/dokumen-verifikasi";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user || (role !== "admin" && role !== "super_admin"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const txId = parseInt(id, 10);
    if (isNaN(txId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const body = await jsonBody(request);
    if (!body) return NextResponse.json({ error: "Body permintaan tidak valid" }, { status: 400 });
    const { action, rejectionReason } = body;

    if (action !== "approve" && action !== "reject")
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    if (action === "reject" && (!rejectionReason || !rejectionReason.trim()))
      return NextResponse.json({ error: "Alasan penolakan wajib diisi" }, { status: 400 });

    const [tx] = await db.select().from(transactions).where(eq(transactions.id, txId));
    if (!tx) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    if (tx.status !== "pending_approval")
      return NextResponse.json({ error: "Transaction is not pending approval" }, { status: 400 });

    // ── Batas unit ──
    // Sejak pengajuan dipecah per unit, tiap pecahan punya adminnya sendiri.
    // Pemeriksaan di SERVER, bukan sekadar menyembunyikan tombol: URL bisa
    // diketik langsung. Superadmin lolos tanpa diperiksa.
    const tolak = await periksaAksesUnit(session, tx.unit);
    if (tolak) return NextResponse.json({ error: tolak.pesan }, { status: tolak.status });

    const newStatus = action === "approve" ? "active" : "rejected";

    // ── Siapa yang menyetujui? ──
    // Diperiksa SEBELUM status dikunci: admin yang belum mengunggah tanda tangan
    // tidak boleh menyetujui, dan penolakan ini tidak boleh meninggalkan jejak
    // separuh jadi. Superadmin dikecualikan (namanya tak dicetak di dokumen).
    let penyetuju: Penyetuju = null;
    if (action === "approve") {
      const hasil = await tentukanPenyetuju(String(session.user.id), role);
      if ("tolak" in hasil) return NextResponse.json({ error: hasil.tolak.pesan }, { status: hasil.tolak.status });
      penyetuju = hasil.penyetuju;
    }

    // ── Kunci status di WHERE ──
    // Dulu di sini hanya `WHERE id`, sehingga tiga klik bersamaan sama-sama
    // "berhasil": untuk penolakan itu berarti stok dikembalikan tiga kali dan
    // jumlahnya melebihi fisik barang. Sekarang perubahannya hanya sah kalau
    // statusnya MASIH `pending_approval`; yang kalah balapan dapat 0 baris.
    const hasil = await db
      .update(transactions)
      .set(
        action === "approve"
          ? {
              status: "active",
              approvedBy: penyetuju?.nama ?? null,
              approvedAt: new Date(),
              approvedSignatureUrl: penyetuju?.tandaTangan ?? null,
              verificationCode: kodeBaru(),
            }
          : {
              status: "rejected",
              rejectionReason: rejectionReason!.trim(),
              signedDocumentUrl: null,
            }
      )
      .where(and(eq(transactions.id, txId), eq(transactions.status, "pending_approval")));

    const baris = (Array.isArray(hasil) ? hasil[0] : hasil) as unknown as { affectedRows?: number };
    if (Number(baris?.affectedRows ?? 0) === 0) {
      return NextResponse.json(
        { error: "Pengajuan ini sudah diproses oleh permintaan lain. Muat ulang halamannya." },
        { status: 409 }
      );
    }

    if (action === "approve") {
      // Dokumen dicetak ULANG lengkap dengan tanda tangan & nama admin.
      // Dulu berkasnya hanya dipindahkan dari pending/ ke signed_forms/,
      // sehingga kolom "Yang menyerahkan" selamanya kosong.
      // Kalau gagal, berkas lama tetap dipindah supaya dokumen tidak hilang.
      try {
        const urlBaru = await buatDokumenPinjam(txId, penyetuju);
        // Berkas lama dibuang hanya bila beda dari yang baru — kalau namanya
        // kebetulan sama, menghapus "yang lama" = menghapus dokumen barunya.
        await deleteUploadIfDifferent(urlBaru, tx.signedDocumentUrl);
        await db.update(transactions).set({ signedDocumentUrl: urlBaru }).where(eq(transactions.id, txId));
      } catch (e) {
        console.error("Cetak dokumen persetujuan error:", e);
        let finalPdfUrl = tx.signedDocumentUrl;
        if (tx.signedDocumentUrl?.startsWith("/uploads/pending/")) {
          try {
            const filename = path.basename(tx.signedDocumentUrl);
            const srcPath  = uploadPathFromUrl(tx.signedDocumentUrl);
            const destDir  = uploadPath("signed_forms");
            const destPath = path.join(destDir, filename);
            await mkdir(destDir, { recursive: true });
            if (existsSync(srcPath)) {
              await copyFile(srcPath, destPath);
              await unlink(srcPath).catch(() => {});
            }
            finalPdfUrl = `/uploads/signed_forms/${filename}`;
          } catch (e2) {
            console.error("Pindah PDF error:", e2);
          }
        }
        if (finalPdfUrl !== tx.signedDocumentUrl) {
          await db.update(transactions).set({ signedDocumentUrl: finalPdfUrl }).where(eq(transactions.id, txId));
        }
      }
    } else {
      // Reject — hapus PDF (folder mana pun) dan kembalikan stok.
      // Dokumen pengajuan ditolak tidak disimpan; riwayat tetap ada.
      await deleteUploadByUrl(tx.signedDocumentUrl);

      // Kembalikan stok. Transaksi baru memakai pivot transaction_items;
      // transaksi lama (sebelum multi-item) menautkan barangnya lewat
      // transactions.item_id — keduanya tetap dilayani.
      const txItems = await db.select().from(transactionItems).where(eq(transactionItems.transactionId, txId));
      if (txItems.length > 0) {
        await kembalikanKeStok(txItems.map((t) => ({ itemId: t.itemId, quantity: t.quantity })));
      } else if (tx.itemId) {
        await kembalikanKeStok([{ itemId: tx.itemId, quantity: tx.quantity }]);
      }
    }

    return NextResponse.json({ success: true, status: newStatus });
  } catch (error) {
    console.error("Approve/Reject error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
