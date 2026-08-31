import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { writeFile, mkdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const ALLOWED_EXT = [".png", ".jpg", ".jpeg", ".webp"];

// GET — ambil URL TTD user saat ini
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [user] = await db
    .select({ signatureUrl: users.signatureUrl })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  return NextResponse.json({ signatureUrl: user?.signatureUrl ?? null });
}

// POST — upload TTD baru
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return NextResponse.json({ error: "File tidak ditemukan" }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: "Ukuran file maksimal 5 MB" }, { status: 400 });
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Hanya PNG, JPG, atau WEBP yang diizinkan" }, { status: 400 });
    }

    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      return NextResponse.json({ error: "Ekstensi file tidak valid" }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads", "signatures");
    await mkdir(uploadDir, { recursive: true });

    // Hapus TTD lama jika ada
    const [existing] = await db
      .select({ signatureUrl: users.signatureUrl })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    if (existing?.signatureUrl) {
      const oldPath = path.join(process.cwd(), "public", existing.signatureUrl);
      if (existsSync(oldPath)) {
        await unlink(oldPath).catch(() => {});
      }
    }

    // Simpan file baru — nama berdasarkan user ID agar tidak konflik
    const safeId = session.user.id.replace(/[^a-zA-Z0-9]/g, "_");
    const filename = `sig_${safeId}${ext}`;
    const filePath = path.join(uploadDir, filename);

    const bytes = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));

    const signatureUrl = `/uploads/signatures/${filename}`;

    await db
      .update(users)
      .set({ signatureUrl })
      .where(eq(users.id, session.user.id));

    return NextResponse.json({ success: true, signatureUrl });
  } catch (error) {
    console.error("POST /api/user/signature error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan" }, { status: 500 });
  }
}

// DELETE — hapus TTD
export async function DELETE() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [user] = await db
      .select({ signatureUrl: users.signatureUrl })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    if (user?.signatureUrl) {
      const filePath = path.join(process.cwd(), "public", user.signatureUrl);
      if (existsSync(filePath)) await unlink(filePath).catch(() => {});
    }

    await db.update(users).set({ signatureUrl: null }).where(eq(users.id, session.user.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Terjadi kesalahan" }, { status: 500 });
  }
}
