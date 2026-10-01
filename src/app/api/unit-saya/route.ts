import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { batasUnit } from "@/lib/akses-unit";

/**
 * Unit yang dikelola pemakai yang sedang masuk.
 *
 * Dipakai layar untuk menolong SEBELUM gagal: pemilih unit hanya menawarkan
 * unit yang memang haknya, dan mengisi sendiri kalau cuma satu.
 *
 * Untuk superadmin dikirim `null` — artinya "semua unit", bukan "tidak punya".
 * Server TETAP memeriksa ulang di setiap penyimpanan; jawaban di sini hanya
 * untuk kenyamanan layar, bukan pengaman.
 */
export async function GET() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!session?.user || (role !== "admin" && role !== "super_admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ units: await batasUnit(session) });
}
