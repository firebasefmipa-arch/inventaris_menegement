"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  LOCATION_OPTIONS,
  CUSTOM_LOCATION_VALUE,
  normalizeLocation,
} from "@/lib/locations";

/**
 * Dropdown Lokasi barang + opsi custom.
 * Lokasi custom yang sudah dipakai barang ikut muncul di daftar (extraOptions),
 * jadi otomatis "tersimpan" tanpa tabel baru.
 */
export function LocationSelect({
  value,
  onChange,
  extraOptions = [],
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  extraOptions?: string[];
  className?: string;
}) {
  const options = useMemo(() => {
    const extra = extraOptions
      .map((o) => normalizeLocation(o))
      .filter((o) => o && !LOCATION_OPTIONS.includes(o));
    return [...LOCATION_OPTIONS, ...Array.from(new Set(extra))];
  }, [extraOptions]);

  // Nilai di luar daftar resmi → mode custom
  const isCustomValue =
    !!value && !options.includes(value) && value !== CUSTOM_LOCATION_VALUE;
  const [showCustom, setShowCustom] = useState(isCustomValue);
  const [custom, setCustom] = useState(isCustomValue ? value : "");

  // Sinkron kalau `value` berubah dari luar (mis. data edit baru selesai dimuat)
  useEffect(() => {
    const isCustom = !!value && !options.includes(value);
    setShowCustom(isCustom);
    setCustom(isCustom ? value : "");
  }, [value, options]);

  const selected = isCustomValue ? CUSTOM_LOCATION_VALUE : value;

  return (
    <>
      <select
        value={selected}
        onChange={(e) => {
          if (e.target.value === CUSTOM_LOCATION_VALUE) {
            setShowCustom(true);
            onChange(custom);
          } else {
            setShowCustom(false);
            setCustom("");
            onChange(e.target.value);
          }
        }}
        className={clsx(
          "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none",
          className
        )}
      >
        <option value="">Pilih Lokasi</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
        <option value={CUSTOM_LOCATION_VALUE}>{CUSTOM_LOCATION_VALUE}</option>
      </select>

      {showCustom && (
        <input
          type="text"
          autoFocus
          value={custom}
          onChange={(e) => {
            setCustom(e.target.value);
            onChange(e.target.value);
          }}
          onBlur={(e) => {
            // Auto-correct kapitalisasi saat selesai mengetik
            const fixed = normalizeLocation(e.target.value);
            setCustom(fixed);
            onChange(fixed);
          }}
          placeholder="Tulis nama lokasi baru..."
          className="mt-2 w-full px-3 py-2 bg-indigo-50 border border-indigo-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
        />
      )}
    </>
  );
}
