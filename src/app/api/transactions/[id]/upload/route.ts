import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

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

    const formData = await request.formData();
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
    if (
      tx.userId !== session.user.id &&
      role !== "admin" &&
      role !== "super_admin"
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
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

    const uploadDir = path.join(process.cwd(), "public", "uploads", "signed_forms");
    // mkdir dengan recursive:true sudah idempoten — tidak perlu existsSync
    await mkdir(uploadDir, { recursive: true });

    // Nama file aman: hanya angka + ekstensi yang sudah divalidasi
    const safeFilename = `signed_${txId}_${Date.now()}${originalExt}`;
    const filePath = path.join(uploadDir, safeFilename);

    await writeFile(filePath, buffer);

    const signedDocumentUrl = `/uploads/signed_forms/${safeFilename}`;

    await db
      .update(transactions)
      .set({
        signedDocumentUrl,
        status: "pending_approval",
      })
      .where(eq(transactions.id, tx.id));

    return NextResponse.json({ success: true, url: signedDocumentUrl });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
