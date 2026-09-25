import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, transactionItems, items } from "@/db/schema";
import { eq, desc, and, gte, inArray, sql } from "drizzle-orm";
import { namaSql, namaSqlLegacy } from "@/lib/item-snapshot";
import { auth } from "@/auth";
import { jsonBody } from "@/lib/json-body";
import { sqlTerlambat } from "@/lib/tanggal";
import { periksaAksesUnit, batasUnit } from "@/lib/akses-unit";
import { bacaKeranjang, pecahPerUnit, type Keranjang } from "@/lib/pecah-unit";

export async function GET(request: NextRequest) {
  try {
    // Panel admin saja — endpoint ini mengembalikan data pribadi peminjam
    // (nama, email, no HP, prodi). Sebelumnya terbuka untuk umum.
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user || (role !== "admin" && role !== "super_admin"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "";

    const conditions = [];
    if (status === "overdue") {
      // SATU definisi: lihat sqlTerlambat() di src/lib/tanggal.ts.
      conditions.push(sqlTerlambat());
    } else if (status) {
      conditions.push(eq(transactions.status, status as any));
    }

    // Admin hanya melihat pecahan dari unit yang ditugaskannya; superadmin
    // melihat semua. Barang tanpa unit hanya muncul untuk superadmin.
    const batas = await batasUnit(session);
    if (batas !== null) {
      conditions.push(batas.length > 0 ? inArray(transactions.unit, batas) : sql`1 = 0`);
    }

    const data = await db
      .select({
        id: transactions.id,
        itemId: transactions.itemId,
        quantity: transactions.quantity,
        status: transactions.status,
        borrowDate: transactions.borrowDate,
        expectedReturnDate: transactions.expectedReturnDate,
        actualReturnDate: transactions.actualReturnDate,
        notes: transactions.notes,
        createdAt: transactions.createdAt,
        itemName: namaSqlLegacy(transactions.itemId),
        itemCategory: items.category,
        borrowerName: transactions.borrowerName,
        borrowerDepartment: transactions.borrowerDepartment,
        borrowerEmail: transactions.borrowerEmail,
        borrowerPhone: transactions.borrowerPhone,
      })
      .from(transactions)
      .leftJoin(items, eq(transactions.itemId, items.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(transactions.createdAt));

    // Nama barang lengkap dari pivot transaction_items (transaksi multi-barang
    // punya item_id NULL di tabel transactions)
    if (data.length > 0) {
      const rows = await db
        .select({
          transactionId: transactionItems.transactionId,
          itemName: namaSql(items.name, transactionItems.itemName),
        })
        .from(transactionItems)
        .leftJoin(items, eq(transactionItems.itemId, items.id))
        .where(inArray(transactionItems.transactionId, data.map((t) => t.id)));

      const namesByTx = new Map<number, string[]>();
      for (const r of rows) {
        const list = namesByTx.get(r.transactionId) ?? [];
        list.push(r.itemName ?? "Barang");
        namesByTx.set(r.transactionId, list);
      }
      return NextResponse.json(
        data.map((t) => ({ ...t, itemNames: namesByTx.get(t.id) ?? [] }))
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/transactions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Endpoint ini khusus panel admin (pencatatan peminjaman atas nama orang lain).
    // User biasa wajib lewat /api/pinjam yang memaksa data diri sendiri.
    const role = (session.user as any).role;
    if (role !== "admin" && role !== "super_admin") {
      return NextResponse.json(
        { error: "Hanya admin yang boleh mencatat peminjaman atas nama orang lain" },
        { status: 403 }
      );
    }

    const body = await jsonBody(request);
    if (!body) return NextResponse.json({ error: "Body permintaan tidak valid" }, { status: 400 });
    const {
      cart,
      borrowerName,
      borrowerDepartment,
      borrowerEmail,
      borrowerPhone,
      borrowerNim,
      borrowerLocation,
      expectedReturnDate,
      purpose,
      notes,
    } = body;

    if (!borrowerName || !borrowerDepartment || !expectedReturnDate) {
      return NextResponse.json(
        { error: "Nama peminjam, divisi/prodi, dan tanggal kembali wajib diisi" },
        { status: 400 }
      );
    }

    if (!purpose?.trim()) {
      return NextResponse.json(
        { error: "Keperluan peminjaman wajib diisi" },
        { status: 400 }
      );
    }

    // Validasi cart
    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return NextResponse.json(
        { error: "Pilih minimal satu barang" },
        { status: 400 }
      );
    }

    const cartItems: Keranjang[] = bacaKeranjang(cart);

    const itemIds = cartItems.map((c) => c.itemId);

    // Ambil semua item sekaligus
    const dbItems = await db
      .select()
      .from(items)
      .where(inArray(items.id, itemIds));

    const itemMap = new Map(dbItems.map((i) => [i.id, i]));

    // Validasi stok semua item — sekaligus hak unit admin yang mencatat.
    for (const cartItem of cartItems) {
      const dbItem = itemMap.get(cartItem.itemId);
      if (!dbItem) {
        return NextResponse.json(
          { error: `Barang ID ${cartItem.itemId} tidak ditemukan` },
          { status: 404 }
        );
      }
      if (dbItem.availableQuantity < cartItem.quantity) {
        return NextResponse.json(
          { error: `Stok "${dbItem.name}" tidak mencukupi. Tersisa ${dbItem.availableQuantity} unit.` },
          { status: 400 }
        );
      }
      if (!dbItem.canBorrow) {
        return NextResponse.json(
          { error: `Barang "${dbItem.name}" tidak tersedia untuk dipinjam.` },
          { status: 400 }
        );
      }
      // Admin hanya boleh mencatat barang dari unit yang ditugaskan padanya.
      const tolak = await periksaAksesUnit(session, dbItem.unit);
      if (tolak) {
        return NextResponse.json(
          { error: `${tolak.pesan} (barang "${dbItem.name}")` },
          { status: tolak.status }
        );
      }
    }

    const returnDate = new Date(expectedReturnDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (isNaN(returnDate.getTime()) || returnDate < today) {
      return NextResponse.json(
        { error: "Tanggal kembali tidak valid" },
        { status: 400 }
      );
    }

    // ── Pecah per unit ──
    // Sama seperti pengajuan dari user: satu pencatatan yang memuat barang dari
    // beberapa unit jadi beberapa baris, supaya penyaringan dan pengelolaan per
    // unit tetap konsisten. Di sini statusnya langsung aktif (admin mencatat
    // langsung), jadi tidak ada persetujuan yang perlu dipecah.
    const grupId = crypto.randomUUID();
    const grup = pecahPerUnit(cartItems, new Map(dbItems.map((i) => [i.id, i.unit])));

    const dibuat: number[] = [];
    for (const [unit, isiGrup] of grup) {
      const [{ id: txId }] = await db
        .insert(transactions)
        .values({
          userId: null, // transaksi dari admin, bukan user terdaftar
          itemId: null, // multi-item, pakai transaction_items
          grupId,
          unit: unit || null,
          borrowerName,
          borrowerDepartment: borrowerDepartment || null,
          borrowerEmail: borrowerEmail || null,
          borrowerPhone: borrowerPhone || null,
          borrowerNim: borrowerNim || null,
          borrowerLocation: borrowerLocation || null,
          quantity: isiGrup.reduce((sum, c) => sum + c.quantity, 0),
          status: "active", // admin langsung aktif, tanpa perlu TTD
          expectedReturnDate: returnDate,
          purpose: purpose.trim(),
          notes: notes?.trim() || null,
        })
        .$returningId();

      await db.insert(transactionItems).values(
        isiGrup.map((c) => ({
          transactionId: txId,
          itemId: c.itemId,
          quantity: c.quantity,
          notes: c.notes || null,
          // Snapshot identitas barang saat transaksi dibuat — dokumen lama tidak
          // ikut berubah kalau data master barang diubah/dihapus.
          itemName: itemMap.get(c.itemId)?.name ?? null,
          itemCode: itemMap.get(c.itemId)?.itemCode ?? null,
          itemInventoryNumber: itemMap.get(c.itemId)?.inventoryNumber ?? null,
        }))
      );

      // Kurangi stok — ATOMIK. Syarat "stok cukup" ada di WHERE, jadi dua
      // pencatatan bersamaan tak bisa sama-sama lolos dan membuat stok minus.
      for (const c of isiGrup) {
        const hasil = await db
          .update(items)
          .set({
            availableQuantity: sql`${items.availableQuantity} - ${c.quantity}`,
            status: sql`CASE WHEN ${items.availableQuantity} - ${c.quantity} <= 0 THEN 'borrowed' ELSE 'available' END`,
            updatedAt: new Date(),
          })
          .where(and(eq(items.id, c.itemId), gte(items.availableQuantity, c.quantity)));

        const data = (Array.isArray(hasil) ? hasil[0] : hasil) as unknown as { affectedRows?: number };
        if (Number(data?.affectedRows ?? 0) === 0) {
          // Kalah balapan → batalkan semua pecahan yang telanjur dibuat.
          const ids = [...dibuat, txId];
          await db.delete(transactionItems).where(inArray(transactionItems.transactionId, ids));
          await db.delete(transactions).where(inArray(transactions.id, ids));
          return NextResponse.json(
            { error: `Stok "${itemMap.get(c.itemId)?.name}" tidak lagi mencukupi — mungkin baru dipinjam orang lain. Coba lagi.` },
            { status: 409 }
          );
        }
      }

      dibuat.push(txId);
    }

    return NextResponse.json({ id: dibuat[0], grupId, pecahan: dibuat }, { status: 201 });
  } catch (error) {
    console.error("POST /api/transactions error:", error);
    return NextResponse.json(
      { error: "Failed to create transaction" },
      { status: 500 }
    );
  }
}
