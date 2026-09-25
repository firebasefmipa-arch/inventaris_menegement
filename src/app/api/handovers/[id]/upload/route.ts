import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { handovers } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { formDataAman } from "@/lib/json-body";
import { auth } from "@/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { uploadPath } from "@/lib/upload-dir";
import { periksaAksesUnit } from "@/lib/akses-unit";

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

    const formData = await formDataAman(request);
    if (!formData) return NextResponse.json({ error: "Berkas tidak ditemukan" }, { status: 400 });
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
    const pemilik = hv.userId === session.user.id;
    if (!pemilik && role !== "admin" && role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // ── Batas unit ── admin yang bukan pemilik hanya boleh menyentuh pecahan
    // unit yang dikelolanya.
    if (!pemilik) {
      const tolak = await periksaAksesUnit(session, hv.unit);
      if (tolak) return NextResponse.json({ error: tolak.pesan }, { status: tolak.status });
    }

    if (hv.status !== "pending_signature") {
      return NextResponse.json({ error: "Tidak perlu upload dokumen untuk status ini." }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadDir = uploadPath("handovers");
    await mkdir(uploadDir, { recursive: true });

    // Nama file: NamaPenerima_DDMMYYYY (format konsisten dengan peminjaman)
    const receiverSafe = (hv.receiverName || "Penerima")
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 40);
    const d = hv.handoverDate;
    const dateStr = `${String(new Date(d).getDate()).padStart(2,"0")}${String(new Date(d).getMonth()+1).padStart(2,"0")}${new Date(d).getFullYear()}`;
    const safeFilename = `ST_${receiverSafe}_${dateStr}_${hv.id}${originalExt}`;
    const filePath = path.join(uploadDir, safeFilename);
    await writeFile(filePath, buffer);

    const signedDocumentUrl = `/uploads/handovers/${safeFilename}`;

    // ── Satu dokumen untuk SATU kelompok ──
    // Serah terima juga dipecah per unit; user menandatangani sekali saja.
    const sesama =
      hv.grupId && pemilik
        ? await db
            .select({ id: handovers.id })
            .from(handovers)
            .where(
              and(
                eq(handovers.grupId, hv.grupId),
                eq(handovers.userId, hv.userId!),
                inArray(handovers.status, ["pending_signature", "pending_approval"])
              )
            )
        : [{ id: hv.id }];

    await db.update(handovers).set({
      signedDocumentUrl,
      status: "pending_approval",
    }).where(inArray(handovers.id, sesama.map((r) => r.id)));

    return NextResponse.json({ success: true, url: signedDocumentUrl });
  } catch (error) {
    console.error("Upload handover error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
