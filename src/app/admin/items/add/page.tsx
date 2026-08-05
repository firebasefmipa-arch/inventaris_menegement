"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Package } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/Toaster";

const CATEGORY_SUGGESTIONS = [
  "Elektronik",
  "Audio",
  "Fotografi",
  "Peralatan Acara",
  "Olahraga",
  "Kendaraan",
  "Alat Tulis",
  "Lainnya",
];

export default function AddItemPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.category) {
      toast("Nama dan kategori wajib diisi", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          category: form.category,
          description: [
            form.description?.trim(),
            form.sn ? `SN: ${form.sn.trim()}` : null,
            form.noinvdti ? `No.Inv: ${form.noinvdti.trim()}` : null,
            form.noasset ? `No.Asset: ${form.noasset.trim()}` : null,
            form.tanggalcek ? `Tanggal Cek: ${form.tanggalcek.trim()}` : null,
            form.kondisi ? `Kondisi: ${form.kondisi.trim()}` : null,
          ]
            .filter(Boolean)
            .join(" | ") || null,
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
      router.push("/admin/items");
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

  return (
    <div className="space-y-6 pt-12 lg:pt-0 max-w-2xl">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/items"
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-500" />
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Tambah Barang</h2>
          <p className="text-gray-500 text-sm mt-1">
            Tambahkan barang baru ke dalam inventaris
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5"
      >
        {/* Nama */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Nama Barang <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Contoh: Proyektor Epson EB-X41"
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            required
          />
        </div>

        {/* Kategori */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Kategori <span className="text-red-500">*</span>
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {CATEGORY_SUGGESTIONS.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setForm({ ...form, category: cat })}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                  form.category === cat
                    ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                    : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            placeholder="Atau ketik kategori custom..."
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            required
          />
        </div>

        {/* Deskripsi */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Deskripsi
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Deskripsi singkat tentang barang..."
            rows={3}
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
          />
        </div>

        {/* Informasi Teknis tambahan */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">SN</label>
            <input
              type="text"
              value={form.sn}
              onChange={(e) => setForm({ ...form, sn: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">No. Inv DTI</label>
            <input
              type="text"
              value={form.noinvdti}
              onChange={(e) => setForm({ ...form, noinvdti: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">No. Asset</label>
            <input
              type="text"
              value={form.noasset}
              onChange={(e) => setForm({ ...form, noasset: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Tanggal Cek</label>
            <input
              type="date"
              value={form.tanggalcek}
              onChange={(e) => setForm({ ...form, tanggalcek: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Kondisi</label>
            <input
              type="text"
              value={form.kondisi}
              onChange={(e) => setForm({ ...form, kondisi: e.target.value })}
              placeholder="Contoh: Baik"
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {/* Jumlah */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Jumlah
            </label>
            <input
              type="number"
              min="1"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          {/* Lokasi */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Lokasi
            </label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Contoh: Ruang Server Lt.2"
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Link
            href="/admin/items"
            className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
          >
            Batal
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm font-medium shadow-sm shadow-indigo-600/25"
          >
            <Save className="w-4 h-4" />
            {loading ? "Menyimpan..." : "Simpan Barang"}
          </button>
        </div>
      </form>
    </div>
  );
}
