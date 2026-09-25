import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { formDataAman } from "@/lib/json-body";
import { auth } from "@/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { uploadPath } from "@/lib/upload-dir";
import { periksaAksesUnit } from "@/lib/akses-unit";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const txId = parseInt(id, 10);
    if (isNaN(txId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const formData = await formDataAman(request);
    if (!formData) return NextResponse.json({ error: "Berkas tidak ditemukan" }, { status: 400 });
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "File tidak ditemukan" }, { status: 400 });
    }

    // Validasi ukuran file
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Ukuran file maksimal 10 MB" },
        { status: 400 }
      );
    }

    // Validasi tipe file berdasarkan MIME type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Tipe file tidak diizinkan. Gunakan PDF, JPG, PNG, atau WEBP." },
        { status: 400 }
      );
    }

    // Validasi ekstensi — sanitasi dari nama file asli (cegah path traversal)
    const originalExt = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(originalExt)) {
      return NextResponse.json(
        { error: "Ekstensi file tidak diizinkan." },
        { status: 400 }
      );
    }

    // Cek transaksi
    const [tx] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, txId))
      .limit(1);

    if (!tx) {
      return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });
    }

    const role = (session.user as any).role;
    const pemilik = tx.userId === session.user.id;
    if (!pemilik && role !== "admin" && role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // ── Batas unit ── admin yang bukan pemilik hanya boleh menyentuh pecahan
    // unit yang dikelolanya. Pemilik selalu boleh (dokumennya sendiri).
    if (!pemilik) {
      const tolak = await periksaAksesUnit(session, tx.unit);
      if (tolak) return NextResponse.json({ error: tolak.pesan }, { status: tolak.status });
    }

    if (tx.status !== "pending_signature" && tx.status !== "pending_approval") {
      return NextResponse.json(
        { error: "Transaksi ini tidak memerlukan upload dokumen." },
        { status: 400 }
      );
    }

    // Simpan file — nama file di-generate server-side (bukan dari input user)
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadDir = uploadPath("signed_forms");
    // mkdir dengan recursive:true sudah idempoten — tidak perlu existsSync
    await mkdir(uploadDir, { recursive: true });

    // Nama file: NamaPeminjam_DDMMYYYY_timestamp (timestamp untuk hindari duplikat)
    const borrowerSafe = (tx.borrowerName || "Peminjam")
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 40);
    const d = tx.borrowDate;
    const dateStr = `${String(new Date(d).getDate()).padStart(2,"0")}${String(new Date(d).getMonth()+1).padStart(2,"0")}${new Date(d).getFullYear()}`;
    const safeFilename = `PB_${borrowerSafe}_${dateStr}_${tx.id}${originalExt}`;
    const filePath = path.join(uploadDir, safeFilename);

    await writeFile(filePath, buffer);

    const signedDocumentUrl = `/uploads/signed_forms/${safeFilename}`;

    // ── Satu dokumen untuk SATU kelompok ──
    // Pengajuan user dipecah per unit di belakang layar, tapi user hanya
    // menandatangani SEKALI. Dokumen yang sama ditempelkan ke semua pecahan
    // dalam kelompok yang sama — kalau tidak, pecahan lain tetap menunggu
    // dokumen dan tak pernah bisa disetujui adminnya.
    const sesama =
      tx.grupId && pemilik
        ? await db
            .select({ id: transactions.id })
            .from(transactions)
            .where(
              and(
                eq(transactions.grupId, tx.grupId),
                eq(transactions.userId, tx.userId!),
                inArray(transactions.status, ["pending_signature", "pending_approval"])
              )
            )
        : [{ id: tx.id }];

    await db
      .update(transactions)
      .set({
        signedDocumentUrl,
        status: "pending_approval",
      })
      .where(inArray(transactions.id, sesama.map((r) => r.id)));

    return NextResponse.json({ success: true, url: signedDocumentUrl });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
