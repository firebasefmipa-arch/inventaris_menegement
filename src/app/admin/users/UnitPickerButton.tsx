"use client";

import { useState } from "react";
import { changeUserRole, aturUnitAdmin } from "./actions";
import { UNIT_OPTIONS, unitCode } from "@/lib/units";
import { Building2, Shield, X } from "lucide-react";
import clsx from "clsx";

/**
 * Dua mode, satu komponen:
 *  - "promote" : promosikan user jadi admin, unit WAJIB dipilih minimal 1
 *  - "atur"    : ubah daftar unit admin yang sudah ada (tambah/cabut)
 *
 * Alasan digabung: keduanya sama-sama menampilkan daftar kotak centang unit.
 * Memisahkannya cuma menggandakan tampilan yang identik.
 */
export function UnitPickerButton({
  userId,
  userName,
  mode,
  unitsAwal = [],
  isCurrentUser = false,
}: {
  userId: string;
  userName: string;
  mode: "promote" | "atur";
  unitsAwal?: string[];
  isCurrentUser?: boolean;
}) {
  const [buka, setBuka] = useState(false);
  const [pilih, setPilih] = useState<string[]>(unitsAwal);
  const [loading, setLoading] = useState(false);

  const toggle = (unit: string) =>
    setPilih((lama) => (lama.includes(unit) ? lama.filter((u) => u !== unit) : [...lama, unit]));

  const simpan = async () => {
    if (pilih.length === 0) {
      alert("Pilih minimal 1 unit. Admin tanpa unit tidak bisa mengelola apa pun.");
      return;
    }
    setLoading(true);
    try {
      const hasil =
        mode === "promote"
          ? await changeUserRole(userId, "admin", pilih)
          : await aturUnitAdmin(userId, pilih);
      alert(hasil.message);
      if (hasil.success) setBuka(false);
    } catch {
      alert("Terjadi kesalahan sistem.");
    } finally {
      setLoading(false);
    }
  };

  const label = mode === "promote" ? "Promote" : "Atur Unit";
  const Ikon = mode === "promote" ? Shield : Building2;

  return (
    <>
      <button
        onClick={() => {
          if (isCurrentUser) return;
          setPilih(unitsAwal);
          setBuka(true);
        }}
        disabled={isCurrentUser}
        className={clsx(
          "flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors",
          mode === "promote"
            ? "bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50 dark:border dark:border-indigo-800/50"
            : "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50 dark:border dark:border-amber-800/50",
          isCurrentUser && "opacity-50 cursor-not-allowed"
        )}
        title={isCurrentUser ? "Ini adalah akun Anda" : label}
      >
        <Ikon className="w-4 h-4" />
        {label}
      </button>

      {buka && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 dark:border-slate-800 p-5">
              <div>
                <h2 className="font-bold text-gray-900 dark:text-slate-100">
                  {mode === "promote" ? "Promosikan jadi Admin" : "Atur Unit Pengelolaan"}
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                  {userName} — pilih unit yang boleh dikelola. Minimal 1.
                </p>
              </div>
              <button
                onClick={() => setBuka(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {pilih.length} unit dipilih
                </span>
                <button
                  onClick={() =>
                    setPilih(pilih.length === UNIT_OPTIONS.length ? [] : [...UNIT_OPTIONS])
                  }
                  className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  {pilih.length === UNIT_OPTIONS.length ? "Kosongkan" : "Pilih semua"}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {UNIT_OPTIONS.map((unit) => (
                  <label
                    key={unit}
                    className={clsx(
                      "flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm transition-colors",
                      pilih.includes(unit)
                        ? "border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300"
                        : "border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={pilih.includes(unit)}
                      onChange={() => toggle(unit)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="leading-tight">
                      {unit}
                      <span className="ml-1 text-[10px] uppercase text-gray-400">{unitCode(unit)}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-100 dark:border-slate-800 p-4">
              <button
                onClick={() => setBuka(false)}
                disabled={loading}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Batal
              </button>
              <button
                onClick={simpan}
                disabled={loading || pilih.length === 0}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading
                  ? "Menyimpan..."
                  : mode === "promote"
                  ? "Promosikan"
                  : "Simpan Unit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
