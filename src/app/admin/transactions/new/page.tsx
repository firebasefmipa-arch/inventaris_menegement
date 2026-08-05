"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Search, Check } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/Toaster";
import { format } from "date-fns";

type Item = {
  id: number;
  name: string;
  category: string;
  availableQuantity: number;
  status: string;
};

export default function NewTransactionPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [itemSearch, setItemSearch] = useState("");
  const [showItemDropdown, setShowItemDropdown] = useState(false);

  const [borrowerName, setBorrowerName] = useState("");
  const [borrowerDepartment, setBorrowerDepartment] = useState("");
  const [borrowerEmail, setBorrowerEmail] = useState("");
  const [borrowerPhone, setBorrowerPhone] = useState("");

  const [quantity, setQuantity] = useState("1");
  const [returnDate, setReturnDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 3);
    return format(date, "yyyy-MM-dd");
  });
  const [notes, setNotes] = useState("");

  useEffect(() => {
    fetch("/api/items?status=available")
      .then((r) => r.json())
      .then(setItems);
  }, []);

  const filteredItems = items.filter(
    (item) =>
      item.availableQuantity > 0 &&
      item.name.toLowerCase().includes(itemSearch.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !borrowerName || !returnDate) {
      toast("Lengkapi semua data yang diperlukan", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: selectedItem.id,
          borrowerName,
          borrowerDepartment,
          borrowerEmail,
          borrowerPhone,
          quantity: parseInt(quantity),
          expectedReturnDate: returnDate,
          notes: notes || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Gagal menyimpan transaksi");
      }

      toast("Barang berhasil dipinjamkan", "success");
      router.push("/admin/transactions");
      router.refresh();
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Gagal meminjamkan barang",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pt-12 lg:pt-0 max-w-2xl">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/transactions"
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-500" />
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Pinjam Barang</h2>
          <p className="text-gray-500 text-sm mt-1">
            Catat peminjaman barang baru (Satu Langkah)
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900 border-b pb-2">Informasi Barang</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Pilih Barang <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Cari barang..."
                  value={itemSearch}
                  onChange={(e) => {
                    setItemSearch(e.target.value);
                    setShowItemDropdown(true);
                  }}
                  onFocus={() => setShowItemDropdown(true)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                {showItemDropdown && filteredItems.length > 0 && (
                  <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                    {filteredItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedItem(item);
                          setShowItemDropdown(false);
                          setItemSearch(item.name);
                          setQuantity("1");
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center justify-between"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {item.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {item.category} • {item.availableQuantity} tersedia
                          </p>
                        </div>
                        {selectedItem?.id === item.id && (
                          <Check className="w-4 h-4 text-indigo-600" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              {selectedItem && (
                <div className="mt-2 bg-indigo-50 rounded-xl p-3 flex items-center gap-3">
                  <Check className="w-4 h-4 text-indigo-600" />
                  <div>
                    <p className="text-sm font-medium text-indigo-900">
                      {selectedItem.name}
                    </p>
                    <p className="text-xs text-indigo-700">
                      Tersedia: {selectedItem.availableQuantity} unit
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Jumlah <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                max={selectedItem?.availableQuantity || 1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Tanggal Kembali <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                min={format(new Date(), "yyyy-MM-dd")}
                required
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="space-y-4 pt-4">
            <h3 className="font-semibold text-gray-900 border-b pb-2">Informasi Peminjam</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Nama Peminjam <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={borrowerName}
                  onChange={(e) => setBorrowerName(e.target.value)}
                  required
                  placeholder="Masukkan nama"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Departemen / Kelas
                </label>
                <input
                  type="text"
                  value={borrowerDepartment}
                  onChange={(e) => setBorrowerDepartment(e.target.value)}
                  placeholder="Contoh: IT / XII RPL"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={borrowerEmail}
                  onChange={(e) => setBorrowerEmail(e.target.value)}
                  placeholder="Email aktif (opsional)"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Nomor HP
                </label>
                <input
                  type="tel"
                  value={borrowerPhone}
                  onChange={(e) => setBorrowerPhone(e.target.value)}
                  placeholder="Contoh: 0812..."
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Catatan Peminjaman
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Tambahkan catatan jika perlu..."
                rows={2}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
              />
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <Link
              href="/admin/transactions"
              className="flex-1 text-center py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 text-sm font-medium transition-colors"
            >
              Batal
            </Link>
            <button
              type="submit"
              disabled={loading || !selectedItem || !borrowerName || !returnDate}
              className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              {loading ? "Menyimpan..." : "Simpan Peminjaman"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
