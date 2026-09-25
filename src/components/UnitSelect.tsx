"use client";

import { Building2 } from "lucide-react";
import { UNIT_GROUPS, unitCode, unitDikenal } from "@/lib/units";

/**
 * Pemilih unit — daftar TETAP (tidak bisa diketik bebas).
 *
 * Berbeda dari Lokasi yang kini ketik bebas: unit menentukan KODE BARANG dan
 * hak kelola admin, jadi salah ketik di sini berakibat barang dinomori
 * "LAIN-lain" dan tak bisa dikelola admin mana pun.
 */
export function UnitSelect({
  value,
  onChange,
  required = false,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  className?: string;
}) {
  const asing = value && !unitDikenal(value);

  return (
    <div className={className}>
      <div className="relative">
        <Building2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          className="w-full appearance-none rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          <option value="">Pilih unit (opsional)</option>
          {UNIT_GROUPS.map((g) => (
            <optgroup key={g.group} label={`── ${g.group} ──`}>
              {g.options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt} ({unitCode(opt)})
                </option>
              ))}
            </optgroup>
          ))}
          {/* Unit lama di luar daftar tetap ditampilkan agar tak terhapus diam-diam */}
          {asing && <option value={value}>{value}</option>}
        </select>
      </div>
      {asing && (
        <p className="mt-1.5 text-[11px] text-amber-600">
          Unit &ldquo;{value}&rdquo; tidak ada di daftar resmi — kode barangnya memakai
          &ldquo;LAIN&rdquo;. Sebaiknya pilih dari daftar.
        </p>
      )}
    </div>
  );
}
