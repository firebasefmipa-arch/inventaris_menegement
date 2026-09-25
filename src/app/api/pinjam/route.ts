import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, transactionItems, items, users } from "@/db/schema";
import { eq, inArray, and, gte, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { generateBorrowingPDF } from "@/lib/pdf-generator";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { uploadPath } from "@/lib/upload-dir";
import { jsonBody } from "@/lib/json-body";
import { unitCode } from "@/lib/units";
import { bacaKeranjang, pecahPerUnit, type Keranjang } from "@/lib/pecah-unit";

type CartItem = { itemId: number; quantity: number; notes?: string };

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await jsonBody(request);
    if (!body) return NextResponse.json({ error: "Body permintaan tidak valid" }, { status: 400 });
    const borrowerInput = body.borrower || {};

    // ── Aturan data diri (double role) ──
    // Admin/super_admin (dari dashboard admin) BOLEH mengisi data diri custom
    // (mencatat peminjaman atas nama orang lain). User biasa — termasuk admin
    // yang sedang di "Mode User" — WAJIB memakai data dirinya sendiri, body
    // diabaikan agar tidak bisa dipalsukan.
    const role = (session.user as any).role;
    const isAdmin = role === "admin" || role === "super_admin";
    const src = isAdmin ? borrowerInput : {};

    const name       = (src.name       || session.user.name             || "").trim();
    const email      = (src.email      || session.user.email            || "").trim();
    const phone      = (src.phone      || (session.user as any).phone   || "").trim();
    const nim        = (src.nim        || (session.user as any).nim     || "").trim();
    const department = (src.department || (session.user as any).department || "").trim();
    const userId     = session.user.id!;
    const { expectedReturnDate, notes, purpose, location, cart } = body;

    // ── Validasi field wajib ──
    if (!expectedReturnDate || !name || !phone)
      return NextResponse.json({ error: "Nama, nomor HP, dan tanggal kembali wajib diisi." }, { status: 400 });
    if (!purpose?.trim())
      return NextResponse.json({ error: "Keperluan peminjaman wajib diisi." }, { status: 400 });
    if (!location?.trim())
      return NextResponse.json({ error: "Tempat/lokasi peminjaman wajib diisi." }, { status: 400 });
    if (!nim)
      return NextResponse.json({ error: "NIM_REQUIRED" }, { status: 422 });
    if (!cart || !Array.isArray(cart) || cart.length === 0)
      return NextResponse.json({ error: "Pilih minimal satu barang untuk dipinjam." }, { status: 400 });

    // ── Cek TTD elektronik ──
    const [userRow] = await db
      .select({ signatureUrl: users.signatureUrl })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userRow?.signatureUrl)
      return NextResponse.json({ error: "SIGNATURE_REQUIRED" }, { status: 422 });

    const returnDate = new Date(expectedReturnDate);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (isNaN(returnDate.getTime()) || returnDate < today)
      return NextResponse.json({ error: "Tanggal kembali tidak valid." }, { status: 400 });

    // ── Validasi stok ──
    const cartItems: Keranjang[] = bacaKeranjang(cart);

    const dbItems = await db.select().from(items).where(inArray(items.id, cartItems.map((c) => c.itemId)));
    const itemMap = new Map(dbItems.map((i) => [i.id, i]));

    for (const c of cartItems) {
      const dbItem = itemMap.get(c.itemId);
      if (!dbItem) return NextResponse.json({ error: `Barang ID ${c.itemId} tidak ditemukan.` }, { status: 404 });
      if (!dbItem.canBorrow)
        return NextResponse.json({ error: `Barang "${dbItem.name}" tidak tersedia untuk dipinjam.` }, { status: 400 });
      if (dbItem.availableQuantity < c.quantity)
        return NextResponse.json({ error: `Stok "${dbItem.name}" tidak mencukupi. Tersisa ${dbItem.availableQuantity} unit.` }, { status: 400 });
    }

    // ── PECAH PER UNIT ──
    // Satu pengajuan berisi barang dari beberapa unit dipecah jadi beberapa
    // transaksi, supaya tiap unit bisa menyetujui bagiannya sendiri. Semua
    // pecahan diberi grupId yang sama, dan bagi peminjam tetap terlihat sebagai
    // satu pengajuan (bingkainya di tampilan, bukan di data).
    //
    // Barang tanpa unit dikelompokkan sendiri di bawah kunci "" — hanya
    // superadmin yang bisa menyetujuinya.
    const grupId = crypto.randomUUID();
    const grup = pecahPerUnit(cartItems, new Map(dbItems.map((i) => [i.id, i.unit])));

    // ── Buat transaksi per unit ──
    const dibuat: { id: number; unit: string; cart: CartItem[] }[] = [];
    const bersihkan = async () => {
      const ids = dibuat.map((d) => d.id);
      if (ids.length === 0) return;
      await db.delete(transactionItems).where(inArray(transactionItems.transactionId, ids));
      await db.delete(transactions).where(inArray(transactions.id, ids));
    };

    for (const [unit, isiGrup] of grup) {
      const [{ id: txId }] = await db
        .insert(transactions)
        .values({
          userId,
          itemId: null,
          grupId,
          unit: unit || null,
          borrowerName: name,
          borrowerEmail: email || null,
          borrowerPhone: phone || null,
          borrowerDepartment: department || null,
          borrowerNim: nim || null,
          quantity: isiGrup.reduce((s, c) => s + c.quantity, 0),
          expectedReturnDate: returnDate,
          purpose: purpose.trim(),
          notes: notes?.trim() || null,
          borrowerLocation: location?.trim() || null,
          status: "pending_approval",
        })
        .$returningId();

      await db.insert(transactionItems).values(
        isiGrup.map((c) => ({
          transactionId: txId,
          itemId: c.itemId,
          quantity: c.quantity,
          notes: c.notes || null,
          itemName: itemMap.get(c.itemId)?.name ?? null,
          itemCode: itemMap.get(c.itemId)?.itemCode ?? null,
          itemInventoryNumber: itemMap.get(c.itemId)?.inventoryNumber ?? null,
        }))
      );

      // ── Kurangi stok — ATOMIK. Syarat "stok cukup" ada di WHERE, jadi dua
      // permintaan bersamaan tak bisa sama-sama lolos: yang kalah dapat 0 baris
      // terpengaruh dan SELURUH pecahan pengajuan ini dibatalkan.
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
          // Kalah balapan → batalkan SEMUA pecahan yang sudah dibuat, bukan
          // cuma yang ini: kalau sebagian dibiarkan, pengajuan jadi separuh
          // jalan tanpa peminjam tahu.
          await bersihkan();
          return NextResponse.json(
            {
              error: `Stok "${itemMap.get(c.itemId)?.name}" tidak lagi mencukupi — mungkin baru dipinjam orang lain. Coba lagi.`,
            },
            { status: 409 }
          );
        }
      }

      dibuat.push({ id: txId, unit, cart: isiGrup });
    }

    // ── PDF per pecahan, masing-masing dengan TTD peminjam ──
    // TTD yang sama dipakai ke semua pecahan: peminjam menandatangani SATU
    // pengajuan, bukan satu per unit.
    for (const bagian of dibuat) {
      try {
        const [tx] = await db.select().from(transactions).where(eq(transactions.id, bagian.id));
        const pdfBuffer = await generateBorrowingPDF({
          borrowerName: name,
          borrowerId: nim,
          department,
          phone,
          purpose: purpose.trim(),
          notes: notes?.trim() || "",
          borrowDate: tx.borrowDate,
          returnDate,
          signatureUrl: userRow.signatureUrl,
          items: bagian.cart.map((c) => ({
            name: itemMap.get(c.itemId)?.name || "Barang",
            quantity: c.quantity,
            inventoryNumber: itemMap.get(c.itemId)?.inventoryNumber ?? null,
            itemCode: itemMap.get(c.itemId)?.itemCode ?? null,
            notes: c.notes || "",
          })),
        });

        const borrowerSafe = name.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_").slice(0, 40);
        const d = tx.borrowDate;
        const dateStr = `${String(d.getDate()).padStart(2,"0")}${String(d.getMonth()+1).padStart(2,"0")}${d.getFullYear()}`;
        const kodeUnit = bagian.unit ? unitCode(bagian.unit) : "LAIN";
        const filename = `PB_${borrowerSafe}_${dateStr}_${bagian.id}_${kodeUnit}.pdf`;

        const uploadDir = uploadPath("pending");
        await mkdir(uploadDir, { recursive: true });
        await writeFile(path.join(uploadDir, filename), pdfBuffer);

        await db
          .update(transactions)
          .set({ signedDocumentUrl: `/uploads/pending/${filename}` })
          .where(eq(transactions.id, bagian.id));
      } catch (pdfErr) {
        console.error("PDF generate error:", pdfErr);
      }
    }

    const ringkas = dibuat.map((b) => ({
      code: `PB-${String(b.id).padStart(4, "0")}`,
      transactionId: b.id,
      unit: b.unit || null,
      totalItems: b.cart.length,
      totalQuantity: b.cart.reduce((s, c) => s + c.quantity, 0),
      items: b.cart.map((c) => ({
        name: itemMap.get(c.itemId)?.name || "",
        inventoryNumber: itemMap.get(c.itemId)?.inventoryNumber || null,
        quantity: c.quantity,
        notes: c.notes,
      })),
    }));

    return NextResponse.json({
      grupId,
      pecahan: ringkas,
      // Bentuk lama dipertahankan supaya tampilan lama tak langsung rusak saat
      // penggabungan di layar belum selesai dipasang.
      code: ringkas[0]?.code ?? null,
      transactionId: ringkas[0]?.transactionId ?? null,
      borrowerName: name,
      borrowerNim: nim,
      itemNames: ringkas.flatMap((p) => p.items.map((i) => `${i.name} (×${i.quantity})`)).join(", "),
      totalItems: cartItems.length,
      totalQuantity: cartItems.reduce((s, c) => s + c.quantity, 0),
      borrowDate: new Date(),
      expectedReturnDate: returnDate,
      pdfUrl: null,
      items: ringkas.flatMap((p) => p.items),
    }, { status: 201 });

  } catch (error) {
    console.error("POST /api/pinjam error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan. Silakan coba lagi." }, { status: 500 });
  }
}
