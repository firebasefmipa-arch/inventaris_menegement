"use client";

import { useState } from "react";
import { deleteUser } from "./actions";
import { Trash2 } from "lucide-react";
import clsx from "clsx";

export function DeleteUserButtons({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const [loading, setLoading] = useState(false);

  const handleDeleteUser = async () => {
    if (
      !confirm(
        `Hapus akun "${userName}"?\n\nAkun akan dihapus permanen, tapi history transaksinya TETAP tersimpan.`
      )
    ) return;

    setLoading(true);
    try {
      const res = await deleteUser(userId);
      alert(res.message);
    } catch {
      alert("Terjadi kesalahan sistem.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleDeleteUser}
      disabled={loading}
      title="Hapus akun user ini (history tetap)"
      className={clsx(
        "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors",
        "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 dark:border dark:border-red-800/50",
        loading && "opacity-50 cursor-not-allowed"
      )}
    >
      <Trash2 className="w-3.5 h-3.5" />
      {loading ? "Menghapus..." : "Hapus Akun"}
    </button>
  );
}
