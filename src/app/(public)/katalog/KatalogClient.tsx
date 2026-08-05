"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, MapPin, Package, Calendar } from "lucide-react";
import { useToast } from "@/components/Toaster";
import { format } from "date-fns";

type Item = {
  id: number;
  name: string;
  category: string;
  description: string | null;
  availableQuantity: number;
  location: string | null;
};

interface Props {
  items: Item[];
  categories: string[];
  currentSearch: string;
  currentCategory: string;
}

export function KatalogClient({ items, categories, currentSearch, currentCategory }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  
  const [search, setSearch] = useState(currentSearch);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  
  // Borrow form state
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    department: "",
    email: "",
    phone: "",
    quantity: "1",
    returnDate: "",
    notes: "",
  });

  const applyFilter = (key: string, value: string) => {
    const params = new URLSearchParams(window.location.search);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/katalog?${params.toString()}`);
  };

  const handleBorrow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    
    setLoading(true);
    try {
      // Create borrower or get existing one by name/email logic inside the API
      // Since our POST /api/borrowers creates one, we'll call that first, then create the transaction.
      // Alternatively, we could create a specialized endpoint for public borrow requests.
      // Let's create a specialized endpoint or just make two calls.
      
      const res = await fetch("/api/public/borrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: selectedItem.id,
          ...form,
          quantity: parseInt(form.quantity)
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Gagal memproses peminjaman");
      }

      toast("Permintaan peminjaman berhasil dikirim!", "success");
      setSelectedItem(null);
      
      // Reset form but keep user details for convenience
      setForm(f => ({ ...f, quantity: "1", returnDate: "", notes: "" }));
      router.refresh();
      
    } catch (err) {
      toast(err instanceof Error ? err.message : "Terjadi kesalahan", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Cari nama atau deskripsi barang..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyFilter("search", search);
            }}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={currentCategory}
            onChange={(e) => applyFilter("category", e.target.value)}
            className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 min-w-[160px]"
          >
            <option value="">Semua Kategori</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <button
            onClick={() => applyFilter("search", search)}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm font-medium transition-colors shadow-sm shadow-indigo-600/20"
          >
            Cari
          </button>
        </div>
      </div>

      {/* Grid */}
      {items.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center">
          <Package className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-700 mb-2">Barang Tidak Ditemukan</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            Maaf, tidak ada barang yang tersedia dengan filter pencarian tersebut saat ini.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-xl hover:shadow-indigo-500/5 hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col"
            >
              <div className="p-5 flex-1">
                <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-4">
                  <Package className="w-6 h-6" />
                </div>
                <div className="mb-2">
                  <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">
                    {item.category}
                  </span>
                </div>
                <h3 className="font-bold text-gray-900 text-lg mb-2 line-clamp-1" title={item.name}>
                  {item.name}
                </h3>
                {item.description && (
                  <p className="text-sm text-gray-500 line-clamp-2 mb-4 h-10">
                    {item.description}
                  </p>
                )}
                {item.location && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-auto">
                    <MapPin className="w-3.5 h-3.5" />
                    <span className="truncate">{item.location}</span>
                  </div>
                )}
              </div>
              <div className="p-5 border-t border-gray-50 bg-gray-50/50 flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Stok Tersedia</span>
                  <span className="font-bold text-lg text-emerald-600">
                    {item.availableQuantity}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedItem(item)}
                  className="w-full py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm font-semibold transition-colors shadow-sm"
                >
                  Pinjam Sekarang
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Borrow Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden my-8 animate-slide-in">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-lg font-bold text-gray-900">Form Peminjaman Barang</h3>
              <button 
                onClick={() => setSelectedItem(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-500 transition-colors"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6">
              <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex gap-4 mb-6">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shrink-0 shadow-sm">
                  <Package className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <h4 className="font-bold text-indigo-950">{selectedItem.name}</h4>
                  <p className="text-sm text-indigo-700/80 mt-0.5">Tersedia {selectedItem.availableQuantity} unit untuk dipinjam</p>
                </div>
              </div>

              <form onSubmit={handleBorrow} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap *</label>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={e => setForm({...form, name: e.target.value})}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Departemen/Divisi *</label>
                    <input
                      type="text"
                      required
                      value={form.department}
                      onChange={e => setForm({...form, department: e.target.value})}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => setForm({...form, email: e.target.value})}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nomor WhatsApp *</label>
                    <input
                      type="text"
                      required
                      value={form.phone}
                      onChange={e => setForm({...form, phone: e.target.value})}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Jumlah Pinjam *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      max={selectedItem.availableQuantity}
                      value={form.quantity}
                      onChange={e => setForm({...form, quantity: e.target.value})}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tgl Pengembalian *</label>
                    <div className="relative">
                      <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      <input
                        type="date"
                        required
                        min={format(new Date(), "yyyy-MM-dd")}
                        value={form.returnDate}
                        onChange={e => setForm({...form, returnDate: e.target.value})}
                        className="w-full pl-4 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all appearance-none"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tujuan Peminjaman</label>
                  <textarea
                    rows={2}
                    value={form.notes}
                    onChange={e => setForm({...form, notes: e.target.value})}
                    placeholder="Deskripsikan keperluan peminjaman barang ini..."
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all resize-none"
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedItem(null)}
                    className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-[2] px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/30"
                  >
                    {loading ? "Memproses..." : "Ajukan Peminjaman"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
