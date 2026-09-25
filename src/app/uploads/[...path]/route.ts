import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { transactions, handovers, users } from "@/db/schema";
import { uploadPath, isInsideUploadRoot } from "@/lib/upload-dir";
import { unitDikelola, bolehKelolaUnit } from "@/lib/akses-unit";

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
 * - super_admin boleh semua berkas;
 * - berkas DOKUMEN (peminjaman / serah terima): pemiliknya, atau admin yang
 *   mengelola unit barang itu. Admin unit lain TIDAK boleh — kalau tidak,
 *   pembatasan di /api/grup/[grupId]/dokumen bisa dilewati dengan mengetik
 *   alamat berkasnya langsung;
 * - berkas TTD: hanya pemiliknya (+ super_admin);
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
  const isSuper = role === "super_admin";
  const url = `/uploads/${segmen.join("/")}`;

  if (!isSuper) {
    const [folder] = segmen;
    let milikSendiri = false;
    // Admin yang mengelola unit barang ini — diperiksa dari unit yang tercatat
    // di transaksi/serah terima, bukan dari folder.
    let unitBerkas: string | null = null;

    // Folder dokumen (bukan TTD). Ada TIGA: `pending` sebelum disetujui,
    // `signed_forms` setelah pinjam disetujui, dan `handovers` setelah serah
    // terima disetujui. Lupa mendaftarkan salah satunya membuat pemiliknya
    // sendiri kena 403 saat membuka dokumennya.
    const FOLDER_DOKUMEN = ["signed_forms", "pending", "handovers"];

    if (FOLDER_DOKUMEN.includes(folder)) {
      // Dokumen bisa milik transaksi peminjaman atau serah terima.
      const [tx] = await db
        .select({ userId: transactions.userId, unit: transactions.unit })
        .from(transactions)
        .where(eq(transactions.signedDocumentUrl, url))
        .limit(1);
      const [hv] = tx
        ? []
        : await db
            .select({ userId: handovers.userId, unit: handovers.unit })
            .from(handovers)
            .where(eq(handovers.signedDocumentUrl, url))
            .limit(1);
      milikSendiri = tx?.userId === session.user.id || hv?.userId === session.user.id;
      unitBerkas = tx?.unit ?? hv?.unit ?? null;
    } else if (folder === "signatures") {
      // TTD: pemiliknya user itu sendiri. Dipakai pratinjau di halaman profil.
      // Admin unit mana pun TIDAK boleh — tanda tangan itu milik pribadi.
      const [u] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.signatureUrl, url))
        .limit(1);
      milikSendiri = u?.id === session.user.id;
    }

    // Admin yang mengelola unit dokumen ini boleh membukanya.
    let bolehSebagaiAdmin = false;
    if (!milikSendiri && role === "admin" && unitBerkas !== null) {
      const daftar = (await unitDikelola(session.user.id)) ?? [];
      bolehSebagaiAdmin = bolehKelolaUnit(role, daftar, unitBerkas);
    }

    if (!milikSendiri && !bolehSebagaiAdmin) {
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
