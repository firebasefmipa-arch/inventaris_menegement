"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Save, Search, Plus, Trash2, Package } from "lucide-react";
import { useToast } from "@/components/Toaster";
import { format } from "date-fns";

type Item = {
  id: number;
  name: string;
  category: string;
  availableQuantity: number;
  assetNumber: string | null;
  inventoryNumber: string | null;
};

type CartItem = { item: Item; quantity: number; notes: string };

interface HandoverModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HandoverModal({ isOpen, onClose }: HandoverModalProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [itemSearch, setItemSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  const [receiverName, setReceiverName] = useState("");
  const [receiverNim, setReceiverNim] = useState("");
  const [unitName, setUnitName] = useState("");
  const [department, setDepartment] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (isOpen) {
      fetch("/api/items?limit=200")
        .then((r) => r.json())
        .then((data) => setItems(Array.isArray(data) ? data : data.items || []));
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => { document.removeEventListener("keydown", handleKeyDown); document.body.style.overflow = ""; };
  }, [isOpen, onClose]);

  const resetForm = () => {
    setCart([]); setItemSearch(""); setShowDropdown(false);
    setReceiverName(""); setReceiverNim(""); setUnitName("");
    setDepartment(""); setPhone(""); setLocation(""); setPurpose(""); setNotes("");
  };

  const handleClose = () => { resetForm(); onClose(); };

  const cartIds = new Set(cart.map((c) => c.item.id));
  const filteredItems = items.filter(
    (item) => item.availableQuantity > 0 && !cartIds.has(item.id) &&
      item.name.toLowerCase().includes(itemSearch.toLowerCase())
  );

  const addToCart = (item: Item) => {
    setCart((prev) => [...prev, { item, quantity: 1, notes: "" }]);
    setItemSearch(""); setShowDropdown(false);
  };
  const removeFromCart = (id: number) => setCart((prev) => prev.filter((c) => c.item.id !== id));
  const updateQty = (id: number, qty: number) => setCart((prev) =>
    prev.map((c) => c.item.id === id ? { ...c, quantity: Math.max(1, Math.min(qty, c.item.availableQuantity)) } : c)
  );
  const updateNotes = (id: number, notes: string) => setCart((prev) =>
    prev.map((c) => c.item.id === id ? { ...c, notes } : c)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) { toast("Pilih minimal satu barang", "error"); return; }
    if (!purpose.trim()) { toast("Keperluan wajib diisi", "error"); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/handovers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cart: cart.map((c) => ({ itemId: c.item.id, quantity: c.quantity, notes: c.notes || null })),
          receiverName, receiverNim: receiverNim || null,
          unitName: unitName || null, department, phone: phone || null,
          location: location || null, purpose, notes: notes || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Gagal menyimpan");
      }
      toast(`Serah terima ${cart.length} barang berhasil dicatat`, "success");
      handleClose();
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Gagal menyimpan", "error");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Catat Serah Terima</h2>
            <p className="text-xs text-gray-500 mt-0.5">Barang akan dikeluarkan dari inventaris secara permanen</p>
          </div>
          <button onClick={handleClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 flex-1">
          <form id="handover-form" onSubmit={handleSubmit} className="space-y-5">

            {/* Daftar Barang */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 border-b pb-1.5 flex items-center gap-2">
                <Package className="w-4 h-4 text-teal-500" />
                Daftar Barang
                {cart.length > 0 && (
                  <span className="ml-auto text-xs font-medium bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">
                    {cart.length} barang
                  </span>
                )}
              </h3>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" placeholder="Cari dan tambah barang..." value={itemSearch}
                  onChange={(e) => { setItemSearch(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                {showDropdown && filteredItems.length > 0 && (
                  <div className="absolute z-20 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {filteredItems.map((item) => (
                      <button key={item.id} type="button" onMouseDown={(e) => e.preventDefault()}
                        onClick={() => addToCart(item)}
                        className="w-full text-left px-4 py-2.5 hover:bg-teal-50 flex items-center justify-between transition-colors">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{item.name}</p>
                          <p className="text-xs text-gray-500">{item.category} • {item.availableQuantity} tersedia</p>
                        </div>
                        <Plus className="w-4 h-4 text-teal-500 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
                {showDropdown && itemSearch && filteredItems.length === 0 && (
                  <div className="absolute z-20 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-sm text-gray-400">
                    Tidak ada barang tersedia
                  </div>
                )}
              </div>

              {cart.length === 0 ? (
                <div className="text-center py-6 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                  <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Belum ada barang dipilih</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {cart.map((c, idx) => (
                    <div key={c.item.id} className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-teal-600 bg-teal-100 rounded-lg w-6 h-6 flex items-center justify-center shrink-0">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{c.item.name}</p>
                          <p className="text-xs text-gray-500">{c.item.category} • maks {c.item.availableQuantity}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <label className="text-xs text-gray-500">Jml:</label>
                          <input type="number" min={1} max={c.item.availableQuantity} value={c.quantity}
                            onChange={(e) => updateQty(c.item.id, parseInt(e.target.value) || 1)}
                            className="w-16 px-2 py-1 bg-white border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                          <button type="button" onClick={() => removeFromCart(c.item.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <input type="text" value={c.notes} onChange={(e) => updateNotes(c.item.id, e.target.value)}
                        placeholder="Catatan untuk barang ini (opsional)"
                        className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Informasi Penerima */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 border-b pb-1.5">Informasi Penerima</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nama Penanggung Jawab <span className="text-red-500">*</span></label>
                  <input type="text" value={receiverName} onChange={(e) => setReceiverName(e.target.value)} required
                    placeholder="Nama lengkap" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">NIK / NIM</label>
                  <input type="text" value={receiverNim} onChange={(e) => setReceiverNim(e.target.value)}
                    placeholder="Opsional" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nama Unit</label>
                  <input type="text" value={unitName} onChange={(e) => setUnitName(e.target.value)}
                    placeholder="Nama unit/organisasi" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Divisi / Prodi <span className="text-red-500">*</span></label>
                  <input type="text" value={department} onChange={(e) => setDepartment(e.target.value)} required
                    placeholder="Contoh: Divisi TI" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">No. Telp/WA</label>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                    placeholder="08xxxxxxxxxx" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tempat <span className="text-red-500">*</span></label>
                  <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} required
                    placeholder="Lokasi serah terima" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Keperluan (Kegiatan) <span className="text-red-500">*</span></label>
                <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} required
                  placeholder="Tuliskan keperluan atau kegiatan..." rows={2}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Catatan Lain</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Catatan tambahan (opsional)..." rows={2}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none" />
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
          <button type="button" onClick={handleClose}
            className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 text-sm font-medium transition-colors">
            Batal
          </button>
          <button type="submit" form="handover-form"
            disabled={loading || cart.length === 0 || !receiverName || !department || !location || !purpose}
            className="flex-1 py-2.5 bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-50 text-sm font-medium transition-colors flex items-center justify-center gap-2">
            <Save className="w-4 h-4" />
            {loading ? "Menyimpan..." : `Simpan (${cart.length} barang)`}
          </button>
        </div>
      </div>
    </div>
  );
}
