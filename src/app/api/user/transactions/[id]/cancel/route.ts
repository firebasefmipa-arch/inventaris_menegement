import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, transactionItems, items } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const txId = parseInt(id, 10);
    if (isNaN(txId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    // Ambil transaksi
    const [tx] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, txId))
      .limit(1);

    if (!tx) {
      return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });
    }

    // Hanya pemilik transaksi yang boleh membatalkan
    if (tx.userId !== session.user.id) {
      return NextResponse.json({ error: "Tidak memiliki akses" }, { status: 403 });
    }

    // Hanya bisa dibatalkan jika masih pending_signature atau pending_approval
    if (tx.status !== "pending_signature" && tx.status !== "pending_approval") {
      return NextResponse.json(
        { error: "Peminjaman hanya bisa dibatalkan jika belum diproses (status menunggu dokumen atau menunggu persetujuan)" },
        { status: 400 }
      );
    }

    // Kembalikan stok — ambil dari transaction_items
    const txItems = await db
      .select()
      .from(transactionItems)
      .where(eq(transactionItems.transactionId, txId));

    if (txItems.length > 0) {
      for (const txItem of txItems) {
        const [item] = await db
          .select()
          .from(items)
          .where(eq(items.id, txItem.itemId))
          .limit(1);

        if (item) {
          const newAvailable = item.availableQuantity + txItem.quantity;
          await db
            .update(items)
            .set({
              availableQuantity: newAvailable,
              status: "available",
              updatedAt: new Date(),
            })
            .where(eq(items.id, item.id));
        }
      }
    } else if (tx.itemId) {
      // Legacy single-item fallback
      const [item] = await db
        .select()
        .from(items)
        .where(eq(items.id, tx.itemId))
        .limit(1);

      if (item) {
        const newAvailable = item.availableQuantity + tx.quantity;
        await db
          .update(items)
          .set({
            availableQuantity: newAvailable,
            status: "available",
            updatedAt: new Date(),
          })
          .where(eq(items.id, item.id));
      }
    }

    // Jika belum upload dokumen (pending_signature + belum ada file) → hapus transaksi
    // Jika sudah upload tapi menunggu approval → set rejected agar history tetap ada
    if (tx.status === "pending_signature" && !tx.signedDocumentUrl) {
      // Hapus transaction_items dulu (CASCADE seharusnya handle ini, tapi eksplisit lebih aman)
      await db.delete(transactionItems).where(eq(transactionItems.transactionId, txId));
      await db.delete(transactions).where(eq(transactions.id, txId));

      return NextResponse.json({ success: true, message: "Peminjaman berhasil dibatalkan dan dihapus" });
    }

    // Sudah upload dokumen → simpan sebagai rejected agar history tetap ada
    await db
      .update(transactions)
      .set({
        status: "rejected",
        rejectionReason: "Dibatalkan oleh peminjam",
      })
      .where(eq(transactions.id, txId));

    return NextResponse.json({ success: true, message: "Peminjaman berhasil dibatalkan" });
  } catch (error) {
    console.error("POST /api/user/transactions/[id]/cancel error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan" }, { status: 500 });
  }
}
