"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Check, Monitor, Speaker, Camera, Tent, Dumbbell, Car, Package,
  ArrowLeft, ArrowRight, MapPin, Phone, Mail, Building2, Minus, Plus,  CalendarDays, StickyNote, ShieldCheck, Receipt, PartyPopper, History,
  Send, RefreshCcw, ShoppingCart, Trash2, FileText, type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import { format, addDays } from "date-fns";
import { id as idLocale } from "date-fns/locale";
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
  code: string;
  transactionId: number;
  borrowerName: string;
  itemNames: string;
  totalItems: number;
  totalQuantity: number;
  expectedReturnDate: string;
  items: { name: string; inventoryNumber: string | null; quantity: number; notes: string }[];
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

const defaultReturnDate = () => format(addDays(new Date(), 3), "yyyy-MM-dd");

const STEPS = [
  { key: "item", label: "Pilih Barang" },
  { key: "form", label: "Detail" },
  { key: "success", label: "Selesai" },
] as const;
type Step = (typeof STEPS)[number]["key"];

export function UserPinjamFlow({ items }: { items: PublicItem[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const { data: session } = useSession();

  const [step, setStep] = useState<Step>("item");
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Semua");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [form, setForm] = useState({ returnDate: defaultReturnDate(), purpose: "", notes: "", location: "" });
  const [redirectCountdown, setRedirectCountdown] = useState(5);

  const user = session?.user as any;
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const categories = useMemo(
    () => ["Semua", ...Array.from(new Set(items.map((i) => i.category)))],
    [items]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(
      (item) =>
        (category === "Semua" || item.category === category) &&
        (item.name.toLowerCase().includes(q) ||
          (item.description || "").toLowerCase().includes(q) ||
          (item.inventoryNumber || "").toLowerCase().includes(q))
    );
  }, [items, category, search]);

  const currentIndex = STEPS.findIndex((s) => s.key === step);
  const cartTotal = cart.reduce((sum, c) => sum + c.quantity, 0);

  // Countdown redirect ke upload setelah sukses
  useEffect(() => {
    if (step !== "success" || !result) return;
    if (redirectCountdown <= 0) {
      router.push(`/transactions/${result.transactionId}/upload`);
      return;
    }
    const t = setTimeout(() => setRedirectCountdown((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [step, result, redirectCountdown, router]);

  // Cart helpers
  const addToCart = (item: PublicItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === item.id);
      if (existing) return prev; // sudah ada, tidak duplikat
      return [...prev, { item, quantity: 1, notes: "" }];
    });
  };

  const removeFromCart = (itemId: number) => {
    setCart((prev) => prev.filter((c) => c.item.id !== itemId));
  };

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
    setCart((prev) =>
      prev.map((c) => (c.item.id === itemId ? { ...c, notes } : c))
    );
  };

  const isInCart = (itemId: number) => cart.some((c) => c.item.id === itemId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (cart.length === 0) { toast("Pilih minimal satu barang", "error"); return; }
    if (!form.returnDate) { toast("Pilih tanggal pengembalian", "error"); return; }
    if (!form.purpose.trim()) { toast("Keperluan peminjaman wajib diisi", "error"); return; }
    if (!form.location.trim()) { toast("Tempat/lokasi wajib diisi", "error"); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/pinjam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cart: cart.map((c) => ({ itemId: c.item.id, quantity: c.quantity, notes: c.notes })),
          expectedReturnDate: form.returnDate,
          purpose: form.purpose,
          notes: form.notes,
          location: form.location,
          borrower: {
            name: user?.name || "",
            email: user?.email || "",
            phone: user?.phone || "",
            nim: user?.nim || "",
            department: user?.department || "",
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Jika NIM belum diisi, arahkan ke halaman profil
        if (res.status === 422 && data.error === "NIM_REQUIRED") {
          toast("Lengkapi NIM/NIK di profil kamu sebelum meminjam", "error");
          router.push("/dashboard/profil");
          return;
        }
        throw new Error(data.error || "Gagal mengirim permintaan");
      }
      setResult(data);
      setRedirectCountdown(5);
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
    setForm({ returnDate: defaultReturnDate(), purpose: "", notes: "", location: "" });
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
                    idx <= currentIndex ? "bg-indigo-500" : "bg-gray-200")} />
                )}
                <div className="flex flex-col items-center gap-1 w-20 sm:w-24">
                  <div className={clsx(
                    "w-8 h-8 rounded-full grid place-items-center text-sm font-bold border-2 transition-all",
                    done ? "bg-indigo-600 border-indigo-600 text-white"
                      : active ? "border-indigo-600 text-indigo-600 bg-white shadow-md shadow-indigo-500/20"
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

      {/* ─── STEP 1: PILIH BARANG ─── */}
      {step === "item" && (
        <div className="animate-slide-in space-y-4">
          {/* Search & Filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari barang..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <button key={cat} onClick={() => setCategory(cat)}
                  className={clsx("shrink-0 px-3 py-2 rounded-full text-xs font-semibold border transition-all",
                    category === cat ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                      : "bg-white border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600")}>
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-gray-400">{filtered.length} barang tersedia</p>

          {/* Grid barang */}
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
                      inCart ? "ring-2 ring-indigo-600 border-transparent shadow-lg" : "border-gray-100"
                    )}>
                    {inCart && (
                      <div className="absolute -top-2.5 -right-2.5 w-7 h-7 bg-indigo-600 rounded-full grid place-items-center shadow-lg animate-pop">
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
                          <span className="text-indigo-600 font-medium">{item.category}</span>
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

          {/* Sticky bottom bar cart */}
          {cart.length > 0 && (
            <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4">
              <div className="max-w-2xl mx-auto flex items-center gap-3 rounded-2xl border border-indigo-100 bg-white/90 backdrop-blur-xl shadow-2xl shadow-indigo-500/15 p-3">
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow shrink-0">
                  <ShoppingCart className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900">{cart.length} barang dipilih</p>
                  <p className="text-xs text-gray-500">{cartTotal} unit total</p>
                </div>
                <button onClick={() => setStep("form")}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-semibold rounded-xl shadow-lg shadow-indigo-500/25">
                  Lanjut <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── STEP 2: DETAIL PEMINJAMAN ─── */}
      {step === "form" && (
        <div className="animate-slide-in">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Data peminjam — di atas */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 space-y-2">
              <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide">Data Peminjam (Otomatis)</p>
              <div className="grid sm:grid-cols-2 gap-2 text-xs text-indigo-800">
                <span className="flex items-center gap-2"><Building2 className="w-3.5 h-3.5 text-indigo-500" />{user?.name || "—"}</span>
                <span className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-indigo-500" />{user?.phone || "—"}</span>
                <span className="flex items-center gap-2 sm:col-span-2"><Mail className="w-3.5 h-3.5 text-indigo-500" />{user?.email || "—"}</span>
              </div>
              <Link href="/dashboard/profil" className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold">Edit data diri →</Link>
            </div>

            {/* Keranjang barang */}
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-gray-900">Barang yang Dipilih</h2>
                <button type="button" onClick={() => setStep("item")}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
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
                      {/* Qty & notes per item */}
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
                          <button type="button" onClick={() => updateCartQty(entry.item.id, entry.quantity - 1)}
                            className="w-7 h-7 rounded-md grid place-items-center text-gray-500 hover:bg-gray-100 hover:text-indigo-600 transition-all">
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-8 text-center text-sm font-bold text-gray-900">{entry.quantity}</span>
                          <button type="button" onClick={() => updateCartQty(entry.item.id, entry.quantity + 1)}
                            className="w-7 h-7 rounded-md grid place-items-center text-gray-500 hover:bg-gray-100 hover:text-indigo-600 transition-all">
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <span className="text-xs text-gray-400">maks {entry.item.availableQuantity}</span>
                        <input type="text" value={entry.notes} onChange={(e) => updateCartNotes(entry.item.id, e.target.value)}
                          placeholder="Catatan (opsional)" className="flex-1 text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 transition-colors" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Tanggal kembali & catatan */}
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 space-y-4">
              <h2 className="font-bold text-gray-900">Detail Peminjaman</h2>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Tanggal Kembali <span className="text-red-500">*</span></label>
                <div className="relative">
                  <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input type="date" value={form.returnDate} min={todayStr} required
                    onChange={(e) => setForm({ ...form, returnDate: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Tempat / Lokasi <span className="text-red-500">*</span></label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input type="text" value={form.location} required
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="Contoh: Gedung FMIPA Lt.2 Ruang Server"
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Keperluan <span className="text-red-500">*</span></label>
                <div className="relative">
                  <StickyNote className="absolute left-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                  <textarea value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                    placeholder="Keperluan peminjaman barang..." rows={2} required
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Catatan Lain <span className="text-gray-400">(opsional)</span></label>
                <div className="relative">
                  <StickyNote className="absolute left-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Catatan tambahan jika ada..." rows={2}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none" />
                </div>
              </div>
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-xl p-3.5">
                <ShieldCheck className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-800">Setelah submit, kamu akan diminta untuk <strong>mengupload dokumen</strong> formulir peminjaman yang sudah ditandatangani.</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={() => setStep("item")}
                className="flex items-center gap-2 px-5 py-3 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-colors">
                <ArrowLeft className="w-4 h-4" /> Kembali
              </button>
              <button type="submit" disabled={submitting}
                className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-500/25 hover:opacity-95 disabled:opacity-60 transition-all">
                <Send className="w-4 h-4" />
                {submitting ? "Memproses..." : "Ajukan Peminjaman"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─── STEP 3: SUKSES + REDIRECT ─── */}
      {step === "success" && result && (
        <div className="animate-slide-in max-w-lg mx-auto text-center space-y-6">
          <div className="relative inline-grid place-items-center">
            <span className="absolute w-24 h-24 rounded-full bg-emerald-400/20 animate-ping" />
            <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 grid place-items-center shadow-xl shadow-emerald-500/30">
              <Check className="w-10 h-10 text-white" strokeWidth={3} />
            </div>
          </div>

          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-semibold mb-2">
              <PartyPopper className="w-3.5 h-3.5" /> Permintaan berhasil dibuat
            </div>
            <h2 className="text-2xl font-extrabold text-gray-900">Peminjaman Diajukan!</h2>
            <p className="text-sm text-gray-500 mt-2">
              Kode: <span className="font-bold text-gray-800">{result.code}</span>
            </p>
          </div>

          {/* Receipt */}
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden text-left">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-3 flex items-center gap-2 text-white">
              <Receipt className="w-4 h-4" />
              <span className="text-sm font-semibold">Detail Peminjaman</span>
            </div>
            <div className="px-5 py-4 space-y-3">
              {result.items.map((item, i) => (
                <div key={i} className="flex justify-between gap-4 py-2 border-b border-dashed border-gray-100 last:border-0">
                  <span className="text-xs text-gray-600">{item.name}</span>
                  <span className="text-xs font-semibold text-gray-900 shrink-0">×{item.quantity}</span>
                </div>
              ))}
              <div className="flex justify-between pt-1">
                <span className="text-xs text-gray-400">Peminjam</span>
                <span className="text-sm font-semibold text-gray-900">{result.borrowerName}</span>
              </div>
            </div>
          </div>

          {/* Redirect notice */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-amber-800">
              <FileText className="w-5 h-5 text-amber-600 shrink-0" />
              <p className="text-sm font-bold">Langkah Selanjutnya: Upload Dokumen</p>
            </div>
            <p className="text-xs text-amber-700 leading-relaxed">
              Download formulir, tanda tangani, lalu upload kembali. Peminjaman baru diproses setelah dokumen diterima.
            </p>
            <div className="flex items-center justify-between">
              <p className="text-xs text-amber-600 font-medium">
                Otomatis diarahkan dalam <span className="font-bold text-amber-800">{redirectCountdown}s</span>...
              </p>
              <button onClick={() => router.push(`/transactions/${result.transactionId}/upload`)}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl transition-colors">
                <FileText className="w-3.5 h-3.5" /> Upload Sekarang
              </button>
            </div>
            {/* Progress bar countdown */}
            <div className="h-1.5 bg-amber-200 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full transition-all duration-1000"
                style={{ width: `${(redirectCountdown / 5) * 100}%` }} />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/dashboard/riwayat"
              className="flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-colors">
              <History className="w-4 h-4" /> Lihat Riwayat
            </Link>
            <button onClick={resetAll}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors">
              <RefreshCcw className="w-4 h-4" /> Pinjam Lagi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
