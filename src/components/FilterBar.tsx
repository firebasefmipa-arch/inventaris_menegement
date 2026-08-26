"use client";

import { useState, useRef, useEffect } from "react";
import { Calendar, ChevronDown, User, X } from "lucide-react";
import clsx from "clsx";

export type TimePreset =
  | ""
  | "terbaru"
  | "terlama"
  | "seminggu"
  | "sebulan"
  | "setahun"
  | "custom";

export interface FilterState {
  user: string;
  timePreset: TimePreset;
  dateFrom: string;
  dateTo: string;
}

export const defaultFilter: FilterState = {
  user: "",
  timePreset: "",
  dateFrom: "",
  dateTo: "",
};

const TIME_PRESETS: { key: TimePreset; label: string }[] = [
  { key: "", label: "Semua Waktu" },
  { key: "terbaru", label: "Terbaru" },
  { key: "terlama", label: "Terlama" },
  { key: "seminggu", label: "7 Hari Terakhir" },
  { key: "sebulan", label: "30 Hari Terakhir" },
  { key: "setahun", label: "1 Tahun Terakhir" },
  { key: "custom", label: "Rentang Tanggal..." },
];

interface Props {
  filter: FilterState;
  onChange: (f: FilterState) => void;
  userList?: string[];
  userLabel?: string;
  showUserFilter?: boolean; // eksplisit tampilkan/sembunyikan filter user
}

export function FilterBar({ filter, onChange, userList = [], userLabel = "Semua User", showUserFilter = true }: Props) {
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showTimeDropdown, setShowTimeDropdown] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const userRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setShowUserDropdown(false);
      if (timeRef.current && !timeRef.current.contains(e.target as Node)) setShowTimeDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredUsers = userList.filter((u) =>
    u.toLowerCase().includes(userSearch.toLowerCase())
  );

  const timeLabel = filter.timePreset === "custom" && filter.dateFrom && filter.dateTo
    ? `${filter.dateFrom} s/d ${filter.dateTo}`
    : TIME_PRESETS.find((p) => p.key === filter.timePreset)?.label || "Semua Waktu";

  const hasActiveFilter = filter.user || filter.timePreset;

  const clearAll = () => onChange(defaultFilter);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Filter User — tampil jika showUserFilter=true */}
      {showUserFilter && (
        <div className="relative" ref={userRef}>
          <button
            onClick={() => { setShowUserDropdown(!showUserDropdown); setShowTimeDropdown(false); }}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all",
              filter.user
                ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                : "bg-white border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600"
            )}
          >
            <User className="w-3.5 h-3.5" />
            <span className="max-w-[120px] truncate">{filter.user || userLabel}</span>
            <ChevronDown className="w-3 h-3 shrink-0" />
          </button>

          {showUserDropdown && (
            <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-30 overflow-hidden">
              <div className="p-2 border-b border-gray-100">
                <input
                  type="text"
                  placeholder="Cari nama..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  autoFocus
                  className="w-full px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                />
              </div>
              <div className="max-h-48 overflow-y-auto py-1">
                <button
                  onClick={() => { onChange({ ...filter, user: "" }); setShowUserDropdown(false); setUserSearch(""); }}
                  className={clsx(
                    "w-full text-left px-4 py-2 text-xs transition-colors",
                    !filter.user ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-gray-700 hover:bg-gray-50"
                  )}
                >
                  {userLabel}
                </button>
                {filteredUsers.length === 0 ? (
                  <div className="px-4 py-2 text-xs text-gray-400">Tidak ada hasil</div>
                ) : (
                  filteredUsers.map((u) => (
                    <button
                      key={u}
                      onClick={() => { onChange({ ...filter, user: u }); setShowUserDropdown(false); setUserSearch(""); }}
                      className={clsx(
                        "w-full text-left px-4 py-2 text-xs transition-colors",
                        filter.user === u ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-gray-700 hover:bg-gray-50"
                      )}
                    >
                      {u}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filter Waktu */}
      <div className="relative" ref={timeRef}>
        <button
          onClick={() => { setShowTimeDropdown(!showTimeDropdown); setShowUserDropdown(false); }}
          className={clsx(
            "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all",
            filter.timePreset
              ? "bg-indigo-50 border-indigo-300 text-indigo-700"
              : "bg-white border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600"
          )}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span className="max-w-[140px] truncate">{timeLabel}</span>
          <ChevronDown className="w-3 h-3 shrink-0" />
        </button>

        {showTimeDropdown && (
          <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-30 overflow-hidden">
            <div className="py-1">
              {TIME_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  onClick={() => {
                    if (preset.key !== "custom") {
                      onChange({ ...filter, timePreset: preset.key, dateFrom: "", dateTo: "" });
                      setShowTimeDropdown(false);
                    } else {
                      onChange({ ...filter, timePreset: "custom" });
                    }
                  }}
                  className={clsx(
                    "w-full text-left px-4 py-2 text-xs transition-colors",
                    filter.timePreset === preset.key ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-gray-700 hover:bg-gray-50"
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom date range */}
            {filter.timePreset === "custom" && (
              <div className="p-3 border-t border-gray-100 space-y-2">
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Dari</label>
                  <input
                    type="date"
                    value={filter.dateFrom}
                    onChange={(e) => onChange({ ...filter, dateFrom: e.target.value })}
                    className="mt-0.5 w-full px-2 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Sampai</label>
                  <input
                    type="date"
                    value={filter.dateTo}
                    min={filter.dateFrom}
                    onChange={(e) => onChange({ ...filter, dateTo: e.target.value })}
                    className="mt-0.5 w-full px-2 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                  />
                </div>
                <button
                  onClick={() => setShowTimeDropdown(false)}
                  disabled={!filter.dateFrom || !filter.dateTo}
                  className="w-full py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Terapkan
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reset filter */}
      {hasActiveFilter && (
        <button
          onClick={clearAll}
          className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors border border-gray-200"
          title="Reset filter"
        >
          <X className="w-3.5 h-3.5" />
          Reset
        </button>
      )}
    </div>
  );
}

/**
 * Helper: apply time preset ke array of items
 * dateField: fungsi untuk mengambil Date dari item
 * timePreset: preset yang dipilih
 * sort: asc atau desc (untuk "terbaru"/"terlama")
 */
export function applyTimeFilter<T>(
  items: T[],
  getDate: (item: T) => Date | string,
  timePreset: TimePreset,
  dateFrom: string,
  dateTo: string
): T[] {
  if (!timePreset) return items;

  const now = new Date();

  if (timePreset === "terbaru") {
    return [...items].sort((a, b) => new Date(getDate(b)).getTime() - new Date(getDate(a)).getTime());
  }

  if (timePreset === "terlama") {
    return [...items].sort((a, b) => new Date(getDate(a)).getTime() - new Date(getDate(b)).getTime());
  }

  let cutoff: Date | null = null;
  if (timePreset === "seminggu") cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (timePreset === "sebulan") cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (timePreset === "setahun") cutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

  if (cutoff) {
    return items.filter((item) => new Date(getDate(item)) >= cutoff!);
  }

  if (timePreset === "custom" && dateFrom && dateTo) {
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    to.setHours(23, 59, 59, 999);
    return items.filter((item) => {
      const d = new Date(getDate(item));
      return d >= from && d <= to;
    });
  }

  return items;
}
