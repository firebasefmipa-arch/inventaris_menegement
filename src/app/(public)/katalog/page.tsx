import { db } from "@/db";
import { items } from "@/db/schema";
import { eq, ilike, or, and } from "drizzle-orm";
import Link from "next/link";
import Image from "next/image";
import { Package } from "lucide-react";
import { KatalogClient } from "./KatalogClient";

export const dynamic = "force-dynamic";

export default async function KatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; category?: string }>;
}) {
  const params = await searchParams;
  const search = params.search || "";
  const category = params.category || "";

  const conditions = [eq(items.status, "available")]; // Only show available items for public
  
  if (search) {
    conditions.push(
      or(
        ilike(items.name, `%${search}%`),
        ilike(items.description || "", `%${search}%`)
      )!
    );
  }
  if (category) {
    conditions.push(eq(items.category, category));
  }

  const itemsData = await db
    .select()
    .from(items)
    .where(and(...conditions))
    .orderBy(items.name);

  // Get unique categories for available items
  const availableItems = await db.select({ category: items.category }).from(items).where(eq(items.status, "available"));
  const categories = [...new Set(availableItems.map((i) => i.category))];

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Public Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src="/fmipa-logo.png" alt="Logo FMIPA" width={32} height={32} className="rounded-lg object-contain" />
            <span className="font-bold text-gray-900 text-lg">Manajemen Inventaris</span>
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-gray-500 hover:text-indigo-600 transition-colors"
          >
            Masuk Admin
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 space-y-8">
        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-3xl p-8 sm:p-12 text-white shadow-xl shadow-indigo-600/10 overflow-hidden relative">
          <div className="absolute top-0 right-0 -translate-y-12 translate-x-1/3 opacity-10">
            <Package className="w-64 h-64" />
          </div>
          <div className="relative z-10 max-w-2xl">
            <h1 className="text-3xl sm:text-4xl font-bold mb-4">Katalog Peminjaman Barang</h1>
            <p className="text-indigo-100 text-lg">
              Cari dan pinjam barang yang Anda butuhkan dengan mudah. Pilih barang yang tersedia di bawah ini.
            </p>
          </div>
        </div>

        <KatalogClient 
          items={itemsData} 
          categories={categories} 
          currentSearch={search} 
          currentCategory={category} 
        />
      </main>
    </div>
  );
}
