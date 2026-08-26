import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { transactions, handovers } from "@/db/schema";
import { like } from "drizzle-orm";
import { readdir, rename } from "fs/promises";
import path from "path";

/**
 * POST /api/admin/documents/rename-legacy
 * Rename file lama (signed_XX_timestamp.ext / handover_XX_timestamp.ext)
 * menjadi format baru (NamaPeminjam_DDMMYYYY.ext)
 * berdasarkan data di database.
 * Hanya super_admin.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user || role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    function sanitize(name: string): string {
      return (name || "Unknown")
        .replace(/[^a-zA-Z0-9_\-\s]/g, "")
        .replace(/\s+/g, "_")
        .slice(0, 50);
    }

    function formatDate(date: Date): string {
      const d = new Date(date);
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      return `${dd}${mm}${yyyy}`;
    }

    const results: { old: string; new: string; status: string }[] = [];

    // ── Rename signed_forms ──
    const signedDir = path.join(process.cwd(), "public", "uploads", "signed_forms");
    try {
      const files = await readdir(signedDir);
      for (const file of files) {
        // Hanya proses file format lama: signed_ID_timestamp.ext
        const match = file.match(/^signed_(\d+)_\d+(\.[a-z]+)$/i);
        if (!match) continue;

        const txId = parseInt(match[1]);
        const ext = match[2].toLowerCase();

        // Ambil nama peminjam dari DB
        const [tx] = await db
          .select({ borrowerName: transactions.borrowerName, borrowDate: transactions.borrowDate })
          .from(transactions)
          .where(like(transactions.id as any, txId as any))
          .limit(1);

        if (!tx) {
          results.push({ old: file, new: "-", status: "skipped (transaksi tidak ditemukan)" });
          continue;
        }

        const newName = `${sanitize(tx.borrowerName)}_${formatDate(tx.borrowDate)}${ext}`;
        const oldPath = path.join(signedDir, file);
        const newPath = path.join(signedDir, newName);

        // Cegah overwrite jika nama sudah sama atau file tujuan sudah ada
        if (file === newName) {
          results.push({ old: file, new: newName, status: "skipped (sudah sesuai)" });
          continue;
        }

        try {
          await rename(oldPath, newPath);
          // Update URL di database
          await db.update(transactions)
            .set({ signedDocumentUrl: `/uploads/signed_forms/${newName}` })
            .where(like(transactions.id as any, txId as any));
          results.push({ old: file, new: newName, status: "renamed" });
        } catch {
          results.push({ old: file, new: newName, status: "error (gagal rename)" });
        }
      }
    } catch {
      // folder tidak ada, skip
    }

    // ── Rename handovers ──
    const handoverDir = path.join(process.cwd(), "public", "uploads", "handovers");
    try {
      const files = await readdir(handoverDir);
      for (const file of files) {
        const match = file.match(/^handover_(\d+)_\d+(\.[a-z]+)$/i);
        if (!match) continue;

        const hvId = parseInt(match[1]);
        const ext = match[2].toLowerCase();

        const [hv] = await db
          .select({ receiverName: handovers.receiverName, handoverDate: handovers.handoverDate })
          .from(handovers)
          .where(like(handovers.id as any, hvId as any))
          .limit(1);

        if (!hv) {
          results.push({ old: file, new: "-", status: "skipped (serah terima tidak ditemukan)" });
          continue;
        }

        const newName = `${sanitize(hv.receiverName)}_${formatDate(hv.handoverDate)}${ext}`;
        const oldPath = path.join(handoverDir, file);
        const newPath = path.join(handoverDir, newName);

        if (file === newName) {
          results.push({ old: file, new: newName, status: "skipped (sudah sesuai)" });
          continue;
        }

        try {
          await rename(oldPath, newPath);
          await db.update(handovers)
            .set({ signedDocumentUrl: `/uploads/handovers/${newName}` })
            .where(like(handovers.id as any, hvId as any));
          results.push({ old: file, new: newName, status: "renamed" });
        } catch {
          results.push({ old: file, new: newName, status: "error (gagal rename)" });
        }
      }
    } catch {
      // folder tidak ada, skip
    }

    const renamedCount = results.filter((r) => r.status === "renamed").length;

    return NextResponse.json({
      success: true,
      message: `${renamedCount} file berhasil di-rename`,
      results,
    });
  } catch (error) {
    console.error("Rename legacy docs error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan" }, { status: 500 });
  }
}
