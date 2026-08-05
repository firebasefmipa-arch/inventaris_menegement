"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Boxes,
  Sparkles,
  Search,
  Check,
  Monitor,
  Speaker,
  Camera,
  Tent,
  Dumbbell,
  Car,
  Package,
  ArrowLeft,
  ArrowRight,
  MapPin,
  User,
  Phone,
  Mail,
  Building2,
  Minus,
  Plus,
  CalendarDays,
  StickyNote,
  ShieldCheck,
  Info,
  Receipt,
  PartyPopper,
  Timer,
  PackageCheck,
  Send,
  Copy,
  RefreshCcw,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import { format, addDays } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { useToast } from "@/components/Toaster";
import { useSession } from "next-auth/react";

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
};

type Result = {
  code: string;
  transactionId: number;
  borrowerName: string;
  itemName: string;
  quantity: number;
  expectedReturnDate: string;
};

function getCategoryMeta(category: string): {
  Icon: LucideIcon;
  gradient: string;
} {
  switch (category.toLowerCase()) {
    case "elektronik":
      return { Icon: Monitor, gradient: "from-blue-500 to-indigo-600" };
    case "audio":
      return { Icon: Speaker, gradient: "from-fuchsia-500 to-purple-600" };
    case "fotografi":
      return { Icon: Camera, gradient: "from-amber-500 to-orange-600" };
    case "peralatan acara":
      return { Icon: Tent, gradient: "from-emerald-500 to-teal-600" };
    case "olahraga":
      return { Icon: Dumbbell, gradient: "from-rose-500 to-red-600" };
    case "kendaraan":
      return { Icon: Car, gradient: "from-cyan-500 to-sky-600" };
    default:
      return { Icon: Package, gradient: "from-slate-500 to-gray-600" };
  }
}

const defaultReturnDate = () => format(addDays(new Date(), 3), "yyyy-MM-dd");
const STEPS = [
  { key: "item", label: "Pilih Barang" },
  { key: "form", label: "Isi Data" },
  { key: "success", label: "Selesai" },
] as const;

type Step = (typeof STEPS)[number]["key"];

