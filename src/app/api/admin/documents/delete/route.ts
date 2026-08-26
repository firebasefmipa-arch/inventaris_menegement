import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { transactions, handovers } from "@/db/schema";
import { eq, like } from "drizzle-orm";
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

    const { folder, filename } = await req.json();

    if (!folder || !filename) {
      return NextResponse.json({ error: "folder dan filename wajib diisi" }, { status: 400 });
    }
    if (!isSafePath(folder, filename)) {
      return NextResponse.json({ error: "Path tidak valid" }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), "public", "uploads", folder, filename);
    const fileUrl = `/uploads/${folder}/${filename}`;

    await unlink(filePath);

    // Tandai di DB: set signedDocumentUrl = 'deleted'
    if (folder === "signed_forms") {
      await db.update(transactions)
        .set({ signedDocumentUrl: "deleted" })
        .where(eq(transactions.signedDocumentUrl, fileUrl));
    } else if (folder === "handovers") {
      await db.update(handovers)
        .set({ signedDocumentUrl: "deleted" })
        .where(eq(handovers.signedDocumentUrl, fileUrl));
    }

    return NextResponse.json({ success: true, message: `File "${filename}" berhasil dihapus` });
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return NextResponse.json({ error: "File tidak ditemukan" }, { status: 404 });
    }
    console.error("Delete document error:", error);
    return NextResponse.json({ error: "Gagal menghapus file" }, { status: 500 });
  }
}
