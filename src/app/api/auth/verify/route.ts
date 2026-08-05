import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, verificationTokens } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: Request) {
  try {
    const { email, token } = await req.json();

    if (!email || !token) {
      return NextResponse.json(
        { message: "Email dan token harus diisi" },
        { status: 400 }
      );
    }

    // Find token
    const vTokens = await db
      .select()
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.identifier, email),
          eq(verificationTokens.token, token)
        )
      )
      .limit(1);

    const vToken = vTokens[0];

    if (!vToken) {
      return NextResponse.json(
        { message: "Kode verifikasi tidak valid" },
        { status: 400 }
      );
    }

    // Check expiration
    if (new Date() > new Date(vToken.expires)) {
      return NextResponse.json(
        { message: "Kode verifikasi sudah kedaluwarsa" },
        { status: 400 }
      );
    }

    // Update user status
    await db
      .update(users)
      .set({ 
        status: "active",
        emailVerified: new Date()
      })
      .where(eq(users.email, email));

    // Delete token
    await db
      .delete(verificationTokens)
      .where(
        and(
          eq(verificationTokens.identifier, email),
          eq(verificationTokens.token, token)
        )
      );

    return NextResponse.json(
      { message: "Akun berhasil diverifikasi! Anda sudah bisa masuk." },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Verification error:", error);
    return NextResponse.json(
      { message: "Terjadi kesalahan pada server" },
      { status: 500 }
    );
  }
}
