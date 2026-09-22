"use client";

import { useEffect, useRef, useState } from "react";
import { X, Download, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toaster";
import { bp } from "@/lib/basepath";
import { IMPORT_COLUMNS, IMPORT_AUTO_COLUMNS } from "@/lib/item-import";

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Ringkasan hasil impor: berapa masuk, berapa dilewati, dan sebabnya. */
type HasilImpor = {
  importedCount: number;
  skippedRows: number;
  duplicateRows: number;
  duplicates: string[];
  warnings: string[];
};

export function ImportModal({ isOpen, onClose }: ImportModalProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [seret, setSeret] = useState(false);
  const [hasil, setHasil] = useState<HasilImpor | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const tutup = () => {
    setFile(null);
    setHasil(null);
    setSeret(false);
    onClose();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") tutup();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  async function kirim(f: File) {
    setLoading(true);
    setHasil(null);
    try {
      const formData = new FormData();
      formData.append("file", f);

      const res = await fetch("/api/items/import", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Duplikat/skip tetap dilaporkan lewat toast walau permintaan ditolak
        throw new Error(data.error || "Gagal mengimpor file");
      }

      setHasil({
        importedCount: data.importedCount ?? 0,
        skippedRows: data.skippedRows ?? 0,
        duplicateRows: data.duplicateRows ?? 0,
        duplicates: data.duplicates ?? [],
        warnings: data.warnings ?? [],
      });
      toast(`Berhasil mengimpor ${data.importedCount} barang.`, "success");
      router.refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Gagal mengimpor file", "error");
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  const kolom = (wajib: boolean) => IMPORT_COLUMNS.filter((c) => c.wajib === wajib);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Impor Barang</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Unggah file Excel/CSV (.xlsx, .xls, .csv) berisi daftar barang.
            </p>
          </div>
          <button
            onClick={tutup}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-5">
          {/* Langkah 1 — template */}
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-900">1. Unduh template</p>
                <p className="text-xs text-gray-600 mt-1">
                  Isi file mengikuti susunan kolom template. Nama kolom di baris pertama
                  harus sama persis — kalau berbeda, kolomnya diabaikan diam-diam.
                </p>
              </div>
              <a
                href={bp("/api/items/import/template")}
                download
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors text-xs font-medium shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Template .xlsx
              </a>
            </div>
          </div>

          {/* Daftar kolom */}
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-gray-500" />
              <span className="text-xs font-semibold text-gray-700">Susunan kolom</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-100">
                    <th className="text-left font-medium px-4 py-2">Kolom</th>
                    <th className="text-left font-medium px-2 py-2">Contoh</th>
                    <th className="text-left font-medium px-2 py-2">Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  {kolom(true).map((c) => (
                    <tr key={c.header} className="border-b border-gray-50 bg-amber-50/40">
                      <td className="px-4 py-2 font-semibold text-gray-900 whitespace-nowrap">
                        {c.header} <span className="text-red-500">*</span>
                      </td>
                      <td className="px-2 py-2 text-gray-500 whitespace-nowrap">{c.contoh1 || "—"}</td>
                      <td className="px-2 py-2 text-gray-600">{c.keterangan}</td>
                    </tr>
                  ))}
                  {kolom(false).map((c) => (
                    <tr key={c.header} className="border-b border-gray-50">
                      <td className="px-4 py-2 font-medium text-gray-800 whitespace-nowrap">{c.header}</td>
                      <td className="px-2 py-2 text-gray-500 whitespace-nowrap">{c.contoh1 || "—"}</td>
                      <td className="px-2 py-2 text-gray-600">{c.keterangan}</td>
                    </tr>
                  ))}
                  {IMPORT_AUTO_COLUMNS.map((c) => (
                    <tr key={c.header} className="bg-gray-50/70">
                      <td className="px-4 py-2 font-medium text-gray-400 whitespace-nowrap">{c.header}</td>
                      <td className="px-2 py-2 text-gray-400 whitespace-nowrap">—</td>
                      <td className="px-2 py-2 text-gray-500">{c.keterangan}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-4 py-2.5 text-[11px] text-gray-500 bg-gray-50/50 border-t border-gray-100">
              <span className="text-red-500">*</span> wajib diisi. Kolom lain boleh dikosongkan.
              Barang yang sudah ada di daftar (nomor inventaris / SN / nama+lokasi sama) akan
              dilewati agar tidak dobel.
            </p>
          </div>

          {/* Hasil impor */}
          {hasil && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <p className="text-sm font-semibold text-emerald-900">
                  {hasil.importedCount} barang berhasil diimpor
                </p>
              </div>
              <ul className="text-xs text-emerald-800 space-y-0.5 pl-6">
                {hasil.duplicateRows > 0 && (
                  <li>{hasil.duplicateRows} baris duplikat dilewati (tidak dobel)</li>
                )}
                {hasil.skippedRows > 0 && (
                  <li>{hasil.skippedRows} baris dilewati karena nama kosong</li>
                )}
                {hasil.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
              {hasil.duplicates.length > 0 && (
                <details className="text-xs text-emerald-800 pl-6">
                  <summary className="cursor-pointer font-medium">Lihat daftar duplikat</summary>
                  <ul className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
                    {hasil.duplicates.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {/* Langkah 2 — unggah */}
          <div>
            <p className="text-sm font-semibold text-gray-900 mb-2">2. Unggah file yang sudah diisi</p>
            <div
              onDragOver={(e) => { e.preventDefault(); setSeret(true); }}
              onDragLeave={() => setSeret(false)}
              onDrop={(e) => {
                e.preventDefault();
                setSeret(false);
                const f = e.dataTransfer.files?.[0];
                if (f) { setFile(f); void kirim(f); }
              }}
              onClick={() => inputRef.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
                seret ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:border-indigo-300 hover:bg-gray-50"
              }`}
            >
              <Upload className="w-6 h-6 text-gray-400 mx-auto mb-2" />
              {file ? (
                <>
                  <p className="text-sm font-medium text-gray-900 break-all">{file.name}</p>
                  <p className="text-xs text-gray-500 mt-1">Klik untuk memilih file lain</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-gray-700">Tarik file ke sini atau klik untuk memilih</p>
                  <p className="text-xs text-gray-400 mt-1">Format .xlsx, .xls, atau .csv</p>
                </>
              )}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) { setFile(f); void kirim(f); }
                e.target.value = "";
              }}
            />
          </div>

          <p className="text-[11px] text-gray-500 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            Impor tidak bisa dibatalkan. Periksa file dulu — barang yang sudah masuk harus
            dihapus manual kalau salah.
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
          <button
            type="button"
            onClick={tutup}
            className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 text-sm font-medium transition-colors"
          >
            {hasil ? "Selesai" : "Batal"}
          </button>
          {file && !hasil && (
            <button
              type="button"
              onClick={() => void kirim(file)}
              disabled={loading}
              className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4" />
              {loading ? "Memproses..." : "Unggah Ulang"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
