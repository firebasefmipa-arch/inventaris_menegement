"use client";

import { useState } from "react";
import { FileText, Download, RefreshCcw, AlertTriangle } from "lucide-react";

interface Props {
  signedDocumentUrl: string | null;
  type: "transaction" | "handover";
  id: number;
  onRegenerated?: () => void; // callback setelah regenerate berhasil
}

export function DocActions({ signedDocumentUrl, type, id, onRegenerated }: Props) {
  const [regenerating, setRegenerating] = useState(false);

  const isDeleted = signedDocumentUrl === "deleted";
  const hasDoc = signedDocumentUrl && !isDeleted;

  const apiUrl = type === "transaction"
    ? `/api/transactions/${id}/regenerate-doc`
    : `/api/handovers/${id}/regenerate-doc`;

  const handleRegenerate = async () => {
    if (!confirm("Generate ulang dokumen ini? File baru akan dibuat dan status akan kembali ke 'Menunggu Persetujuan'.")) return;
    setRegenerating(true);
    try {
      const res = await fetch(apiUrl, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal generate ulang");
      alert(data.message);
      onRegenerated?.();
    } catch (err: any) {
      alert(err.message || "Terjadi kesalahan");
    } finally {
      setRegenerating(false);
    }
  };

  // Dokumen ada dan valid
  if (hasDoc) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <a
          href={signedDocumentUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full hover:bg-blue-100 transition-colors"
        >
          <FileText className="w-3 h-3" /> Lihat Dokumen
        </a>
        <a
          href={signedDocumentUrl}
          download
          className="flex items-center gap-1 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-full hover:bg-indigo-100 transition-colors"
        >
          <Download className="w-3 h-3" /> Download
        </a>
      </div>
    );
  }

  // Dokumen telah dihapus
  if (isDeleted) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-full">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span>Dokumen dihapus admin</span>
        </div>
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={regenerating}
          className="flex items-center gap-1 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-full hover:bg-teal-100 disabled:opacity-50 transition-colors"
        >
          <RefreshCcw className={`w-3 h-3 ${regenerating ? "animate-spin" : ""}`} />
          {regenerating ? "Memproses..." : "Generate Ulang"}
        </button>
      </div>
    );
  }

  // Tidak ada dokumen (belum upload)
  return null;
}
