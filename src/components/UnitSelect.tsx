"use client";

import { Building2, Lock } from "lucide-react";
import { UNIT_GROUPS, unitCode, unitDikenal, normalizeUnit } from "@/lib/units";

/**
 * Pemilih unit — daftar TETAP (tidak bisa diketik bebas).
 *
 * Berbeda dari Lokasi yang kini ketik bebas: unit menentukan KODE BARANG dan
 * hak kelola admin, jadi salah ketik di sini berakibat barang dinomori
 * "LAIN-lain" dan tak bisa dikelola admin mana pun.
 *
 * `allowedUnits` membatasi pilihan ke unit yang dikelola pemakai:
 *   null  → semua unit (superadmin), boleh dikosongkan
 *   [x]   → TERKUNCI ke x (admin satu unit: tak perlu memilih lagi)
 *   [x,y] → hanya x & y, wajib dipilih
 *   []    → tak punya unit; tak ada yang bisa dipilih
 *
 * Admin (allowedUnits bukan null) menjadikan unit WAJIB. Tanpa ini, unit kosong
 * membuat kode barang memakai "LAIN" dan barangnya jatuh ke tangan superadmin
 * saja — pekerjaan admin hilang diam-diam.
 */
export function UnitSelect({
  value,
  onChange,
  allowedUnits = null,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  allowedUnits?: string[] | null;
  className?: string;
}) {
  const izin = allowedUnits === null ? null : allowedUnits.map(normalizeUnit);
  const boleh = (u: string) => izin === null || izin.includes(normalizeUnit(u));

  // Dikelompokkan ulang setelah disaring — grup yang kosong tak ditinggalkan
  // jadi judul menggantung tanpa isi.
  const grup = UNIT_GROUPS.map((g) => ({ ...g, options: g.options.filter(boleh) })).filter(
    (g) => g.options.length > 0
  );

  // Unit tersimpan di luar daftar resmi (data lama) tetap ditawarkan kepada yang
  // memang mengelolanya — jangan sampai haknya raib tanpa pemberitahuan.
  const sumber = izin === null ? [value] : izin;
  const luar = sumber.filter(
    (u) => u && !unitDikenal(u) && !grup.some((g) => g.options.includes(u))
  );

  const terkunci = izin !== null && izin.length === 1;
  const asing = value && !unitDikenal(value);

  // Satu unit → tidak ada yang perlu dipilih. Ditampilkan terkunci supaya admin
  // tahu barangnya masuk ke unit mana, tapi tak bisa salah pilih.
  if (terkunci) {
    return (
      <div className={className}>
        <div className="relative">
          <Building2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <div className="w-full rounded-xl border border-gray-200 bg-gray-100 py-2.5 pl-10 pr-10 text-sm text-gray-700">
            {izin[0]} <span className="text-gray-400">({unitCode(izin[0])})</span>
          </div>
          <Lock className="pointer-events-none absolute right-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        </div>
        <p className="mt-1.5 text-[11px] text-gray-500">
          Terisi otomatis — Anda hanya mengelola unit ini.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="relative">
        <Building2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={izin !== null}
          className="w-full appearance-none rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          <option value="">{izin === null ? "Pilih unit (opsional)" : "Pilih unit (wajib)"}</option>
          {grup.map((g) => (
            <optgroup key={g.group} label={`── ${g.group} ──`}>
              {g.options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt} ({unitCode(opt)})
                </option>
              ))}
            </optgroup>
          ))}
          {/* Unit lama di luar daftar tetap ditampilkan agar tak terhapus diam-diam */}
          {luar.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
          {asing && !luar.includes(value) && <option value={value}>{value}</option>}
        </select>
      </div>
      {izin === null && asing && (
        <p className="mt-1.5 text-[11px] text-amber-600">
          Unit &ldquo;{value}&rdquo; tidak ada di daftar resmi — kode barangnya memakai
          &ldquo;LAIN&rdquo;. Sebaiknya pilih dari daftar.
        </p>
      )}
      {izin !== null && izin.length === 0 && (
        <p className="mt-1.5 text-[11px] text-red-600">
          Anda belum ditugaskan ke unit mana pun — hubungi Super Admin.
        </p>
      )}
    </div>
  );
}
