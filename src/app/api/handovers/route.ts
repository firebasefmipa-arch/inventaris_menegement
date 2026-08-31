import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { handovers, handoverItems, items, users } from "@/db/schema";
import { eq, desc, inArray, and } from "drizzle-orm";
import { auth } from "@/auth";

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
        itemName: items.name,
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

    const body = await req.json();
    const { cart, purpose, notes } = body;
    const user = session.user as any;

    const receiverName = (body.receiverName || user.name || "").trim();
    const receiverNim  = (body.receiverNim  || user.nim  || "").trim();
    const unitName     = (body.unitName     || "").trim();
    const department   = (body.department   || user.department || "").trim();
    const phone        = (body.phone        || user.phone || "").trim();
    const location     = (body.location     || "").trim();

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

    const cartItems = cart.map((c: any) => ({
      itemId: Number(c.itemId),
      quantity: Math.max(1, Number(c.quantity) || 1),
      notes: c.notes?.trim() || "",
    }));

    const itemIds = cartItems.map((c: any) => c.itemId);
    const dbItems = await db.select().from(items).where(inArray(items.id, itemIds));
    const itemMap = new Map(dbItems.map((i) => [i.id, i]));

    for (const c of cartItems) {
      const dbItem = itemMap.get(c.itemId);
      if (!dbItem) return NextResponse.json({ error: `Barang ID ${c.itemId} tidak ditemukan` }, { status: 404 });
      if (dbItem.availableQuantity < c.quantity)
        return NextResponse.json({ error: `Stok "${dbItem.name}" tidak mencukupi. Tersisa ${dbItem.availableQuantity} unit.` }, { status: 400 });
    }

    // ── Buat handover dengan status pending_approval langsung ──
    const [{ id: hvId }] = await db
      .insert(handovers)
      .values({
        userId: session.user.id,
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
      cartItems.map((c: any) => ({ handoverId: hvId, itemId: c.itemId, quantity: c.quantity, notes: c.notes || null }))
    );

    // ── Kurangi stok sementara ──
    for (const c of cartItems) {
      const dbItem = itemMap.get(c.itemId)!;
      const newAvailable = dbItem.availableQuantity - c.quantity;
      await db.update(items).set({
        availableQuantity: newAvailable,
        status: newAvailable === 0 ? "borrowed" : "available",
        updatedAt: new Date(),
      }).where(eq(items.id, dbItem.id));
    }

    // ── Generate PDF dengan TTD ──
    const [hv] = await db.select().from(handovers).where(eq(handovers.id, hvId));
    let pdfUrl: string | null = null;
    try {
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
        items: cartItems.map((c: any) => ({
          name: itemMap.get(c.itemId)?.name || "Barang",
          quantity: c.quantity,
          assetNumber: itemMap.get(c.itemId)?.assetNumber ?? null,
          inventoryNumber: itemMap.get(c.itemId)?.inventoryNumber ?? null,
        })),
      });

      const receiverSafe = receiverName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_").slice(0, 40);
      const d = hv.handoverDate;
      const dateStr = `${String(d.getDate()).padStart(2,"0")}${String(d.getMonth()+1).padStart(2,"0")}${d.getFullYear()}`;
      const filename = `${receiverSafe}_${dateStr}_${hvId}.pdf`;

      const uploadDir = nodePath.default.join(process.cwd(), "public", "uploads", "pending");
      await mkdir(uploadDir, { recursive: true });
      await writeFile(nodePath.default.join(uploadDir, filename), pdfBuffer);

      pdfUrl = `/uploads/pending/${filename}`;
      await db.update(handovers).set({ signedDocumentUrl: pdfUrl }).where(eq(handovers.id, hvId));
    } catch (pdfErr) {
      console.error("PDF handover generate error:", pdfErr);
    }

    const itemNames = cartItems.map((c: any) => `${itemMap.get(c.itemId)?.name} (×${c.quantity})`).filter(Boolean).join(", ");

    return NextResponse.json({
      handoverId: hvId,
      code: `ST-${String(hvId).padStart(4, "0")}`,
      receiverName,
      itemNames,
      totalItems: cartItems.length,
      totalQuantity: cartItems.reduce((s: number, c: any) => s + c.quantity, 0),
      pdfUrl,
    }, { status: 201 });

  } catch (error) {
    console.error("POST /api/handovers error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan" }, { status: 500 });
  }
}
