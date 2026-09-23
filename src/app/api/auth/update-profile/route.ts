import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jsonBody } from "@/lib/json-body";

export async function POST(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { message: "Anda belum login" },
        { status: 401 }
      );
    }

    const body = await jsonBody<{ phone?: string; department?: string }>(req);
    if (!body) return NextResponse.json({ error: "Body permintaan tidak valid" }, { status: 400 });
    const { phone, department } = body;

    if (!phone || !department) {
      return NextResponse.json(
        { message: "No HP dan Departemen harus diisi" },
        { status: 400 }
      );
    }

    await db
      .update(users)
      .set({ phone, department })
      .where(eq(users.id, session.user.id));

    return NextResponse.json(
      { message: "Profil berhasil diperbarui" },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Update profile error:", error);
    return NextResponse.json(
      { message: "Terjadi kesalahan pada server" },
      { status: 500 }
    );
  }
}
