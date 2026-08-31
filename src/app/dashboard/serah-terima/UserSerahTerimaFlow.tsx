"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Check, Monitor, Speaker, Camera, Tent, Dumbbell, Car, Package,
  ArrowLeft, ArrowRight, MapPin, Minus, Plus, StickyNote, ShieldCheck,
  Receipt, PartyPopper, History, Send, RefreshCcw, ShoppingCart, Trash2,
  FileText, type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import { useToast } from "@/components/Toaster";
import { useSession } from "next-auth/react";
import Link from "next/link";

type PublicItem = {
  id: number;
  name: string;
  category: string;
  description: string | null;
  quantity: number;
  availableQuantity: number;
  location: string | null;
  inventoryNumber: string | null;
  assetNumber: string | null;
  sn: string | null;
  condition: string | null;
  imageUrl: string | null;
};

type CartEntry = { item: PublicItem; quantity: number; notes: string };

type SubmitResult = {
  handoverId: number;
  code: string;
  receiverName: string;
  itemNames: string;
  totalItems: number;
  totalQuantity: number;
  pdfUrl: string | null;
};

function getCategoryMeta(category: string): { Icon: LucideIcon; gradient: string } {
  switch (category.toLowerCase()) {
    case "elektronik": return { Icon: Monitor, gradient: "from-blue-500 to-indigo-600" };
    case "audio": return { Icon: Speaker, gradient: "from-fuchsia-500 to-purple-600" };
    case "fotografi": return { Icon: Camera, gradient: "from-amber-500 to-orange-600" };
    case "peralatan acara": return { Icon: Tent, gradient: "from-emerald-500 to-teal-600" };
    case "olahraga": return { Icon: Dumbbell, gradient: "from-rose-500 to-red-600" };
    case "kendaraan": return { Icon: Car, gradient: "from-cyan-500 to-sky-600" };
    default: return { Icon: Package, gradient: "from-slate-500 to-gray-600" };
  }
}

const STEPS = [
  { key: "item", label: "Pilih Barang" },
  { key: "form", label: "Detail" },
  { key: "success", label: "Selesai" },
] as const;
type Step = (typeof STEPS)[number]["key"];

