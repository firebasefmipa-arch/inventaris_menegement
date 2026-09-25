import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { handovers, handoverItems, items, users } from "@/db/schema";
import { eq, desc, inArray, and, gte, sql } from "drizzle-orm";
import { namaSql } from "@/lib/item-snapshot";
import { auth } from "@/auth";
import { uploadPath } from "@/lib/upload-dir";
import { jsonBody } from "@/lib/json-body";
import { bacaKeranjang, pecahPerUnit, type Keranjang } from "@/lib/pecah-unit";
import { unitCode } from "@/lib/units";

// GET /api/handovers — daftar serah terima milik user yang login
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const conditions = [eq(handovers.userId, session.user.id)];
    if (status) conditions.push(eq(handovers.status, status as any));

    const hvList = await db
      .select()
      .from(handovers)
      .where(and(...conditions))
      .orderBy(desc(handovers.createdAt));

    if (hvList.length === 0) return NextResponse.json([]);

    const hvIds = hvList.map((h) => h.id);

    const hvItemRows = await db
      .select({
        handoverId: handoverItems.handoverId,
        itemId: handoverItems.itemId,
        quantity: handoverItems.quantity,
        notes: handoverItems.notes,
        itemName: namaSql(items.name, handoverItems.itemName),
        itemCategory: items.category,
        itemLocation: items.location,
        itemInventoryNumber: items.inventoryNumber,
        itemAssetNumber: items.assetNumber,
      })
      .from(handoverItems)
      .leftJoin(items, eq(handoverItems.itemId, items.id))
      .where(inArray(handoverItems.handoverId, hvIds));

    const itemsByHv = new Map<number, typeof hvItemRows>();
    for (const row of hvItemRows) {
      const existing = itemsByHv.get(row.handoverId) ?? [];
      existing.push(row);
      itemsByHv.set(row.handoverId, existing);
    }

    const result = hvList.map((hv) => {
      const hvItems = itemsByHv.get(hv.id) ?? [];
      return {
        ...hv,
        itemName: hvItems[0]?.itemName ?? null,
        items: hvItems.map((i) => ({
          itemId: i.itemId,
          itemName: i.itemName,
          itemCategory: i.itemCategory,
          itemLocation: i.itemLocation,
          itemInventoryNumber: i.itemInventoryNumber,
          itemAssetNumber: i.itemAssetNumber,
          quantity: i.quantity,
          notes: i.notes,
        })),
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/handovers error:", error);
    return NextResponse.json({ error: "Failed to fetch handovers" }, { status: 500 });
  }
}

// POST /api/handovers — user buat request serah terima
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await jsonBody(req);
    if (!body) return NextResponse.json({ error: "Body permintaan tidak valid" }, { status: 400 });
    const { cart, purpose, notes } = body;
    const user = session.user as any;

    // ── Aturan data diri (double role) ──
    // Admin/super_admin (mode admin) boleh mengisi data penerima custom.
    // User biasa — termasuk admin yang sedang di "Mode User" — wajib memakai
    // data dirinya sendiri; body diabaikan.
    const isAdmin = user.role === "admin" || user.role === "super_admin";
    const src = isAdmin ? body : {};

    const receiverName = (src.receiverName || user.name || "").trim();
    const receiverNim  = (src.receiverNim  || user.nim  || "").trim();
    const unitName     = isAdmin ? (src.unitName || "").trim() : "";
    const department   = (src.department   || user.department || "").trim();
    const phone        = (src.phone        || user.phone || "").trim();
    const location     = (src.location     || "").trim();

    if (!receiverName || !department || !phone)
      return NextResponse.json({ error: "Nama, divisi/prodi, dan nomor HP wajib diisi" }, { status: 400 });
    if (!purpose?.trim())
      return NextResponse.json({ error: "Keperluan (kegiatan) wajib diisi" }, { status: 400 });
    if (!cart || !Array.isArray(cart) || cart.length === 0)
      return NextResponse.json({ error: "Pilih minimal satu barang" }, { status: 400 });
    if (!receiverNim)
      return NextResponse.json({ error: "NIM_REQUIRED" }, { status: 422 });

    // ── Cek TTD elektronik ──
    const [userRow] = await db
      .select({ signatureUrl: users.signatureUrl })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    if (!userRow?.signatureUrl)
      return NextResponse.json({ error: "SIGNATURE_REQUIRED" }, { status: 422 });

    const cartItems: Keranjang[] = bacaKeranjang(cart);

    const itemIds = cartItems.map((c) => c.itemId);
    const dbItems = await db.select().from(items).where(inArray(items.id, itemIds));
    const itemMap = new Map(dbItems.map((i) => [i.id, i]));

    for (const c of cartItems) {
      const dbItem = itemMap.get(c.itemId);
      if (!dbItem) return NextResponse.json({ error: `Barang ID ${c.itemId} tidak ditemukan` }, { status: 404 });
      if (!dbItem.canHandover)
        return NextResponse.json({ error: `Barang "${dbItem.name}" tidak tersedia untuk diserahterimakan.` }, { status: 400 });
      if (dbItem.availableQuantity < c.quantity)
        return NextResponse.json({ error: `Stok "${dbItem.name}" tidak mencukupi. Tersisa ${dbItem.availableQuantity} unit.` }, { status: 400 });
    }

    // ── PECAH PER UNIT ──
    // Sama seperti peminjaman: satu pengajuan serah terima bisa memuat barang
    // dari beberapa unit, dan tiap unit punya adminnya sendiri. Pemecahan di
    // sini TIDAK mengubah apa yang dilihat user — TTD-nya satu, dokumennya
    // satu (digabung), riwayatnya satu bingkai. Yang berubah hanya di sisi
    // admin: masing-masing menyetujui bagiannya.
    const grupId = crypto.randomUUID();
    const grup = pecahPerUnit(cartItems, new Map(dbItems.map((i) => [i.id, i.unit])));

    const dibuat: { id: number; unit: string; cart: Keranjang[] }[] = [];
    const bersihkan = async () => {
      const ids = dibuat.map((d) => d.id);
      if (ids.length === 0) return;
      await db.delete(handoverItems).where(inArray(handoverItems.handoverId, ids));
      await db.delete(handovers).where(inArray(handovers.id, ids));
    };

    for (const [unit, isiGrup] of grup) {
      const [{ id: hvId }] = await db
        .insert(handovers)
        .values({
          userId: session.user.id,
          grupId,
          unit: unit || null,
          receiverName,
          receiverNim: receiverNim || null,
          unitName: unitName || null,
          department: department || null,
          phone: phone || null,
          location: location || null,
          purpose: purpose.trim(),
          notes: notes?.trim() || null,
          status: "pending_approval",
        })
        .$returningId();

      await db.insert(handoverItems).values(
        isiGrup.map((c) => ({
          handoverId: hvId,
          itemId: c.itemId,
          quantity: c.quantity,
          notes: c.notes || null,
          itemName: itemMap.get(c.itemId)?.name ?? null,
          itemCode: itemMap.get(c.itemId)?.itemCode ?? null,
          itemInventoryNumber: itemMap.get(c.itemId)?.inventoryNumber ?? null,
        }))
      );

      // ── Kurangi stok sementara — ATOMIK ──
      // Dulu di sini pola baca-hitung-tulis (baca availableQuantity, kurangi di
      // JS, lalu tulis). Dua pengajuan bersamaan bisa membaca angka yang sama
      // dan yang satu menimpa yang lain — stok berkurang lebih sedikit dari
      // seharusnya. Sekarang syarat "stok cukup" ikut di WHERE.
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
          // Kalah balapan → batalkan SEMUA pecahan, bukan cuma yang ini.
          await bersihkan();
          return NextResponse.json(
            { error: `Stok "${itemMap.get(c.itemId)?.name}" tidak lagi mencukupi — mungkin baru diambil permintaan lain. Coba lagi.` },
            { status: 409 }
          );
        }
      }

      dibuat.push({ id: hvId, unit, cart: isiGrup });
    }

    // ── PDF per pecahan, TTD yang sama ──
    for (const bagian of dibuat) {
      try {
        const [hv] = await db.select().from(handovers).where(eq(handovers.id, bagian.id));
        const { generateHandoverPDF } = await import("@/lib/handover-pdf-generator");
        const { writeFile, mkdir } = await import("fs/promises");
        const nodePath = await import("path");

        const pdfBuffer = await generateHandoverPDF({
          receiverName,
          receiverNim,
          unitName,
          department,
          phone,
          location,
          purpose: purpose.trim(),
          notes: notes?.trim() || "",
          handoverDate: hv.handoverDate,
          signatureUrl: userRow.signatureUrl,
          items: bagian.cart.map((c) => ({
            name: itemMap.get(c.itemId)?.name || "Barang",
            quantity: c.quantity,
            assetNumber: itemMap.get(c.itemId)?.assetNumber ?? null,
            itemCode: itemMap.get(c.itemId)?.itemCode ?? null,
            inventoryNumber: itemMap.get(c.itemId)?.inventoryNumber ?? null,
          })),
        });

        const receiverSafe = receiverName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_").slice(0, 40);
        const d = hv.handoverDate;
        const dateStr = `${String(d.getDate()).padStart(2,"0")}${String(d.getMonth()+1).padStart(2,"0")}${d.getFullYear()}`;
        const kodeUnit = bagian.unit ? unitCode(bagian.unit) : "LAIN";
        const filename = `ST_${receiverSafe}_${dateStr}_${bagian.id}_${kodeUnit}.pdf`;

        const uploadDir = uploadPath("pending");
        await mkdir(uploadDir, { recursive: true });
        await writeFile(nodePath.default.join(uploadDir, filename), pdfBuffer);

        await db
          .update(handovers)
          .set({ signedDocumentUrl: `/uploads/pending/${filename}` })
          .where(eq(handovers.id, bagian.id));
      } catch (pdfErr) {
        console.error("PDF handover generate error:", pdfErr);
      }
    }

    const ringkas = dibuat.map((b) => ({
      code: `ST-${String(b.id).padStart(4, "0")}`,
      handoverId: b.id,
      unit: b.unit || null,
      totalItems: b.cart.length,
      totalQuantity: b.cart.reduce((s, c) => s + c.quantity, 0),
    }));

    return NextResponse.json({
      grupId,
      pecahan: ringkas,
      // Bentuk lama dipertahankan agar tampilan lama tidak langsung rusak.
      handoverId: ringkas[0]?.handoverId ?? null,
      code: ringkas[0]?.code ?? null,
      receiverName,
      itemNames: cartItems.map((c) => `${itemMap.get(c.itemId)?.name} (×${c.quantity})`).filter(Boolean).join(", "),
      totalItems: cartItems.length,
      totalQuantity: cartItems.reduce((s, c) => s + c.quantity, 0),
      pdfUrl: null,
    }, { status: 201 });

  } catch (error) {
    console.error("POST /api/handovers error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan" }, { status: 500 });
  }
}
