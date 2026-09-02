import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { bp } from "@/lib/basepath";

export const dynamic = "force-dynamic";

/**
 * Route ini dipanggil setelah Google OAuth selesai.
 * Tugasnya: baca role dari session lalu redirect ke halaman yang benar.
 */
export async function GET(req: NextRequest) {
  const session = await auth();

  const base = process.env.NEXTAUTH_URL || `https://${req.headers.get("host")}`;

  if (!session?.user?.id) {
    return NextResponse.redirect(new URL(bp("/login"), base));
  }

  const [dbUser] = await db
    .select({
      role: users.role,
      phone: users.phone,
      department: users.department,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!dbUser) {
    return NextResponse.redirect(new URL(bp("/login"), base));
  }

  const { role, phone, department } = dbUser;

  if (role === "admin" || role === "super_admin") {
    return NextResponse.redirect(new URL(bp("/admin"), base));
  }

  if (!phone || !department) {
    return NextResponse.redirect(new URL(bp("/register/complete"), base));
  }

  return NextResponse.redirect(new URL(bp("/dashboard/pinjam"), base));
}