export function UserSerahTerimaFlow({ items }: { items: PublicItem[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const { data: session } = useSession();

  const [step, setStep] = useState<Step>("item");
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Semua");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [form, setForm] = useState({ purpose: "", notes: "", location: "" });
  const [hasSignature, setHasSignature] = useState<boolean | null>(null);

  const user = session?.user as any;

  // Cek TTD saat mount
  useEffect(() => {
    fetch("/api/user/signature")
      .then((r) => r.json())
      .then((d) => setHasSignature(!!d.signatureUrl))
      .catch(() => setHasSignature(false));
  }, []);

  const categories = useMemo(
    () => ["Semua", ...Array.from(new Set(items.map((i) => i.category)))],
    [items]
  );

  const currentIndex = STEPS.findIndex((s) => s.key === step);
  const cartTotal = cart.reduce((sum, c) => sum + c.quantity, 0);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(
      (item) =>
        (category === "Semua" || item.category === category) &&
        (item.name.toLowerCase().includes(q) ||
          (item.description || "").toLowerCase().includes(q))
    );
  }, [items, category, search]);

  const addToCart = (item: PublicItem) => {
    setCart((prev) => {
      if (prev.find((c) => c.item.id === item.id)) return prev;
      return [...prev, { item, quantity: 1, notes: "" }];
    });
  };

  const removeFromCart = (itemId: number) => setCart((prev) => prev.filter((c) => c.item.id !== itemId));

  const updateCartQty = (itemId: number, qty: number) => {
    setCart((prev) =>
      prev.map((c) =>
        c.item.id === itemId
          ? { ...c, quantity: Math.max(1, Math.min(qty, c.item.availableQuantity)) }
          : c
      )
    );
  };

  const updateCartNotes = (itemId: number, notes: string) => {
    setCart((prev) => prev.map((c) => (c.item.id === itemId ? { ...c, notes } : c)));
  };

  const isInCart = (itemId: number) => cart.some((c) => c.item.id === itemId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (cart.length === 0) { toast("Pilih minimal satu barang", "error"); return; }
    if (!form.purpose.trim()) { toast("Keperluan (kegiatan) wajib diisi", "error"); return; }
    if (!form.location.trim()) { toast("Tempat wajib diisi", "error"); return; }

    if (!user?.nim) {
      toast("Lengkapi NIM/NIK di profil sebelum mengajukan serah terima", "error");
      router.push("/dashboard/profil");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/handovers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cart: cart.map((c) => ({ itemId: c.item.id, quantity: c.quantity, notes: c.notes })),
          purpose: form.purpose,
          notes: form.notes,
          location: form.location,
          receiverName: user?.name || "",
          receiverNim: user?.nim || "",
          unitName: user?.department || "",
          department: user?.department || "",
          phone: user?.phone || "",
        }),
      });
      const data = await res.json();
      if (res.status === 422 && data.error === "NIM_REQUIRED") {
        toast("Lengkapi NIM/NIK di profil sebelum mengajukan serah terima", "error");
        router.push("/dashboard/profil");
        return;
      }
      if (res.status === 422 && data.error === "SIGNATURE_REQUIRED") {
        toast("Upload tanda tangan elektronik di profil sebelum mengajukan serah terima", "error");
        router.push("/dashboard/profil");
        return;
      }
      if (!res.ok) throw new Error(data.error || "Gagal mengirim permintaan");
      setResult(data);
      setStep("success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Gagal mengirim permintaan", "error");
    } finally {
      setSubmitting(false);
    }
  }

  function resetAll() {
    setCart([]);
    setResult(null);
    setForm({ purpose: "", notes: "", location: "" });
    setStep("item");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      {step !== "success" && (
        <div className="flex items-center justify-center">
          {STEPS.map((s, idx) => {
            const done = idx < currentIndex;
            const active = idx === currentIndex;
            return (
              <div key={s.key} className="flex items-center">
                {idx > 0 && (
                  <div className={clsx("h-0.5 w-8 sm:w-20 mx-2 rounded-full transition-colors",
                    idx <= currentIndex ? "bg-teal-500" : "bg-gray-200")} />
                )}
                <div className="flex flex-col items-center gap-1 w-20 sm:w-24">
                  <div className={clsx(
                    "w-8 h-8 rounded-full grid place-items-center text-sm font-bold border-2 transition-all",
                    done ? "bg-teal-600 border-teal-600 text-white"
                      : active ? "border-teal-600 text-teal-600 bg-white shadow-md shadow-teal-500/20"
                      : "border-gray-200 text-gray-400 bg-white"
                  )}>
                    {done ? <Check className="w-4 h-4" /> : idx + 1}
                  </div>
                  <span className={clsx("text-[10px] font-semibold text-center",
                    (active || done) ? "text-gray-800" : "text-gray-400")}>
                    {s.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Banner info */}
      {step !== "success" && (
        <div className="flex items-start gap-3 bg-teal-50 border border-teal-200 rounded-xl p-3.5">
          <ShieldCheck className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
          <p className="text-xs text-teal-800">
            <strong>Serah Terima Permanen</strong> — Barang yang diserahkan akan dikeluarkan dari inventaris secara permanen. Pastikan kebutuhan sudah benar sebelum mengajukan.
          </p>
        </div>
      )}

      {/* ─── STEP 1: PILIH BARANG ─── */}
      {step === "item" && (
        <div className="space-y-4">
          {/* Gate: TTD belum diupload */}
          {hasSignature === false && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
              <ShieldCheck className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-bold text-red-700">Tanda Tangan Elektronik Belum Ada</p>
                <p className="text-xs text-red-600 mt-0.5">Upload tanda tangan elektronik di halaman Profil sebelum bisa mengajukan serah terima.</p>
                <Link href="/dashboard/profil" className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg transition-colors">
                  Upload TTD di Profil →
                </Link>
              </div>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari barang..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <button key={cat} onClick={() => setCategory(cat)}
                  className={clsx("shrink-0 px-3 py-2 rounded-full text-xs font-semibold border transition-all",
                    category === cat ? "bg-teal-600 border-teal-600 text-white shadow-sm"
                      : "bg-white border-gray-200 text-gray-600 hover:border-teal-300 hover:text-teal-600")}>
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-gray-400">{filtered.length} barang tersedia</p>

          {filtered.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
              <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Barang tidak ditemukan</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 pb-32">
              {filtered.map((item) => {
                const meta = getCategoryMeta(item.category);
                const pct = Math.round((item.availableQuantity / item.quantity) * 100);
                const inCart = isInCart(item.id);
                return (
                  <button key={item.id} onClick={() => inCart ? removeFromCart(item.id) : addToCart(item)}
                    className={clsx(
                      "group relative text-left bg-white rounded-2xl border p-5 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5",
                      inCart ? "ring-2 ring-teal-600 border-transparent shadow-lg" : "border-gray-100"
                    )}>
                    {inCart && (
                      <div className="absolute -top-2.5 -right-2.5 w-7 h-7 bg-teal-600 rounded-full grid place-items-center shadow-lg">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    )}
                    <div className="flex items-start gap-3 mb-3">
                      <div className={clsx("w-11 h-11 rounded-xl flex items-center justify-center bg-gradient-to-br shadow-md shrink-0", meta.gradient)}>
                        <meta.Icon className="w-5 h-5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-gray-900 text-sm leading-snug">{item.name}</h3>
                        <div className="flex flex-wrap gap-x-2 mt-1 text-xs text-gray-500">
                          <span className="text-teal-600 font-medium">{item.category}</span>
                          {item.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{item.location}</span>}
                        </div>
                      </div>
                    </div>
                    {item.description && <p className="text-xs text-gray-500 line-clamp-2 mb-3">{item.description}</p>}
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-600 font-medium">{item.availableQuantity}/{item.quantity} unit</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={clsx("h-full rounded-full", pct > 50 ? "bg-emerald-500" : pct > 20 ? "bg-amber-500" : "bg-red-500")}
                        style={{ width: `${pct}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {cart.length > 0 && (
            <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4">
              <div className="max-w-2xl mx-auto flex items-center gap-3 rounded-2xl border border-teal-100 bg-white/90 backdrop-blur-xl shadow-2xl shadow-teal-500/15 p-3">
                <div className="w-10 h-10 bg-teal-600 rounded-xl flex items-center justify-center shadow shrink-0">
                  <ShoppingCart className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900">{cart.length} barang dipilih</p>
                  <p className="text-xs text-gray-500">{cartTotal} unit total</p>
                </div>
                <button onClick={() => {
                    if (!hasSignature) {
                      toast("Upload tanda tangan elektronik di profil terlebih dahulu", "error");
                      router.push("/dashboard/profil");
                      return;
                    }
                    setStep("form");
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-sm font-semibold rounded-xl shadow-lg shadow-teal-500/25">
                  Lanjut <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── STEP 2: DETAIL ─── */}
      {step === "form" && (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Data pemohon */}
          <div className="bg-teal-50 border border-teal-100 rounded-2xl p-4 space-y-2">
            <p className="text-xs font-bold text-teal-700 uppercase tracking-wide">Data Pemohon (Otomatis)</p>
            <div className="grid sm:grid-cols-2 gap-2 text-xs text-teal-800">
              <span><strong>Nama:</strong> {user?.name || "—"}</span>
              <span><strong>NIM/NIK:</strong> {user?.nim || "—"}</span>
              <span><strong>No. HP:</strong> {user?.phone || "—"}</span>
              <span><strong>Divisi/Prodi:</strong> {user?.department || "—"}</span>
            </div>
            <Link href="/dashboard/profil" className="text-xs text-teal-600 hover:text-teal-700 font-semibold">
              Edit data diri →
            </Link>
          </div>

          {/* Barang yang dipilih */}
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900">Barang yang Diminta</h2>
              <button type="button" onClick={() => setStep("item")}
                className="text-xs font-semibold text-teal-600 hover:text-teal-700 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Tambah Barang
              </button>
            </div>
            {cart.map((entry) => {
              const meta = getCategoryMeta(entry.item.category);
              return (
                <div key={entry.item.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <div className={clsx("w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br shrink-0", meta.gradient)}>
                    <meta.Icon className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 leading-snug">{entry.item.name}</p>
                        <p className="text-xs text-gray-500">{entry.item.category}{entry.item.location ? ` • ${entry.item.location}` : ""}</p>
                      </div>
                      <button type="button" onClick={() => removeFromCart(entry.item.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
                        <button type="button" onClick={() => updateCartQty(entry.item.id, entry.quantity - 1)}
                          className="w-7 h-7 rounded-md grid place-items-center text-gray-500 hover:bg-gray-100 hover:text-teal-600 transition-all">
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-8 text-center text-sm font-bold text-gray-900">{entry.quantity}</span>
                        <button type="button" onClick={() => updateCartQty(entry.item.id, entry.quantity + 1)}
                          className="w-7 h-7 rounded-md grid place-items-center text-gray-500 hover:bg-gray-100 hover:text-teal-600 transition-all">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <span className="text-xs text-gray-400">maks {entry.item.availableQuantity}</span>
                      <input type="text" value={entry.notes} onChange={(e) => updateCartNotes(entry.item.id, e.target.value)}
                        placeholder="Catatan (opsional)" className="flex-1 text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-teal-400 transition-colors" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Keperluan & catatan */}
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 space-y-4">
            <h2 className="font-bold text-gray-900">Detail Permintaan</h2>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Tempat <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <StickyNote className="absolute left-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Contoh: Gedung FMIPA Lt.2 Ruang Server"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Keperluan (Kegiatan) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <StickyNote className="absolute left-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                <textarea value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                  placeholder="Tuliskan keperluan atau kegiatan yang membutuhkan barang ini..." rows={3} required
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Catatan Lain <span className="text-gray-400">(opsional)</span>
              </label>
              <div className="relative">
                <StickyNote className="absolute left-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Catatan tambahan jika ada..." rows={2}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none" />
              </div>
            </div>
            <div className="flex items-start gap-2.5 bg-emerald-50 border border-emerald-100 rounded-xl p-3.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <p className="text-xs text-emerald-800">
                Tanda tangan elektronikmu akan otomatis disertakan dalam formulir PDF. Admin akan memeriksa dan memproses permintaan ini.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={() => setStep("item")}
              className="flex items-center gap-2 px-5 py-3 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Kembali
            </button>
            <button type="submit" disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-teal-600 to-emerald-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-teal-500/25 hover:opacity-95 disabled:opacity-60 transition-all">
              <Send className="w-4 h-4" />
              {submitting ? "Memproses..." : "Ajukan Serah Terima"}
            </button>
          </div>
        </form>
      )}

      {/* ─── STEP 3: SUKSES ─── */}
      {step === "success" && result && (
        <div className="max-w-lg mx-auto text-center space-y-6">
          <div className="relative inline-grid place-items-center">
            <span className="absolute w-24 h-24 rounded-full bg-teal-400/20 animate-ping" />
            <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 grid place-items-center shadow-xl shadow-teal-500/30">
              <Check className="w-10 h-10 text-white" strokeWidth={3} />
            </div>
          </div>
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 border border-teal-100 text-teal-700 text-xs font-semibold mb-2">
              <PartyPopper className="w-3.5 h-3.5" /> Permintaan berhasil dibuat
            </div>
            <h2 className="text-2xl font-extrabold text-gray-900 dark:text-slate-100">Permintaan Diajukan!</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-2">
              Kode: <span className="font-bold text-gray-800 dark:text-slate-200">{result.code}</span>
            </p>
          </div>

          <div className="bg-white dark:bg-[#162035] border border-gray-100 dark:border-[#1c2e48] rounded-2xl shadow-sm overflow-hidden text-left">
            <div className="bg-gradient-to-r from-teal-600 to-emerald-600 px-5 py-3 flex items-center gap-2 text-white">
              <Receipt className="w-4 h-4" />
              <span className="text-sm font-semibold">Detail Permintaan</span>
            </div>
            <div className="px-5 py-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-slate-400">Pemohon</span>
                <span className="font-semibold text-gray-900 dark:text-slate-200">{result.receiverName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-slate-400">Total Barang</span>
                <span className="font-semibold text-gray-900 dark:text-slate-200">{result.totalItems} jenis ({result.totalQuantity} unit)</span>
              </div>
            </div>
          </div>

          {/* Info PDF */}
          <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-100 dark:border-teal-800/50 rounded-2xl p-5 space-y-3 text-left">
            <div className="flex items-center gap-2 text-teal-800 dark:text-teal-300">
              <FileText className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0" />
              <p className="text-sm font-bold">Formulir PDF Sudah Dibuat</p>
            </div>
            <p className="text-xs text-teal-700 dark:text-teal-400 leading-relaxed">
              Formulir serah terima dengan tanda tangan elektronikmu sudah dibuat otomatis.
              Admin akan memeriksa dan memproses permintaanmu.
            </p>
            {result.pdfUrl && (
              <a href={result.pdfUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-xl transition-colors">
                <FileText className="w-4 h-4" /> Lihat / Download PDF
              </a>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/dashboard/riwayat"
              className="flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl text-sm font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">
              <History className="w-4 h-4" /> Lihat Riwayat
            </Link>
            <button onClick={resetAll}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-white dark:bg-[#162035] border border-gray-200 dark:border-[#1c2e48] text-gray-600 dark:text-slate-300 rounded-xl text-sm font-semibold hover:bg-gray-50 dark:hover:bg-[#1c2e48] transition-colors">
              <RefreshCcw className="w-4 h-4" /> Ajukan Lagi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
