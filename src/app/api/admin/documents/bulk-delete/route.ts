import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { transactions, handovers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { unlink } from "fs/promises";
import path from "path";

function isSafePath(folder: string, filename: string): boolean {
  const allowedFolders = ["signed_forms", "handovers"];
  if (!allowedFolders.includes(folder)) return false;
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) return false;
  return true;
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user || role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { files } = await req.json();

    if (!Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: "Tidak ada file yang dipilih" }, { status: 400 });
    }

    const results: { name: string; success: boolean; error?: string }[] = [];

    for (const { folder, filename } of files) {
      if (!isSafePath(folder, filename)) {
        results.push({ name: filename, success: false, error: "Path tidak valid" });
        continue;
      }

      const filePath = path.join(process.cwd(), "public", "uploads", folder, filename);
      try {
        await unlink(filePath);
        // Tandai di DB: set signedDocumentUrl = 'deleted'
        const fileUrl = `/uploads/${folder}/${filename}`;
        if (folder === "signed_forms") {
          await db.update(transactions)
            .set({ signedDocumentUrl: "deleted" })
            .where(eq(transactions.signedDocumentUrl, fileUrl));
        } else if (folder === "handovers") {
          await db.update(handovers)
            .set({ signedDocumentUrl: "deleted" })
            .where(eq(handovers.signedDocumentUrl, fileUrl));
        }
        results.push({ name: filename, success: true });
      } catch (err: any) {
        results.push({
          name: filename,
          success: false,
          error: err.code === "ENOENT" ? "File tidak ditemukan" : "Gagal menghapus",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return NextResponse.json({
      success: true,
      successCount,
      failCount,
      results,
      message: failCount === 0
        ? `${successCount} file berhasil dihapus`
        : `${successCount} berhasil, ${failCount} gagal`,
    });
  } catch (error) {
    console.error("Bulk delete documents error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan" }, { status: 500 });
  }
}
