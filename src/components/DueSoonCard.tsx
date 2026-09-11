"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

export type DueSoonRow = {
  id: number;
  itemNames: string[];
  quantity: number;
  expectedReturnDate: string | Date;
  borrowerName?: string | null;
  borrowerPhone?: string | null;
};

/**
 * Kartu "Segera Dikembalikan" — dipakai dashboard admin & dashboard user.
 * Menampilkan transaksi aktif yang tenggatnya <= 24 jam ATAU sudah terlambat,
 * dengan nama barang lengkap (tanpa diringkas "+N lainnya").
 */
export function DueSoonCard({
  rows,
  variant = "user",
  limit = 10,
}: {
  rows: DueSoonRow[];
  variant?: "admin" | "user";
  limit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, limit);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-6">
      <div className="flex items-center gap-2 mb-5">
        <Bell className="w-5 h-5 text-amber-500" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Segera Dikembalikan</h3>
        {rows.length > 0 && (
          <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
            {rows.length}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-8">
          <CheckCircle2 className="w-10 h-10 text-emerald-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Tidak ada tenggat dalam 24 jam</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {visible.map((tx) => {
              const deadline = new Date(tx.expectedReturnDate);
              const msLeft = deadline.getTime() - Date.now();
              const overdue = msLeft < 0;
              const hoursLeft = Math.max(0, Math.round(msLeft / 3600000));
              const urgent = overdue || hoursLeft <= 3;
              const daysLate = overdue ? Math.ceil(-msLeft / 86400000) : 0;

              return (
                <div
                  key={tx.id}
                  className={`rounded-xl p-3 border ${
                    urgent
                      ? "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800"
                      : "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {variant === "admin" && tx.borrowerName && (
                        <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">
                          {tx.borrowerName}
                        </p>
                      )}
                      {/* Semua nama barang ditampilkan, tidak diringkas */}
                      <ul className="space-y-0.5 mt-0.5">
                        {tx.itemNames.map((n, i) => (
                          <li key={i} className="text-xs text-gray-600 dark:text-slate-300 break-words">
                            • {n}
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                        {tx.quantity} unit
                      </p>
                      {variant === "admin" && tx.borrowerPhone && (
                        <p className="text-xs text-gray-400 mt-0.5">{tx.borrowerPhone}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                          urgent ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {overdue
                          ? `Terlambat ${daysLate} hari`
                          : hoursLeft === 0
                            ? "< 1 jam"
                            : `${hoursLeft} jam`}
                      </span>
                      <p className="text-[10px] text-gray-400 mt-1">
                        {format(deadline, "HH:mm, dd MMM", { locale: idLocale })}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {rows.length > limit && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="w-full mt-3 py-2 rounded-xl text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
            >
              {expanded ? "Sembunyikan" : `Tampilkan semua (${rows.length})`}
            </button>
          )}

          <Link
            href={variant === "admin" ? "/admin/transactions?status=active" : "/dashboard/riwayat"}
            className="block text-center text-xs text-indigo-600 hover:text-indigo-700 font-medium pt-3"
          >
            {variant === "admin" ? "Lihat semua aktif →" : "Lihat riwayat →"}
          </Link>
        </>
      )}
    </div>
  );
}
