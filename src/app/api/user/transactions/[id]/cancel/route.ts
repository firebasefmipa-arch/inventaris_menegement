import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, transactionItems, items } from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { deleteUploadByUrl } from "@/lib/delete-upload";

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

    // ── Satu kelompok = satu pengajuan dari sisi user ──
    // Pengajuan user dipecah per unit di belakang layar, tapi di layar user
    // terlihat satu. Karena itu membatalkan = membatalkan SELURUH pecahan,
    // bukan hanya satu potong yang membuat sisanya menggantung.
    const pecahan = tx.grupId
      ? await db
          .select()
          .from(transactions)
          .where(and(eq(transactions.grupId, tx.grupId), eq(transactions.userId, session.user.id)))
      : [tx];

    const semuaId = pecahan.map((p) => p.id);

    // Kalau ada satu saja yang sudah diproses, batalkan seluruh permintaan —
    // sebagian dibatalkan sebagian jalan justru bikin bingung.
    const belumProses = pecahan.filter(
      (p) => p.status === "pending_signature" || p.status === "pending_approval"
    );
    if (belumProses.length !== pecahan.length) {
      return NextResponse.json(
        { error: "Pengajuan ini sudah diproses sebagian, jadi tidak bisa dibatalkan lagi." },
        { status: 400 }
      );
    }

    // ── Kunci status DULU, baru sentuh stok ──
    // Urutannya yang penting. Dulu stok dikembalikan lebih dulu dan baris baru
    // ditandai di akhir; sudah dicoba: dua pembatalan bersamaan sama-sama
    // menambahkan stok sehingga jumlah tersedia (18) melebihi fisik (10).
    // Sekarang hanya satu permintaan yang boleh lanjut; yang kalah dapat 409.
    const kunci = await db
      .update(transactions)
      .set({ status: "rejected", rejectionReason: "Dibatalkan oleh peminjam" })
      .where(
        and(
          inArray(transactions.id, semuaId),
          inArray(transactions.status, ["pending_signature", "pending_approval"])
        )
      );
    const terkunci = (Array.isArray(kunci) ? kunci[0] : kunci) as unknown as { affectedRows?: number };
    if (Number(terkunci?.affectedRows ?? 0) !== semuaId.length) {
      return NextResponse.json(
        { error: "Pengajuan ini sudah dibatalkan/diproses oleh permintaan lain." },
        { status: 409 }
      );
    }

    // Kembalikan stok tiap pecahan — ATOMIK: penambahan dihitung database.
    const baris = await db
      .select()
      .from(transactionItems)
      .where(inArray(transactionItems.transactionId, semuaId));

    for (const b of baris) {
      await db
        .update(items)
        .set({
          availableQuantity: sql`${items.availableQuantity} + ${b.quantity}`,
          status: sql`CASE WHEN ${items.availableQuantity} + ${b.quantity} > 0 THEN 'available' ELSE 'borrowed' END`,
          updatedAt: new Date(),
        })
        .where(eq(items.id, b.itemId));
    }
    // Transaksi lama yang tautannya di kolom, BUKAN di pivot. Hanya dikerjakan
    // kalau pecahan itu memang tak punya baris pivot — supaya stok tidak
    // dikembalikan dua kali.
    const punyaPivot = new Set(baris.map((b) => b.transactionId));
    for (const p of pecahan) {
      if (!p.itemId || punyaPivot.has(p.id)) continue;
      await db
        .update(items)
        .set({
          availableQuantity: sql`${items.availableQuantity} + ${p.quantity}`,
          status: sql`CASE WHEN ${items.availableQuantity} + ${p.quantity} > 0 THEN 'available' ELSE 'borrowed' END`,
          updatedAt: new Date(),
        })
        .where(eq(items.id, p.itemId));
    }

    // Jika belum upload dokumen (pending_signature + belum ada file) → hapus transaksi
    // Jika sudah upload tapi menunggu approval → simpan rejected agar history tetap ada
    const belumAdaDokumen = pecahan.every(
      (p) => p.status === "pending_signature" && !p.signedDocumentUrl
    );

    if (belumAdaDokumen) {
      await db.delete(transactionItems).where(inArray(transactionItems.transactionId, semuaId));
      await db.delete(transactions).where(inArray(transactions.id, semuaId));
      return NextResponse.json({ success: true, message: "Peminjaman berhasil dibatalkan dan dihapus" });
    }

    // Dokumen dihapus (dokumen batal tak disimpan); status sudah "rejected"
    // dari penguncian di atas, di sini hanya membuang berkasnya.
    for (const p of pecahan) await deleteUploadByUrl(p.signedDocumentUrl);
    await db
      .update(transactions)
      .set({ signedDocumentUrl: null })
      .where(inArray(transactions.id, semuaId));

    return NextResponse.json({ success: true, message: "Peminjaman berhasil dibatalkan" });
  } catch (error) {
    console.error("POST /api/user/transactions/[id]/cancel error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan" }, { status: 500 });
  }
}
