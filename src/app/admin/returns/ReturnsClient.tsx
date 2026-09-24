"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Undo2, PackageCheck, Search, AlertCircle, CheckCircle2, History } from "lucide-react";
import clsx from "clsx";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { useToast } from "@/components/Toaster";

type DiLuar = {
  itemId: number;
  itemCode: string | null;
  itemName: string;
  diserahkan: number;
  kembali: number;
  diLuar: number;
};

type Riwayat = {
  id: number;
  itemId: number;
  quantity: number;
  itemName: string | null;
  itemCode: string | null;
  returnedBy: string;
  receivedBy: string | null;
  notes: string | null;
  returnDate: string;
  createdAt: string;
};

export function ReturnsClient({
  initialRiwayat,
  initialDiLuar,
}: {
  initialRiwayat: Riwayat[];
  initialDiLuar: DiLuar[];
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [riwayat, setRiwayat] = useState<Riwayat[]>(initialRiwayat);
  const [diLuar, setDiLuar] = useState<DiLuar[]>(initialDiLuar);

  const [kode, setKode] = useState("");
  const [jumlah, setJumlah] = useState("1");
  const [returnedBy, setReturnedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [cariRiwayat, setCariRiwayat] = useState("");
  const [tampilSemua, setTampilSemua] = useState(false);

  // Barang yang cocok dengan kode yang sedang diketik.
  const cocok = useMemo(() => {
    const k = kode.trim().toUpperCase();
    if (!k) return null;
    return diLuar.find((d) => (d.itemCode ?? "").toUpperCase() === k) ?? null;
  }, [kode, diLuar]);

  const riwayatTampil = useMemo(() => {
    const q = cariRiwayat.trim().toLowerCase();
    const hasil = q
      ? riwayat.filter((r) =>
          [r.itemName, r.itemCode, r.returnedBy, r.receivedBy]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))
        )
      : riwayat;
    return tampilSemua ? hasil : hasil.slice(0, 10);
  }, [riwayat, cariRiwayat, tampilSemua]);

  const simpan = async () => {
    const n = Number(jumlah);
    if (!kode.trim()) return toast("Kode barang wajib diisi", "error");
    if (!returnedBy.trim()) return toast("Nama yang mengembalikan wajib diisi", "error");
    if (!Number.isInteger(n) || n < 1) return toast("Jumlah minimal 1", "error");
    if (cocok && n > cocok.diLuar) {
      return toast(`Jumlah melebihi yang di luar. "${cocok.itemName}" di luar ${cocok.diLuar} unit.`, "error");
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemCode: kode.trim(),
          quantity: n,
          returnedBy: returnedBy.trim(),
          notes: notes.trim(),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast(data.error || "Gagal menyimpan", "error");
        return;
      }

      toast(data.message || "Pengembalian tercatat", "success");
      setKode("");
      setJumlah("1");
      setReturnedBy("");
      setNotes("");

      // Muat ulang dari server supaya stok & sisa "di luar" pasti sinkron.
      const fresh = await fetch("/api/admin/returns");
      const baru = await fresh.json();
      if (Array.isArray(baru.riwayat)) setRiwayat(baru.riwayat);
      if (Array.isArray(baru.diLuar)) setDiLuar(baru.diLuar);
      router.refresh();
    } catch {
      toast("Gagal menyimpan", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Form pengembalian ── */}
      <div className="bg-white dark:bg-[#162035] rounded-2xl border border-gray-100 dark:border-[#1c2e48] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Undo2 className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          <h2 className="font-bold text-gray-900 dark:text-slate-100">Catat Barang Kembali</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
              Kode Barang
            </label>
            <input
              value={kode}
              onChange={(e) => setKode(e.target.value)}
              placeholder="mis. FMIPA-TI-2026-002"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-[#1c2e48] bg-white dark:bg-[#101e33] text-gray-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/40"
            />
            {kode.trim() && (
              <div className="mt-2 text-sm">
                {cocok ? (
                  <span className="inline-flex items-center gap-2 text-teal-700 dark:text-teal-400">
                    <CheckCircle2 className="w-4 h-4" />
                    {cocok.itemName} — sedang di luar {cocok.diLuar} unit
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 text-amber-700 dark:text-amber-400">
                    <AlertCircle className="w-4 h-4" />
                    Kode ini tidak sedang di luar. Cek daftar di samping.
                  </span>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
              Jumlah Kembali
            </label>
            <input
              type="number"
              min={cocok ? 1 : 1}
              max={cocok?.diLuar}
              value={jumlah}
              onChange={(e) => setJumlah(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-[#1c2e48] bg-white dark:bg-[#101e33] text-gray-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
              Dikembalikan Oleh
            </label>
            <input
              value={returnedBy}
              onChange={(e) => setReturnedBy(e.target.value)}
              placeholder="Nama yang menyerahkan kembali"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-[#1c2e48] bg-white dark:bg-[#101e33] text-gray-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
              Catatan <span className="text-gray-400 font-normal">(opsional)</span>
            </label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="mis. kondisi masih baik"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-[#1c2e48] bg-white dark:bg-[#101e33] text-gray-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40"
            />
          </div>
        </div>

        <button
          onClick={simpan}
          disabled={saving}
          className="mt-4 w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Menyimpan..." : "Simpan Pengembalian"}
        </button>
      </div>

      {/* ── Unit yang masih di luar ── */}
      <div className="bg-white dark:bg-[#162035] rounded-2xl border border-gray-100 dark:border-[#1c2e48] p-5">
        <div className="flex items-center gap-2 mb-4">
          <PackageCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <h2 className="font-bold text-gray-900 dark:text-slate-100">
            Sedang di Luar ({diLuar.length})
          </h2>
        </div>

        {diLuar.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Tidak ada barang yang sedang di luar. Semua unit ada di inventaris.
          </p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-[#1c2e48]">
            {diLuar.map((d) => (
              <button
                key={d.itemId}
                onClick={() => setKode(d.itemCode ?? "")}
                className="w-full flex items-center justify-between gap-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-[#101e33] rounded-lg px-2 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-slate-100 truncate">
                    {d.itemName}
                  </div>
                  <div className="text-xs font-mono text-gray-500 dark:text-slate-400">
                    {d.itemCode || "(tanpa kode)"}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-blue-700 dark:text-blue-400">{d.diLuar} unit</div>
                  <div className="text-xs text-gray-400">
                    diserahkan {d.diserahkan}, kembali {d.kembali}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Riwayat ── */}
      <div className="bg-white dark:bg-[#162035] rounded-2xl border border-gray-100 dark:border-[#1c2e48] p-5">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-gray-600 dark:text-slate-400" />
            <h2 className="font-bold text-gray-900 dark:text-slate-100">Riwayat Pengembalian</h2>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={cariRiwayat}
              onChange={(e) => setCariRiwayat(e.target.value)}
              placeholder="Cari barang / nama"
              className="pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-[#1c2e48] bg-white dark:bg-[#101e33] text-gray-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40"
            />
          </div>
        </div>

        {riwayat.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-slate-400">Belum ada pengembalian tercatat.</p>
        ) : (
          <>
            <div className="divide-y divide-gray-100 dark:divide-[#1c2e48]">
              {riwayatTampil.map((r) => (
                <div key={r.id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-slate-100 truncate">
                        {r.itemName || "Barang"}
                      </div>
                      <div className="text-xs font-mono text-gray-500 dark:text-slate-400">
                        {r.itemCode || "(tanpa kode)"}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-teal-700 dark:text-teal-400">
                        +{r.quantity} unit
                      </div>
                      <div className="text-xs text-gray-400">
                        {format(new Date(r.returnDate), "d MMM yyyy HH:mm", { locale: idLocale })}
                      </div>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                    Dikembalikan oleh <span className="font-medium">{r.returnedBy}</span>
                    {r.receivedBy && <> · diterima <span className="font-medium">{r.receivedBy}</span></>}
                    {r.notes && <> · {r.notes}</>}
                  </div>
                </div>
              ))}
            </div>

            {riwayat.length > 10 && (
              <button
                onClick={() => setTampilSemua((v) => !v)}
                className="mt-3 text-sm font-medium text-teal-700 dark:text-teal-400 hover:underline"
              >
                {tampilSemua ? "Tampilkan lebih sedikit" : `Tampilkan semua (${riwayat.length})`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
