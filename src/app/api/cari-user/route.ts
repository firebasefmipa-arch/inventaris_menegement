import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { cariAkunSaran } from "@/lib/cari-akun-saran";

/**
 * Daftar saran penerima untuk form pinjam admin.
 *
 * Aturan penyaringnya ada di `cariAkunSaran()` supaya sama persis dengan yang
 * diuji penjaga `check:sambung`.
 *
 * Hasilnya sengaja hanya dikirim saat `?cari=` minimal 2 huruf — supaya tidak
 * ada yang bisa menyedot seluruh daftar akun hanya dengan membuka alamat ini.
 * Yang dikirim hanya data diri untuk MENGISI FORM (nama, email, hp, nim,
 * divisi). Kata sandi & tanda tangan tidak ikut.
 */
export async function GET(req: Request) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || (role !== "admin" && role !== "super_admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cari = new URL(req.url).searchParams.get("cari") ?? "";
  return NextResponse.json({ akun: await cariAkunSaran(cari) });
}
