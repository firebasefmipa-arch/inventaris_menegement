"use client";

import { useId, useMemo } from "react";
import clsx from "clsx";
import { LOCATION_OPTIONS, normalizeLocation } from "@/lib/locations";

/**
 * Lokasi barang — KETIK BEBAS.
 *
 * Dulu dropdown tertutup. Sekarang dibebaskan karena lokasi hanyalah keterangan
 * tempat, tidak memengaruhi kode barang maupun hak kelola (itu urusan Unit).
 * Lokasi yang sudah pernah dipakai tetap ditawarkan lewat `<datalist>` bawaan
 * peramban — jadi saran tetap ada, tapi pemakai tak terkurung pada daftar itu.
 *
 * Memakai datalist, bukan dropdown buatan sendiri: peramban sudah menyediakan
 * penyaringan saat mengetik, tanpa satu baris JavaScript pun.
 */
export function LocationSelect({
  value,
  onChange,
  extraOptions = [],
  className,
  placeholder = "Tulis lokasi, mis. Ruang Server Lt. 2",
}: {
  value: string;
  onChange: (v: string) => void;
  extraOptions?: string[];
  className?: string;
  placeholder?: string;
}) {
  const idDaftar = useId();

  const saran = useMemo(() => {
    const semua = [...LOCATION_OPTIONS, ...extraOptions.map((o) => normalizeLocation(o))];
    return Array.from(new Set(semua.filter(Boolean))).sort();
  }, [extraOptions]);

  return (
    <>
      <input
        type="text"
        list={idDaftar}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onChange(normalizeLocation(e.target.value))}
        placeholder={placeholder}
        className={clsx(
          "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
          className
        )}
      />
      <datalist id={idDaftar}>
        {saran.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
    </>
  );
}
