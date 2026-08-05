"use client";

import { useState } from "react";
import { deleteUser, deleteUserTransactions } from "./actions";
import { Trash2, ClipboardX } from "lucide-react";
import clsx from "clsx";

export function DeleteUserButtons({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const [loadingUser, setLoadingUser] = useState(false);
  const [loadingTx, setLoadingTx] = useState(false);

  const handleDeleteUser = async () => {
    if (
      !confirm(
        `Hapus akun "${userName}"?\n\nAkun akan dihapus permanen, tapi history transaksinya TETAP tersimpan (user_id akan dikosongkan).`
      )
    ) return;

    setLoadingUser(true);
    try {
      const res = await deleteUser(userId);
      alert(res.message);
    } catch {
      alert("Terjadi kesalahan sistem.");
    } finally {
      setLoadingUser(false);
    }
  };

  const handleDeleteTransactions = async () => {
    if (
      !confirm(
        `Hapus SEMUA history transaksi milik "${userName}"?\n\nTindakan ini tidak dapat dibatalkan.`
      )
    ) return;

    setLoadingTx(true);
    try {
      const res = await deleteUserTransactions(userId);
      alert(res.message);
    } catch {
      alert("Terjadi kesalahan sistem.");
    } finally {
      setLoadingTx(false);
    }
  };

  return (
    <>
      {/* Hapus history transaksi */}
      <button
        onClick={handleDeleteTransactions}
        disabled={loadingTx}
        title="Hapus semua history transaksi user ini"
        className={clsx(
          "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors",
          "bg-orange-100 text-orange-700 hover:bg-orange-200",
          loadingTx && "opacity-50 cursor-not-allowed"
        )}
      >
        <ClipboardX className="w-3.5 h-3.5" />
        Hapus History
      </button>

      {/* Hapus akun */}
      <button
        onClick={handleDeleteUser}
        disabled={loadingUser}
        title="Hapus akun user ini (history tetap)"
        className={clsx(
          "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors",
          "bg-red-100 text-red-700 hover:bg-red-200",
          loadingUser && "opacity-50 cursor-not-allowed"
        )}
      >
        <Trash2 className="w-3.5 h-3.5" />
        Hapus Akun
      </button>
    </>
  );
}
