import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        nim: users.nim,
        department: users.department,
        image: users.image,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error("GET /api/user/profile error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, phone, nim, department } = await req.json();

    if (!name?.trim() || !phone?.trim() || !nim?.trim() || !department?.trim()) {
      return NextResponse.json(
        { error: "Nama, nomor HP, NIM/NIK, dan program studi/divisi wajib diisi" },
        { status: 400 }
      );
    }

    await db
      .update(users)
      .set({
        name: name.trim(),
        phone: phone.trim(),
        nim: nim.trim(),
        department: department.trim(),
      })
      .where(eq(users.id, session.user.id));

    return NextResponse.json({ message: "Profil berhasil diperbarui" });
  } catch (error) {
    console.error("PATCH /api/user/profile error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
