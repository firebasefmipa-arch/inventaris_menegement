import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, transactionItems, items } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { jsonBody } from "@/lib/json-body";
import { periksaAksesUnit } from "@/lib/akses-unit";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth guard — hanya admin/super_admin
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user || (role !== "admin" && role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const txId = parseInt(id);
    if (isNaN(txId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const body = await jsonBody(request);
    if (!body) return NextResponse.json({ error: "Body permintaan tidak valid" }, { status: 400 });
    const { status, notes } = body;

    const [transaction] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, txId));

    if (!transaction) {
      return NextResponse.json(
        { error: "Transaksi tidak ditemukan" },
        { status: 404 }
      );
    }

    // ── Batas unit ──
    // Sejak pengajuan dipecah per unit, tiap pecahan punya adminnya sendiri.
    const tolak = await periksaAksesUnit(session, transaction.unit);
    if (tolak) {
      return NextResponse.json({ error: tolak.pesan }, { status: tolak.status });
    }

    // ── Validasi transisi status ──
    // Tanpa ini, `returned` bisa dijalankan pada transaksi yang stoknya BELUM
    // pernah dipotong (mis. rejected) sehingga stok bertambah dari udara.
    if (status === "returned" && transaction.status !== "active") {
      return NextResponse.json(
        { error: "Hanya transaksi berstatus aktif yang bisa dikembalikan." },
        { status: 400 }
      );
    }

    if (status === "returned" && transaction.status !== "returned") {
      // Kembalikan stok dari transaction_items (multi-item)
      const txItems = await db
        .select()
        .from(transactionItems)
        .where(eq(transactionItems.transactionId, txId));

      // Penambahan stok ATOMIK: `available_quantity = available_quantity + n`
      // dihitung oleh database, bukan dibaca dulu ke aplikasi. Dulu di sini
      // baca-lalu-tulis — dua pengembalian bersamaan bisa saling menimpa.
      // `status` disamakan lewat ekspresi, bukan angka dari aplikasi.
      if (txItems.length > 0) {
        for (const txItem of txItems) {
          await db
            .update(items)
            .set({
              availableQuantity: sql`${items.availableQuantity} + ${txItem.quantity}`,
              status: sql`CASE WHEN ${items.availableQuantity} + ${txItem.quantity} > 0 THEN 'available' ELSE 'borrowed' END`,
              updatedAt: new Date(),
            })
            .where(eq(items.id, txItem.itemId));
        }
      } else if (transaction.itemId) {
        // Legacy single-item fallback
        await db
          .update(items)
          .set({
            availableQuantity: sql`${items.availableQuantity} + ${transaction.quantity}`,
            status: "available" as const,
            updatedAt: new Date(),
          })
          .where(eq(items.id, transaction.itemId));
      }

      await db
        .update(transactions)
        .set({
          status: "returned" as const,
          actualReturnDate: new Date(),
          ...(notes !== undefined && { notes }),
        })
        .where(eq(transactions.id, txId));
    } else if (status !== undefined || notes !== undefined) {
      // Hanya update kalau ada yang berubah — hindari empty set.
      // `status` bebas TIDAK diizinkan: perubahan status harus lewat jalur yang
      // benar (approve/reject, atau `returned` di atas yang memvalidasi status
      // asal). Ini mencegah "approve palsu" yang memotong/menaikkan stok salah.
      if (status !== undefined) {
        return NextResponse.json(
          { error: "Perubahan status harus lewat aksi yang sesuai." },
          { status: 400 }
        );
      }
      await db
        .update(transactions)
        .set({ notes })
        .where(eq(transactions.id, txId));
    }

    const [updated] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, txId));

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/transactions/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update transaction" },
      { status: 500 }
    );
  }
}
