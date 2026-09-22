import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { transactions, handovers, users } from "@/db/schema";
import { uploadPath, isInsideUploadRoot } from "@/lib/upload-dir";

const TIPE: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

/**
 * Penyaji berkas unggahan. Menggantikan penyajian statis `public/uploads` yang
 * bisa diunduh siapa saja tanpa login.
 *
 * Aturan akses:
 * - wajib login;
 * - admin/super_admin boleh semua berkas;
 * - pemilik berkas (peminjam / penerima / pemilik TTD) boleh berkasnya sendiri;
 * - selain itu 403.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path: segmen } = await params;
  // Cegah path traversal (`..`, segmen absolut) sebelum menyentuh disk.
  if (!segmen?.length || segmen.some((s) => !s || s === ".." || s.includes("/") || s.includes("\\"))) {
    return NextResponse.json({ error: "Path tidak valid" }, { status: 400 });
  }

  const filePath = uploadPath(...segmen);
  if (!isInsideUploadRoot(filePath)) {
    return NextResponse.json({ error: "Path tidak valid" }, { status: 400 });
  }

  const role = (session.user as any).role;
  const isAdmin = role === "admin" || role === "super_admin";
  const url = `/uploads/${segmen.join("/")}`;

  if (!isAdmin) {
    const [folder] = segmen;
    let milikSendiri = false;

    if (folder === "signed_forms" || folder === "pending") {
      // Dokumen bisa milik transaksi peminjaman atau serah terima.
      const [tx] = await db
        .select({ userId: transactions.userId })
        .from(transactions)
        .where(eq(transactions.signedDocumentUrl, url))
        .limit(1);
      const [hv] = tx
        ? []
        : await db
            .select({ userId: handovers.userId })
            .from(handovers)
            .where(eq(handovers.signedDocumentUrl, url))
            .limit(1);
      milikSendiri = tx?.userId === session.user.id || hv?.userId === session.user.id;
    } else if (folder === "signatures") {
      // TTD: pemiliknya user itu sendiri. Dipakai pratinjau di halaman profil.
      const [u] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.signatureUrl, url))
        .limit(1);
      milikSendiri = u?.id === session.user.id;
    }

    if (!milikSendiri) {
      return NextResponse.json({ error: "Tidak memiliki akses" }, { status: 403 });
    }
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("bukan berkas");
  } catch {
    return NextResponse.json({ error: "Berkas tidak ditemukan" }, { status: 404 });
  }

  const isi = await readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();

  return new NextResponse(new Uint8Array(isi), {
    headers: {
      "Content-Type": TIPE[ext] ?? "application/octet-stream",
      // inline supaya PDF terbuka di tab baru, bukan langsung terunduh
      "Content-Disposition": `inline; filename="${path.basename(filePath).replace(/"/g, "")}"`,
      "Content-Length": String(isi.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}
