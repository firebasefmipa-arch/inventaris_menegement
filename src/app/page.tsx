import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Boxes, ArrowRight, Package, Clock, ShieldCheck, ChevronRight } from "lucide-react";
import { db } from "@/db";
import { items } from "@/db/schema";
import { gt, count } from "drizzle-orm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "PinjamBarang - Portal Peminjaman",
  description: "Pinjam peralatan dengan mudah. Login dulu, pilih barang, dan ajukan peminjaman.",
};

export default async function HomePage() {
  const session = await auth();

  // Jika sudah login, redirect sesuai role
  if (session?.user) {
    const role = (session.user as any).role;
    if (role === "admin" || role === "super_admin") {
      redirect("/admin");
    } else {
      redirect("/dashboard/pinjam");
    }
  }

  // Ambil jumlah barang tersedia untuk info
  const [{ total }] = await db
    .select({ total: count() })
    .from(items)
    .where(gt(items.availableQuantity, 0));

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Navbar */}
      <nav className="border-b border-gray-100 px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-500/25">
            <Boxes className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-gray-900 text-lg tracking-tight">PinjamBarang</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors px-3 py-1.5"
          >
            Masuk
          </Link>
          <Link
            href="/login"
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-xl transition-colors shadow-sm"
          >
            Daftar <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 text-center py-20">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold px-3.5 py-1.5 rounded-full mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
          {total} barang tersedia untuk dipinjam
        </div>

        {/* Heading */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight max-w-3xl">
          Butuh peralatan?{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
            Pinjam sekarang.
          </span>
        </h1>

        <p className="mt-6 text-lg text-gray-500 max-w-xl leading-relaxed">
          Login dengan akun Google kamu, pilih barang yang dibutuhkan, dan ajukan peminjaman
          dalam hitungan detik.
        </p>

        {/* CTA */}
        <div className="mt-10 flex flex-col sm:flex-row gap-3 items-center justify-center">
          <Link
            href="/login?callbackUrl=/dashboard/pinjam"
            className="group flex items-center gap-2.5 px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-base rounded-2xl shadow-xl shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-[1.02] transition-all duration-200"
          >
            <Package className="w-5 h-5" />
            Mulai Pinjam Barang
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        {/* Steps */}
        <div className="mt-20 grid sm:grid-cols-3 gap-6 max-w-2xl w-full">
          {[
            {
              icon: ShieldCheck,
              step: "1",
              title: "Login / Daftar",
              desc: "Masuk pakai akun Google kamu. Gratis dan cepat.",
              color: "bg-indigo-50 text-indigo-600",
            },
            {
              icon: Package,
              step: "2",
              title: "Pilih Barang",
              desc: "Cari dan pilih barang yang ingin dipinjam.",
              color: "bg-purple-50 text-purple-600",
            },
            {
              icon: Clock,
              step: "3",
              title: "Tunggu Konfirmasi",
              desc: "Admin akan memproses dan menghubungimu.",
              color: "bg-emerald-50 text-emerald-600",
            },
          ].map(({ icon: Icon, step, title, desc, color }) => (
            <div key={step} className="flex flex-col items-center text-center gap-3 p-6 bg-gray-50 rounded-2xl border border-gray-100">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
                <Icon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Langkah {step}</p>
                <h3 className="font-bold text-gray-900">{title}</h3>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-6 text-center text-xs text-gray-400">
        PinjamBarang &copy; {new Date().getFullYear()} &mdash; Sistem Peminjaman Barang
      </footer>
    </div>
  );
}
