"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { X, Save, Search, Check, Plus, Trash2, Package } from "lucide-react";
import { useToast } from "@/components/Toaster";
import { format } from "date-fns";

type Item = {
  id: number;
  name: string;
  category: string;
  availableQuantity: number;
  status: string;
};

type CartItem = {
  item: Item;
  quantity: number;
  notes: string;
};

interface BorrowModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BorrowModal({ isOpen, onClose }: BorrowModalProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Item[]>([]);

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);

  // Search state
  const [itemSearch, setItemSearch] = useState("");
  const [showItemDropdown, setShowItemDropdown] = useState(false);

  // Borrower info
  const [borrowerName, setBorrowerName] = useState("");
  const [borrowerDepartment, setBorrowerDepartment] = useState("");
  const [borrowerEmail, setBorrowerEmail] = useState("");
  const [borrowerPhone, setBorrowerPhone] = useState("");
  const [borrowerNim, setBorrowerNim] = useState("");
  const [borrowerLocation, setBorrowerLocation] = useState("");
  const [returnDate, setReturnDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 3);
    return format(date, "yyyy-MM-dd");
  });
  const [notes, setNotes] = useState("");

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      fetch("/api/items?limit=200")
        .then((r) => r.json())
        .then((data) => setItems(Array.isArray(data) ? data : data.items || []));
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  const resetForm = () => {
    setCart([]);
    setItemSearch("");
    setShowItemDropdown(false);
    setBorrowerName("");
    setBorrowerDepartment("");
    setBorrowerEmail("");
    setBorrowerPhone("");
    setBorrowerNim("");
    setBorrowerLocation("");
    setReturnDate(() => {
      const date = new Date();
      date.setDate(date.getDate() + 3);
      return format(date, "yyyy-MM-dd");
    });
    setNotes("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // Items yang sudah ada di cart tidak ditampilkan di dropdown
  const cartItemIds = new Set(cart.map((c) => c.item.id));
  const filteredItems = items.filter(
    (item) =>
      item.availableQuantity > 0 &&
      !cartItemIds.has(item.id) &&
      item.name.toLowerCase().includes(itemSearch.toLowerCase())
  );

  const addToCart = (item: Item) => {
    setCart((prev) => [...prev, { item, quantity: 1, notes: "" }]);
    setItemSearch("");
    setShowItemDropdown(false);
  };

  const removeFromCart = (itemId: number) => {
    setCart((prev) => prev.filter((c) => c.item.id !== itemId));
  };

  const updateCartQuantity = (itemId: number, qty: number) => {
    setCart((prev) =>
      prev.map((c) =>
        c.item.id === itemId
          ? { ...c, quantity: Math.max(1, Math.min(qty, c.item.availableQuantity)) }
          : c
      )
    );
  };

  const updateCartNotes = (itemId: number, notes: string) => {
    setCart((prev) =>
      prev.map((c) => (c.item.id === itemId ? { ...c, notes } : c))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      toast("Pilih minimal satu barang", "error");
      return;
    }
    if (!borrowerName || !borrowerDepartment || !returnDate) {
      toast("Lengkapi semua data yang diperlukan", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Multi-item cart
          cart: cart.map((c) => ({
            itemId: c.item.id,
            quantity: c.quantity,
            notes: c.notes || null,
          })),
          borrowerName,
          borrowerDepartment,
          borrowerEmail: borrowerEmail || null,
          borrowerPhone: borrowerPhone || null,
          borrowerNim: borrowerNim || null,
          borrowerLocation: borrowerLocation || null,
          expectedReturnDate: returnDate,
          notes: notes || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Gagal menyimpan transaksi");
      }

      toast(`${cart.length} barang berhasil dipinjamkan`, "success");
      handleClose();
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-[fadeIn_200ms_ease-out]"
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl animate-[slideUp_300ms_ease-out] max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Pinjam Barang</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Catat peminjaman — bisa lebih dari 1 barang sekaligus
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body (scrollable) */}
        <div className="overflow-y-auto px-6 py-5 flex-1">
          <form id="borrow-form" onSubmit={handleSubmit} className="space-y-5">

            {/* ── Tanggal Kembali (global) ── */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Tanggal Kembali <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                min={format(new Date(), "yyyy-MM-dd")}
                required
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            {/* ── Daftar Barang (Cart) ── */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 border-b pb-1.5 flex items-center gap-2">
                <Package className="w-4 h-4 text-indigo-500" />
                Daftar Barang
                {cart.length > 0 && (
                  <span className="ml-auto text-xs font-medium bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                    {cart.length} barang
                  </span>
                )}
              </h3>

              {/* Search tambah barang */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Cari dan tambah barang..."
                  value={itemSearch}
                  onChange={(e) => {
                    setItemSearch(e.target.value);
                    setShowItemDropdown(true);
                  }}
                  onFocus={() => setShowItemDropdown(true)}
                  onBlur={() => setTimeout(() => setShowItemDropdown(false), 200)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                {showItemDropdown && filteredItems.length > 0 && (
                  <div className="absolute z-20 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {filteredItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => addToCart(item)}
                        className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 flex items-center justify-between transition-colors"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">{item.name}</p>
                          <p className="text-xs text-gray-500">
                            {item.category} • {item.availableQuantity} tersedia
                          </p>
                        </div>
                        <Plus className="w-4 h-4 text-indigo-500 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
                {showItemDropdown && itemSearch && filteredItems.length === 0 && (
                  <div className="absolute z-20 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-sm text-gray-400">
                    Tidak ada barang tersedia
                  </div>
                )}
              </div>

              {/* Cart items */}
              {cart.length === 0 ? (
                <div className="text-center py-6 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                  <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Belum ada barang dipilih</p>
                  <p className="text-xs text-gray-300 mt-1">Cari dan tambah barang di atas</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {cart.map((c, idx) => (
                    <div
                      key={c.item.id}
                      className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-indigo-600 bg-indigo-100 rounded-lg w-6 h-6 flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{c.item.name}</p>
                          <p className="text-xs text-gray-500">{c.item.category} • maks {c.item.availableQuantity}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <label className="text-xs text-gray-500">Jml:</label>
                          <input
                            type="number"
                            min={1}
                            max={c.item.availableQuantity}
                            value={c.quantity}
                            onChange={(e) => updateCartQuantity(c.item.id, parseInt(e.target.value) || 1)}
                            className="w-16 px-2 py-1 bg-white border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={() => removeFromCart(c.item.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={c.notes}
                        onChange={(e) => updateCartNotes(c.item.id, e.target.value)}
                        placeholder="Catatan untuk barang ini (opsional)"
                        className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Informasi Peminjam ── */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 border-b pb-1.5">
                Informasi Peminjam
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Nama Peminjam <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={borrowerName}
                    onChange={(e) => setBorrowerName(e.target.value)}
                    required
                    placeholder="Masukkan nama"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Divisi / Prodi <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={borrowerDepartment}
                    onChange={(e) => setBorrowerDepartment(e.target.value)}
                    required
                    placeholder="Contoh: Divisi TI / S1 Statistika"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    NIM / NIK
                  </label>
                  <input
                    type="text"
                    value={borrowerNim}
                    onChange={(e) => setBorrowerNim(e.target.value)}
                    placeholder="Opsional"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Lokasi
                  </label>
                  <input
                    type="text"
                    value={borrowerLocation}
                    onChange={(e) => setBorrowerLocation(e.target.value)}
                    placeholder="Gedung A Lt.2 (opsional)"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={borrowerEmail}
                    onChange={(e) => setBorrowerEmail(e.target.value)}
                    placeholder="Email (opsional)"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Nomor HP
                  </label>
                  <input
                    type="tel"
                    value={borrowerPhone}
                    onChange={(e) => setBorrowerPhone(e.target.value)}
                    placeholder="Contoh: 0812..."
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Catatan Umum
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Tambahkan catatan umum jika perlu..."
                  rows={2}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
                />
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 text-sm font-medium transition-colors"
          >
            Batal
          </button>
          <button
            type="submit"
            form="borrow-form"
            disabled={loading || cart.length === 0 || !borrowerName || !borrowerDepartment || !returnDate}
            className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            {loading ? "Menyimpan..." : `Simpan${cart.length > 0 ? ` (${cart.length} barang)` : ""}`}
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