export function PinjamFlow({ items }: { items: PublicItem[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const { data: session } = useSession();

  const [step, setStep] = useState<Step>("item");
  const [selected, setSelected] = useState<PublicItem | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Semua");
  const [qty, setQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    department: "",
    returnDate: defaultReturnDate(),
    notes: "",
  });

  useEffect(() => {
    if (session?.user) {
      setForm((prev) => ({
        ...prev,
        name: session.user.name || "",
        email: session.user.email || "",
        phone: (session.user as any).phone || "",
        department: (session.user as any).department || "",
      }));
    }
  }, [session]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

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
          (item.inventoryNumber || "").toLowerCase().includes(q) ||
          (item.assetNumber || "").toLowerCase().includes(q) ||
          (item.sn || "").toLowerCase().includes(q) ||
          (item.condition || "").toLowerCase().includes(q))
    );
  }, [items, category, search]);

  const totalUnits = items.reduce((acc, i) => acc + i.availableQuantity, 0);
  const todayStr = format(new Date(), "yyyy-MM-dd");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;

    if (!form.name.trim() || !form.phone.trim()) {
      toast("Nama dan nomor HP wajib diisi.", "error");
      return;
    }
    if (!form.returnDate) {
      toast("Pilih tanggal pengembalian.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/pinjam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cart: [{ itemId: selected.id, quantity: qty, notes: form.notes }],
          expectedReturnDate: form.returnDate,
          notes: form.notes,
          borrower: {
            name: form.name,
            email: form.email,
            phone: form.phone,
            department: form.department,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengirim permintaan");

      // API multi-item returns itemNames, map ke itemName untuk backward-compat
      setResult({
        code: data.code,
        transactionId: data.transactionId,
        borrowerName: data.borrowerName,
        itemName: data.items?.[0]?.name ?? data.itemNames ?? selected.name,
        quantity: qty,
        expectedReturnDate: data.expectedReturnDate,
      });
      setStep("success");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Gagal mengirim permintaan",
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  }

  function resetAll() {
    setSelected(null);
    setQty(1);
    setResult(null);
    setForm({
      name: session?.user?.name || "",
      email: session?.user?.email || "",
      phone: (session?.user as any)?.phone || "",
      department: (session?.user as any)?.department || "",
      returnDate: defaultReturnDate(),
      notes: "",
    });
    setStep("item");
    router.refresh();
  }

  async function copyCode() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.code);
      toast("Kode peminjaman disalin.", "success");
    } catch {
      toast("Gagal menyalin kode.", "error");
    }
  }

  const currentIndex = STEPS.findIndex((s) => s.key === step);
  const selectedMeta = selected ? getCategoryMeta(selected.category) : null;

  return (
    <div className="relative min-h-screen bg-white overflow-x-hidden">
      {/* Background decoration */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[760px] overflow-hidden -z-0"
      >
        <div className="absolute -top-48 -left-40 w-[560px] h-[560px] rounded-full bg-gradient-to-br from-indigo-300/40 via-purple-300/25 to-transparent blur-3xl animate-float-slow" />
        <div className="absolute top-16 -right-48 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-fuchsia-300/30 via-sky-200/40 to-transparent blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#6366f108_1px,transparent_1px),linear-gradient(to_bottom,#6366f108_1px,transparent_1px)] bg-[size:36px_36px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-indigo-100/60 bg-white/75 backdrop-blur-xl">
        <div className="relative max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Boxes className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-gray-900 leading-none">
                PinjamBarang
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Portal Peminjaman
              </p>
            </div>
          </Link>
        </div>
      </header>

      <div className="relative">
        {/* Hero */}
        <section className="pt-12 sm:pt-16 pb-8 sm:pb-10 text-center px-4">
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-gray-900 leading-[1.05]">
            Butuh peralatan?
            <br />
            <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 bg-clip-text text-transparent">
              Pinjam sekarang.
            </span>
          </h1>
          <p className="mt-4 sm:mt-5 text-gray-500 max-w-xl mx-auto text-sm sm:text-base leading-relaxed">
            Pilih barang yang kamu butuhkan, isi data diri, dan langsung
            dapatkan kode peminjaman. Tunjukkan kodenya ke admin untuk mengambil
            barang.
          </p>

          {/* Stats */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white border border-gray-100 shadow-sm">
              <Boxes className="w-4 h-4 text-indigo-600" />
              <span className="text-sm font-bold text-gray-900">
                {items.length}
              </span>
              <span className="text-xs text-gray-500">Jenis Barang</span>
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white border border-gray-100 shadow-sm">
              <PackageCheck className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-bold text-gray-900">
                {totalUnits}
              </span>
              <span className="text-xs text-gray-500">Unit Tersedia</span>
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white border border-gray-100 shadow-sm">
              <Timer className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-bold text-gray-900">24/7</span>
              <span className="text-xs text-gray-500">Selalu Dibuka</span>
            </div>
          </div>
        </section>

        <main className="max-w-6xl mx-auto px-4 pb-16">
          {/* Step indicator */}
          {step !== "success" && (
            <div className="flex items-center justify-center mb-10">
              {STEPS.map((s, idx) => {
                const done = idx < currentIndex;
                const active = idx === currentIndex;
                return (
                  <div key={s.key} className="flex items-center">
                    {idx > 0 && (
                      <div
                        className={clsx(
                          "h-0.5 w-8 sm:w-24 mx-2 rounded-full transition-colors",
                          idx <= currentIndex ? "bg-indigo-500" : "bg-gray-200"
                        )}
                      />
                    )}
                    <div className="flex flex-col items-center gap-1.5 w-20 sm:w-24">
                      <div
                        className={clsx(
                          "w-9 h-9 rounded-full grid place-items-center text-sm font-bold border-2 transition-all",
                          done
                            ? "bg-indigo-600 border-indigo-600 text-white"
                            : active
                            ? "border-indigo-600 text-indigo-600 bg-white shadow-lg shadow-indigo-500/20"
                            : "border-gray-200 text-gray-400 bg-white"
                        )}
                      >
                        {done ? <Check className="w-4 h-4" /> : idx + 1}
                      </div>
                      <span
                        className={clsx(
                          "text-[10px] sm:text-xs font-semibold text-center",
                          active || done ? "text-gray-800" : "text-gray-400"
                        )}
                      >
                        {s.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ============ STEP 1: PILIH BARANG ============ */}
          {step === "item" && (
            <div key="step-item" className="animate-slide-in pb-32">
              {/* Search & filter */}
              <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
                <div className="relative flex-1 md:max-w-sm">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari barang yang kamu butuhkan..."
                    className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setCategory(cat)}
                      className={clsx(
                        "shrink-0 px-3.5 py-2 rounded-full text-xs font-semibold border transition-all",
                        category === cat
                          ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-500/25"
                          : "bg-white border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600"
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-xs text-gray-400 mb-5">
                Menampilkan {filtered.length} barang yang tersedia
              </p>

              {filtered.length === 0 ? (
                <div className="text-center py-16 bg-gray-50 rounded-3xl border border-dashed border-gray-200">
                  <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="font-semibold text-gray-700 mb-1">
                    Barang tidak ditemukan
                  </h3>
                  <p className="text-sm text-gray-500">
                    Coba kata kunci atau kategori lain.
                  </p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filtered.map((item) => {
                    const meta = getCategoryMeta(item.category);
                    const pct = Math.round(
                      (item.availableQuantity / item.quantity) * 100
                    );
                    const isActive = selected?.id === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setSelected(item);
                          setQty(1);
                        }}
                        className={clsx(
                          "group relative text-left bg-white rounded-2xl border p-5 transition-all duration-200 hover:shadow-xl hover:shadow-indigo-500/5 hover:-translate-y-0.5",
                          isActive
                            ? "ring-2 ring-indigo-600 border-transparent shadow-lg shadow-indigo-500/10"
                            : "border-gray-150 border-gray-100"
                        )}
                      >
                        {isActive && (
                          <div className="absolute -top-2.5 -right-2.5 w-7 h-7 bg-indigo-600 rounded-full grid place-items-center shadow-lg shadow-indigo-500/30 animate-pop">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        )}

                        <div className="flex items-start gap-3.5 mb-3">
                          <div
                            className={clsx(
                              "w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br shadow-lg shrink-0",
                              meta.gradient
                            )}
                          >
                            <meta.Icon className="w-6 h-6 text-white" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-bold text-gray-900 leading-snug">
                              {item.name}
                            </h3>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-gray-500">
                              <span className="inline-flex items-center gap-1 font-medium text-indigo-600">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                                {item.category}
                              </span>
                              {item.location && (
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {item.location}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {item.description && (
                          <p className="text-xs text-gray-500 line-clamp-2 mb-4 leading-relaxed">
                            {item.description}
                          </p>
                        )}

                        <div className="mb-1.5 flex items-center justify-between text-xs">
                          <span className="font-semibold text-gray-700">
                            {item.availableQuantity} dari {item.quantity} unit
                            tersedia
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={clsx(
                              "h-full rounded-full transition-all",
                              pct > 50
                                ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                                : pct > 20
                                ? "bg-gradient-to-r from-amber-500 to-orange-500"
                                : "bg-gradient-to-r from-rose-500 to-red-500"
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Sticky bottom bar */}
              {selected && selectedMeta && (
                <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4 animate-slide-in">
                  <div className="max-w-2xl mx-auto flex items-center gap-3 rounded-2xl border border-indigo-100 bg-white/90 backdrop-blur-xl shadow-2xl shadow-indigo-500/15 p-3">
                    <div
                      className={clsx(
                        "w-11 h-11 rounded-xl flex items-center justify-center bg-gradient-to-br shrink-0 shadow-md",
                        selectedMeta.gradient
                      )}
                    >
                      <selectedMeta.Icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">
                        {selected.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {selected.availableQuantity} unit tersedia untuk dipinjam
                      </p>
                    </div>
                    <button
                      onClick={() => setSelected(null)}
                      className="hidden sm:block px-3 py-2.5 text-xs font-semibold text-gray-500 hover:text-gray-800 transition-colors"
                    >
                      Ganti
                    </button>
                    <button
                      onClick={() => {
                        if (!session) {
                          toast("Silakan login terlebih dahulu", "error");
                          router.push("/login");
                          return;
                        }
                        if (!(session.user as any).phone || !(session.user as any).department) {
                          toast("Harap lengkapi profil Anda", "error");
                          router.push("/register/complete-profile");
                          return;
                        }
                        setStep("form");
                      }}
                      className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-semibold rounded-xl shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 transition-all"
                    >
                      Lanjut
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============ STEP 2: ISI DATA ============ */}
          {step === "form" && selected && selectedMeta && (
            <div key="step-form" className="animate-slide-in">
              <div className="grid lg:grid-cols-[340px_1fr] gap-6 items-start">
                {/* Selected item summary */}
                <aside className="lg:sticky lg:top-24 bg-gray-50/80 border border-gray-100 rounded-2xl p-5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-4">
                    Barang pilihanmu
                  </p>
                  <div className="flex items-start gap-3.5">
                    <div
                      className={clsx(
                        "w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br shadow-lg shrink-0",
                        selectedMeta.gradient
                      )}
                    >
                      <selectedMeta.Icon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 leading-snug">
                        {selected.name}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {selected.category}
                        {selected.location ? ` • ${selected.location}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-200/70">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-gray-500">Stok tersedia</span>
                      <span className="font-bold text-gray-900">
                        {selected.availableQuantity} unit
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-200/70 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                        style={{
                          width: `${Math.round(
                            (selected.availableQuantity / selected.quantity) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep("item")}
                    className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Ganti barang
                  </button>
                </aside>

                {/* Form */}
                <form
                  onSubmit={handleSubmit}
                  className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 sm:p-7 space-y-5"
                >
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">
                      Data Peminjam
                    </h2>
                    <p className="text-xs text-gray-500 mt-1">
                      Isi data dirimu — admin akan menghubungi lewat kontak
                      ini saat barang siap diambil.
                    </p>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1.5">
                        <User className="w-3.5 h-3.5 text-gray-400" />
                        Nama Lengkap <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) =>
                          setForm({ ...form, name: e.target.value })
                        }
                        readOnly={!!session?.user?.name}
                        placeholder="Nama kamu"
                        className={clsx(
                          "w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all",
                          session?.user?.name
                            ? "bg-gray-100 border-transparent text-gray-600 cursor-not-allowed"
                            : "bg-gray-50 border-gray-200"
                        )}
                        required
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1.5">
                        <Phone className="w-3.5 h-3.5 text-gray-400" />
                        Nomor HP / WhatsApp{" "}
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) =>
                          setForm({ ...form, phone: e.target.value })
                        }
                        readOnly={!!(session?.user as any)?.phone}
                        placeholder="08xxxxxxxxxx"
                        className={clsx(
                          "w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all",
                          (session?.user as any)?.phone
                            ? "bg-gray-100 border-transparent text-gray-600 cursor-not-allowed"
                            : "bg-gray-50 border-gray-200"
                        )}
                        required
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1.5">
                        <Mail className="w-3.5 h-3.5 text-gray-400" />
                        Email <span className="text-gray-400">(opsional)</span>
                      </label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) =>
                          setForm({ ...form, email: e.target.value })
                        }
                        readOnly={!!session?.user?.email}
                        placeholder="email@contoh.com"
                        className={clsx(
                          "w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all",
                          session?.user?.email
                            ? "bg-gray-100 border-transparent text-gray-600 cursor-not-allowed"
                            : "bg-gray-50 border-gray-200"
                        )}
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1.5">
                        <Building2 className="w-3.5 h-3.5 text-gray-400" />
                        Departemen / Unit{" "}
                        <span className="text-gray-400">(opsional)</span>
                      </label>
                      <input
                        type="text"
                        value={form.department}
                        onChange={(e) =>
                          setForm({ ...form, department: e.target.value })
                        }
                        readOnly={!!(session?.user as any)?.department}
                        placeholder="Contoh: IT, Marketing"
                        className={clsx(
                          "w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all",
                          (session?.user as any)?.department
                            ? "bg-gray-100 border-transparent text-gray-600 cursor-not-allowed"
                            : "bg-gray-50 border-gray-200"
                        )}
                      />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1.5">
                        <Package className="w-3.5 h-3.5 text-gray-400" />
                        Jumlah
                      </label>
                      <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl p-1">
                        <button
                          type="button"
                          onClick={() => setQty((q) => Math.max(1, q - 1))}
                          className="w-9 h-9 rounded-lg grid place-items-center text-gray-500 hover:bg-white hover:shadow-sm hover:text-indigo-600 transition-all"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <div className="flex-1 text-center">
                          <span className="text-lg font-bold text-gray-900">
                            {qty}
                          </span>
                          <span className="text-[10px] text-gray-400 block -mt-1">
                            maks {selected.availableQuantity}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setQty((q) =>
                              Math.min(selected.availableQuantity, q + 1)
                            )
                          }
                          className="w-9 h-9 rounded-lg grid place-items-center text-gray-500 hover:bg-white hover:shadow-sm hover:text-indigo-600 transition-all"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1.5">
                        <CalendarDays className="w-3.5 h-3.5 text-gray-400" />
                        Tanggal Kembali <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={form.returnDate}
                        min={todayStr}
                        onChange={(e) =>
                          setForm({ ...form, returnDate: e.target.value })
                        }
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1.5">
                      <StickyNote className="w-3.5 h-3.5 text-gray-400" />
                      Catatan <span className="text-gray-400">(opsional)</span>
                    </label>
                    <textarea
                      value={form.notes}
                      onChange={(e) =>
                        setForm({ ...form, notes: e.target.value })
                      }
                      placeholder="Contoh: untuk acara gathering hari Jumat"
                      rows={2}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none transition-all"
                    />
                  </div>

                  <div className="flex items-start gap-2.5 bg-indigo-50/70 border border-indigo-100 rounded-xl p-3.5">
                    <ShieldCheck className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-indigo-800 leading-relaxed">
                      Dengan mengirim formulir ini, kamu setuju untuk
                      mengembalikan barang tepat waktu dalam kondisi baik.
                      Stok barang langsung dikunci setelah permintaan dibuat.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setStep("item")}
                      className="inline-flex items-center justify-center gap-2 sm:flex-none px-5 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 text-sm font-semibold transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Kembali
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:opacity-95 disabled:opacity-60 transition-all"
                    >
                      <Send className="w-4 h-4" />
                      {submitting ? "Memproses..." : "Buat Kode Peminjaman"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ============ STEP 3: SUKSES ============ */}
          {step === "success" && result && (
            <div key="step-success" className="animate-slide-in">
              <div className="max-w-lg mx-auto text-center">
                <div className="relative inline-grid place-items-center mb-6">
                  <span className="absolute w-28 h-28 rounded-full bg-emerald-400/20 animate-ping" />
                  <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 grid place-items-center shadow-xl shadow-emerald-500/30 animate-pop">
                    <Check className="w-10 h-10 text-white" strokeWidth={3} />
                  </div>
                </div>

                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-semibold mb-3">
                  <PartyPopper className="w-3.5 h-3.5" />
                  Permintaan berhasil dibuat
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                  Satu Langkah Lagi!
                </h2>
                <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto leading-relaxed">
                  Untuk memproses peminjaman ini, Anda wajib mengunduh Formulir Peminjaman, menandatanganinya, dan mengunggahnya kembali.
                </p>

                {/* Receipt */}
                <div className="mt-7 bg-white border border-gray-150 border-gray-100 rounded-3xl shadow-xl shadow-indigo-500/5 overflow-hidden text-left">
                  <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-5 flex items-center justify-between">
                    <div className="flex items-center gap-2.5 text-white">
                      <Receipt className="w-5 h-5" />
                      <span className="text-sm font-semibold">
                        Detail Peminjaman
                      </span>
                    </div>
                  </div>
                  <div className="px-6 py-6">
                    {[
                      { label: "Kode", value: result.code },
                      { label: "Barang", value: result.itemName },
                      {
                        label: "Jumlah",
                        value: `${result.quantity} unit`,
                      },
                      { label: "Peminjam", value: result.borrowerName },
                      {
                        label: "Tanggal Pinjam",
                        value: format(new Date(), "EEEE, dd MMMM yyyy", {
                          locale: idLocale,
                        }),
                      },
                    ].map((row) => (
                      <div
                        key={row.label}
                        className="flex items-start justify-between gap-4 py-2.5 border-b border-dashed border-gray-100 last:border-0"
                      >
                        <span className="text-xs font-medium text-gray-400">
                          {row.label}
                        </span>
                        <span className="text-sm font-semibold text-gray-900 text-right">
                          {row.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-5 flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-xl p-3.5 text-left">
                  <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-800 leading-relaxed">
                    Barang tidak dapat diambil sebelum formulir yang telah ditandatangani diunggah dan disetujui oleh admin.
                  </p>
                </div>

                <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
                  <Link
                    href={`/transactions/${result.transactionId}/upload`}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:opacity-95 transition-all"
                  >
                    <Copy className="w-4 h-4" />
                    Lengkapi Dokumen
                  </Link>
                  <button
                    onClick={resetAll}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 text-sm font-semibold transition-colors"
                  >
                    Kembali Beranda
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="border-t border-gray-100 py-8 text-center">
          <p className="text-xs text-gray-400">
            PinjamBarang — Sistem Peminjaman Barang Internal. Butuh bantuan?
            Hubungi admin di kantor.
          </p>
        </footer>
      </div>
    </div>
  );
}
