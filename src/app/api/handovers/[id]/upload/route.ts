import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { handovers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const hvId = parseInt(id, 10);
    if (isNaN(hvId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "File tidak ditemukan" }, { status: 400 });

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Ukuran file maksimal 10 MB" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Tipe file tidak diizinkan. Gunakan PDF, JPG, atau PNG." }, { status: 400 });
    }

    const originalExt = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(originalExt)) {
      return NextResponse.json({ error: "Ekstensi file tidak diizinkan." }, { status: 400 });
    }

    const [hv] = await db.select().from(handovers).where(eq(handovers.id, hvId)).limit(1);
    if (!hv) return NextResponse.json({ error: "Serah terima tidak ditemukan" }, { status: 404 });

    const role = (session.user as any).role;
    if (hv.userId !== session.user.id && role !== "admin" && role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (hv.status !== "pending_signature") {
      return NextResponse.json({ error: "Tidak perlu upload dokumen untuk status ini." }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadDir = path.join(process.cwd(), "public", "uploads", "handovers");
    await mkdir(uploadDir, { recursive: true });

    // Nama file: NamaPenerima_DDMMYYYY (format konsisten dengan peminjaman)
    const receiverSafe = (hv.receiverName || "Penerima")
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 40);
    const d = hv.handoverDate;
    const dateStr = `${String(new Date(d).getDate()).padStart(2,"0")}${String(new Date(d).getMonth()+1).padStart(2,"0")}${new Date(d).getFullYear()}`;
    const safeFilename = `${receiverSafe}_${dateStr}${originalExt}`;
    const filePath = path.join(uploadDir, safeFilename);
    await writeFile(filePath, buffer);

    const signedDocumentUrl = `/uploads/handovers/${safeFilename}`;

    await db.update(handovers).set({
      signedDocumentUrl,
      status: "pending_approval",
    }).where(eq(handovers.id, hvId));

    return NextResponse.json({ success: true, url: signedDocumentUrl });
  } catch (error) {
    console.error("Upload handover error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
