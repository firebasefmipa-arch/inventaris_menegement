"use client";

import { useEffect, useState } from "react";
import { X, Plus, Trash2, Search, Save, AlertTriangle } from "lucide-react";
import { useToast } from "./Toaster";
import clsx from "clsx";

export interface CorrectItem {
  itemId: number;
  itemName: string;
  quantity: number;
  notes: string;
  maxQty: number; // stok tersedia saat ini
}

interface AvailableItem {
  id: number;
  name: string;
  category: string;
  availableQuantity: number;
  inventoryNumber: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  type: "transaction" | "handover";
  id: number;
  initialItems: CorrectItem[];
  borrowerName: string;
}

export function CorrectItemsModal({ isOpen, onClose, onSaved, type, id, initialItems, borrowerName }: Props) {
  const { toast } = useToast();
  const [items, setItems] = useState<CorrectItem[]>(initialItems);
  const [allItems, setAllItems] = useState<AvailableItem[]>([]);
  const [search, setSearch] = useState("");
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [saving, setSaving] = useState(false);

  // Fetch semua barang yang available saat modal dibuka
  useEffect(() => {
    if (!isOpen) return;
    setItems(initialItems);
    fetch("/api/items?limit=500")
      .then((r) => r.json())
      .then((data) => {
        const arr = Array.isArray(data) ? data : data.items ?? [];
        setAllItems(arr.filter((i: AvailableItem) => i.availableQuantity > 0));
      })
      .catch(() => {});
  }, [isOpen]);

  const filteredAvailable = allItems.filter((i) => {
    const inCart = items.some((c) => c.itemId === i.id);
    const q = search.toLowerCase();
    return !inCart && (i.name.toLowerCase().includes(q) || (i.inventoryNumber || "").toLowerCase().includes(q));
  });

  const addItem = (item: AvailableItem) => {
    setItems((prev) => [...prev, {
      itemId: item.id,
      itemName: item.name,
      quantity: 1,
      notes: "",
      maxQty: item.availableQuantity,
    }]);
    setSearch("");
  };

  const removeItem = (itemId: number) => {
    setItems((prev) => prev.filter((i) => i.itemId !== itemId));
  };

  const updateQty = (itemId: number, qty: number) => {
    setItems((prev) => prev.map((i) =>
      i.itemId === itemId ? { ...i, quantity: Math.max(1, Math.min(qty, i.maxQty)) } : i
    ));
  };

  const updateNotes = (itemId: number, notes: string) => {
    setItems((prev) => prev.map((i) => i.itemId === itemId ? { ...i, notes } : i));
  };

  const handleSave = async () => {
    if (items.length === 0) { toast("Minimal satu barang wajib ada", "error"); return; }
    setSaving(true);
    try {
      const url = type === "transaction"
        ? `/api/transactions/${id}/correct`
        : `/api/admin/handovers/${id}/correct`;

      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ itemId: i.itemId, quantity: i.quantity, notes: i.notes || null })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan koreksi");

      toast("Koreksi barang berhasil disimpan & PDF diperbarui", "success");
      onSaved();
      onClose();
    } catch (err: any) {
      toast(err.message || "Gagal menyimpan", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#162035] rounded-2xl shadow-2xl border border-gray-100 dark:border-[#1c2e48] max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-[#1c2e48] shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Koreksi Barang</h2>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
              {borrowerName} — PDF akan di-generate ulang setelah disimpan
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-slate-400" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {/* Warning */}
          <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Perubahan barang akan mempengaruhi stok secara real-time. PDF akan di-regenerate otomatis setelah kamu menyimpan.
            </p>
          </div>

          {/* Daftar barang saat ini */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">Daftar Barang ({items.length})</h3>
            {items.length === 0 && (
              <div className="text-center py-6 bg-gray-50 dark:bg-[#0e1c30] rounded-xl border border-dashed border-gray-200 dark:border-[#1c2e48]">
                <p className="text-sm text-gray-400 dark:text-slate-500">Belum ada barang — tambahkan dari panel di bawah</p>
              </div>
            )}
            {items.map((item) => (
              <div key={item.itemId} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-[#0e1c30] rounded-xl border border-gray-100 dark:border-[#1c2e48]">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">{item.itemName}</p>
                  <input
                    type="text"
                    value={item.notes}
                    onChange={(e) => updateNotes(item.itemId, e.target.value)}
                    placeholder="Catatan (opsional)"
                    className="mt-1.5 w-full text-xs px-2.5 py-1.5 bg-white dark:bg-[#162035] border border-gray-200 dark:border-[#1c2e48] rounded-lg focus:outline-none focus:border-indigo-400 transition-colors"
                  />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => updateQty(item.itemId, item.quantity - 1)}
                    className="w-7 h-7 rounded-lg bg-white dark:bg-[#162035] border border-gray-200 dark:border-[#1c2e48] flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
                    <span className="text-sm font-bold">−</span>
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={item.maxQty + item.quantity}
                    value={item.quantity}
                    onChange={(e) => updateQty(item.itemId, parseInt(e.target.value) || 1)}
                    className="w-12 text-center text-sm font-bold bg-white dark:bg-[#162035] border border-gray-200 dark:border-[#1c2e48] rounded-lg py-1 focus:outline-none focus:border-indigo-400"
                  />
                  <button onClick={() => updateQty(item.itemId, item.quantity + 1)}
                    className="w-7 h-7 rounded-lg bg-white dark:bg-[#162035] border border-gray-200 dark:border-[#1c2e48] flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
                    <span className="text-sm font-bold">+</span>
                  </button>
                </div>
                <button onClick={() => removeItem(item.itemId)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Panel tambah barang */}
          <div>
            <button
              onClick={() => setShowAddPanel(!showAddPanel)}
              className="flex items-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {showAddPanel ? "Tutup Pencarian" : "Tambah Barang"}
            </button>

            {showAddPanel && (
              <div className="mt-3 bg-gray-50 dark:bg-[#0e1c30] rounded-xl border border-gray-100 dark:border-[#1c2e48] p-3 space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari barang..."
                    className="w-full pl-9 pr-4 py-2 bg-white dark:bg-[#162035] border border-gray-200 dark:border-[#1c2e48] rounded-xl text-sm focus:outline-none focus:border-indigo-400 transition-colors"
                    autoFocus
                  />
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {filteredAvailable.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-slate-500 text-center py-4">
                      {search ? "Tidak ada hasil" : "Semua barang sudah ditambahkan"}
                    </p>
                  ) : (
                    filteredAvailable.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => addItem(item)}
                        className="w-full text-left flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors group"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-slate-200 group-hover:text-indigo-700 dark:group-hover:text-indigo-400">{item.name}</p>
                          <p className="text-xs text-gray-400 dark:text-slate-500">{item.category} • {item.availableQuantity} tersedia</p>
                        </div>
                        <Plus className="w-4 h-4 text-gray-300 group-hover:text-indigo-500 shrink-0" />
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-[#1c2e48] flex gap-3 shrink-0">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">
            Batal
          </button>
          <button onClick={handleSave} disabled={saving || items.length === 0}
            className={clsx(
              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors",
              (saving || items.length === 0)
                ? "bg-gray-300 dark:bg-slate-700 cursor-not-allowed"
                : "bg-indigo-600 hover:bg-indigo-700"
            )}>
            {saving
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Menyimpan...</>
              : <><Save className="w-4 h-4" /> Simpan & Generate PDF</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
