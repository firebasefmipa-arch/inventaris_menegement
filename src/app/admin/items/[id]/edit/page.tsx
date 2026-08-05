"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
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

export default function EditItemPage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [form, setForm] = useState({
    name: "",
    category: "",
    description: "",
    sn: "",
    inventoryNumber: "",
    assetNumber: "",
    lastCheckDate: "",
    condition: "",
    quantity: "1",
    location: "",
    status: "available",
  });

  useEffect(() => {
    fetch(`/api/items/${params.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setForm({
          name: data.name,
          category: data.category,
          description: data.description || "",
          sn: data.sn || "",
          inventoryNumber: data.inventoryNumber || "",
          assetNumber: data.assetNumber || "",
          lastCheckDate: data.lastCheckDate || "",
          condition: data.condition || "",
          quantity: String(data.quantity),
          location: data.location || "",
          status: data.status,
        });
      })
      .catch(() => {
        toast("Gagal memuat data barang", "error");
        router.push("/admin/items");
      })
      .finally(() => setFetching(false));
  }, [params.id, router, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) {
      toast("Nama wajib diisi", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/items/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          category: form.category || "Umum",
          description: form.description?.trim() || null,
          sn: form.sn?.trim() || null,
          inventoryNumber: form.inventoryNumber?.trim() || null,
          assetNumber: form.assetNumber?.trim() || null,
          lastCheckDate: form.lastCheckDate?.trim() || null,
          condition: form.condition?.trim() || null,
          quantity: parseInt(form.quantity),
          location: form.location || null,
          status: form.status,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Gagal update");
      }

      toast("Barang berhasil diupdate", "success");
      router.push("/admin/items");
      router.refresh();
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Gagal update barang",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

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
          <h2 className="text-2xl font-bold text-gray-900">Edit Barang</h2>
          <p className="text-gray-500 text-sm mt-1">
            Perbarui informasi barang
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
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            required
          />
        </div>

        {/* Kategori */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Kategori
          </label>
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none"
          >
            <option value="" disabled>Pilih Kategori</option>
            {CATEGORY_SUGGESTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Spesifikasi */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Spesifikasi
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">SN</label>
            <input
              type="text"
              value={form.sn}
              onChange={(e) => setForm({ ...form, sn: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">No. Inv DTI</label>
            <input
              type="text"
              value={form.inventoryNumber}
              onChange={(e) => setForm({ ...form, inventoryNumber: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">No. Asset</label>
            <input
              type="text"
              value={form.assetNumber}
              onChange={(e) => setForm({ ...form, assetNumber: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Tanggal Cek</label>
            <input
              type="date"
              value={form.lastCheckDate}
              onChange={(e) => setForm({ ...form, lastCheckDate: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Kondisi</label>
            <select
              value={form.condition}
              onChange={(e) => setForm({ ...form, condition: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none"
            >
              <option value="">Pilih Kondisi</option>
              <option value="Baik">Baik</option>
              <option value="Rusak">Rusak</option>
            </select>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Lokasi
            </label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Status
            </label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              <option value="available">Tersedia</option>
              <option value="borrowed">Dipinjam</option>
            </select>
          </div>
        </div>

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
            {loading ? "Menyimpan..." : "Update Barang"}
          </button>
        </div>
      </form>
    </div>
  );
}
