"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { X, Save, Plus } from "lucide-react";
import { useToast } from "@/components/Toaster";
import { AVAILABLE_ICONS_LIST } from "@/lib/iconMap";

const CATEGORY_SUGGESTIONS = [
  "Elektronik",
  "Audio",
  "Fotografi",
  "Peralatan Acara",
  "Olahraga",
  "Kendaraan",
  "Alat Tulis",
];

interface ItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingCategories: string[];
}

export function ItemModal({ isOpen, onClose, existingCategories }: ItemModalProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showCustomCategory, setShowCustomCategory] = useState(false);
  
  const [form, setForm] = useState({
    name: "",
    category: "",
    description: "",
    quantity: "1",
    location: "",
    imageUrl: "", // We will store the chosen icon name here for custom categories
    sn: "",
    noinvdti: "",
    noasset: "",
    tanggalcek: "",
    kondisi: "",
  });

  const modalRef = useRef<HTMLDivElement>(null);

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
    setForm({
      name: "",
      category: "",
      description: "",
      quantity: "1",
      location: "",
      imageUrl: "",
      sn: "",
      noinvdti: "",
      noasset: "",
      tanggalcek: "",
      kondisi: "",
    });
    setShowCustomCategory(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const allCategories = Array.from(new Set([...CATEGORY_SUGGESTIONS, ...existingCategories]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (showCustomCategory) {
        const customCat = form.category.trim();
        if (!customCat) {
          toast("Nama kategori custom tidak boleh kosong.", "error");
          setLoading(false);
          return;
        }
        // Tidak perlu cek duplikat — biarkan user memakai nama apapun
      }

      if (!form.name) {
        toast("Nama barang wajib diisi", "error");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          category: form.category || "Umum",
          description: form.description?.trim() || null,
          sn: form.sn?.trim() || null,
          inventoryNumber: form.noinvdti?.trim() || null,
          assetNumber: form.noasset?.trim() || null,
          lastCheckDate: form.tanggalcek?.trim() || null,
          condition: form.kondisi?.trim() || null,
          quantity: parseInt(form.quantity),
          location: form.location || null,
          imageUrl: form.imageUrl || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Gagal menambah barang");
      }

      toast("Barang berhasil ditambahkan", "success");
      handleClose();
      router.refresh();
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Gagal menambah barang",
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
            <h2 className="text-lg font-bold text-gray-900">Tambah Barang</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Tambahkan barang baru ke dalam inventaris
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 flex-1">
          <form id="add-item-form" onSubmit={handleSubmit} className="space-y-4">
            {/* Nama */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Nama Barang <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Contoh: Proyektor Epson EB-X41"
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                required
              />
            </div>

            {/* Kategori */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Kategori <span className="text-red-500">*</span>
              </label>
              {!showCustomCategory ? (
                <div className="flex gap-2">
                  <select
                    value={form.category}
                    onChange={(e) => {
                      if (e.target.value === "custom") {
                        setShowCustomCategory(true);
                        setForm({ ...form, category: "", imageUrl: "" });
                      } else {
                        setForm({ ...form, category: e.target.value });
                      }
                    }}
                    className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none"
                    required
                  >
                    <option value="" disabled>Pilih Kategori</option>
                    {allCategories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <option value="custom">+ Tambah Kategori Baru</option>
                  </select>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      placeholder="Nama kategori baru"
                      className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setShowCustomCategory(false);
                        setForm({ ...form, category: "", imageUrl: "" });
                      }}
                      className="px-3 py-2 text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors shrink-0"
                    >
                      Batal
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-2">Pilih Ikon</label>
                    <div className="grid grid-cols-6 gap-2">
                      {AVAILABLE_ICONS_LIST.map((icon) => (
                        <button
                          key={icon.name}
                          type="button"
                          onClick={() => setForm({ ...form, imageUrl: icon.name })}
                          className={`p-2 flex items-center justify-center rounded-xl border transition-all ${
                            form.imageUrl === icon.name
                              ? "border-indigo-600 bg-indigo-50 text-indigo-600"
                              : "border-gray-200 bg-white text-gray-500 hover:border-indigo-200 hover:bg-gray-50"
                          }`}
                          title={icon.name}
                        >
                          <icon.icon className="w-5 h-5" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Spesifikasi */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Spesifikasi
              </label>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="Spesifikasi singkat tentang barang..."
                rows={2}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
              />
            </div>

            {/* Informasi Teknis tambahan */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">SN</label>
                <input
                  type="text"
                  value={form.sn}
                  onChange={(e) => setForm({ ...form, sn: e.target.value })}
                  placeholder="Serial Number"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">No. Inv DTI</label>
                <input
                  type="text"
                  value={form.noinvdti}
                  onChange={(e) => setForm({ ...form, noinvdti: e.target.value })}
                  placeholder="FMIPA-1-23-0005"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">No. Asset</label>
                <input
                  type="text"
                  value={form.noasset}
                  onChange={(e) => setForm({ ...form, noasset: e.target.value })}
                  placeholder="No. Asset"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tanggal Cek</label>
                <input
                  type="date"
                  value={form.tanggalcek}
                  onChange={(e) => setForm({ ...form, tanggalcek: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Kondisi</label>
                <select
                  value={form.kondisi}
                  onChange={(e) => setForm({ ...form, kondisi: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none appearance-none"
                >
                  <option value="">Pilih Kondisi</option>
                  <option value="Baik">Baik</option>
                  <option value="Rusak">Rusak</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Jumlah */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Jumlah Total Barang
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* Lokasi */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Lokasi
                </label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Contoh: Ruang Server Lt.2"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
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
            form="add-item-form"
            disabled={loading || !form.name}
            className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            {loading ? "Menyimpan..." : "Simpan Barang"}
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

