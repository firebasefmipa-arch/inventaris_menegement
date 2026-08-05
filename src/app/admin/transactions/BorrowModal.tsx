"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { X, Save, Search, Check } from "lucide-react";
import { useToast } from "@/components/Toaster";
import { format } from "date-fns";

type Item = {
  id: number;
  name: string;
  category: string;
  availableQuantity: number;
  status: string;
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

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      fetch("/api/items?status=available")
        .then((r) => r.json())
        .then(setItems);
    }
  }, [isOpen]);

  // Close on Escape
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
    setSelectedItem(null);
    setItemSearch("");
    setShowItemDropdown(false);
    setBorrowerName("");
    setBorrowerDepartment("");
    setBorrowerEmail("");
    setBorrowerPhone("");
    setQuantity("1");
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
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl animate-[slideUp_300ms_ease-out] max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Pinjam Barang</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Catat peminjaman barang baru
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
            {/* Informasi Barang */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 border-b pb-1.5">
                Informasi Barang
              </h3>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
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
                    onBlur={() =>
                      setTimeout(() => setShowItemDropdown(false), 200)
                    }
                    className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  {showItemDropdown && filteredItems.length > 0 && (
                    <div className="absolute z-20 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                      {filteredItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setSelectedItem(item);
                            setShowItemDropdown(false);
                            setItemSearch(item.name);
                            setQuantity("1");
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between"
                        >
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {item.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {item.category} • {item.availableQuantity}{" "}
                              tersedia
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
                  <div className="mt-2 bg-indigo-50 rounded-xl p-2.5 flex items-center gap-3">
                    <Check className="w-4 h-4 text-indigo-600 shrink-0" />
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Jumlah <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={selectedItem?.availableQuantity || 1}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

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
              </div>
            </div>

            {/* Informasi Peminjam */}
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
                    Departemen / Kelas
                  </label>
                  <input
                    type="text"
                    value={borrowerDepartment}
                    onChange={(e) => setBorrowerDepartment(e.target.value)}
                    placeholder="Contoh: IT / XII RPL"
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
                  Catatan Peminjaman
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Tambahkan catatan jika perlu..."
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
            disabled={loading || !selectedItem || !borrowerName || !returnDate}
            className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            {loading ? "Menyimpan..." : "Simpan Peminjaman"}
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}
