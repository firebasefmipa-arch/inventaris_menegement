import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { handovers, handoverItems, items, users } from "@/db/schema";
import { eq, desc, inArray, and } from "drizzle-orm";
import { auth } from "@/auth";

// GET /api/admin/handovers — daftar semua serah terima (admin)
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user || (role !== "admin" && role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const conditions = status ? [eq(handovers.status, status as any)] : [];

    const hvList = await db
      .select({
        id: handovers.id,
        userId: handovers.userId,
        receiverName: handovers.receiverName,
        receiverNim: handovers.receiverNim,
        unitName: handovers.unitName,
        department: handovers.department,
        phone: handovers.phone,
        purpose: handovers.purpose,
        notes: handovers.notes,
        signedDocumentUrl: handovers.signedDocumentUrl,
        status: handovers.status,
        rejectionReason: handovers.rejectionReason,
        handoverDate: handovers.handoverDate,
        createdAt: handovers.createdAt,
      })
      .from(handovers)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
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
        items: hvItems,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/admin/handovers error:", error);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

// POST /api/admin/handovers — admin buat serah terima manual (langsung completed)
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user || (role !== "admin" && role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { cart, receiverName, receiverNim, unitName, department, phone, location, purpose, notes } = body;

    if (!receiverName?.trim() || !department?.trim()) {
      return NextResponse.json(
        { error: "Nama penerima dan divisi/prodi wajib diisi" },
        { status: 400 }
      );
    }

    if (!purpose?.trim()) {
      return NextResponse.json(
        { error: "Keperluan wajib diisi" },
        { status: 400 }
      );
    }

    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return NextResponse.json({ error: "Pilih minimal satu barang" }, { status: 400 });
    }

    const cartItems = cart.map((c: any) => ({
      itemId: Number(c.itemId),
      quantity: Math.max(1, Number(c.quantity) || 1),
      notes: c.notes?.trim() || "",
    }));

    const itemIds = cartItems.map((c) => c.itemId);
    const dbItems = await db.select().from(items).where(inArray(items.id, itemIds));
    const itemMap = new Map(dbItems.map((i) => [i.id, i]));

    for (const c of cartItems) {
      const dbItem = itemMap.get(c.itemId);
      if (!dbItem) {
        return NextResponse.json({ error: `Barang ID ${c.itemId} tidak ditemukan` }, { status: 404 });
      }
      if (dbItem.availableQuantity < c.quantity) {
        return NextResponse.json(
          { error: `Stok "${dbItem.name}" tidak mencukupi. Tersisa ${dbItem.availableQuantity} unit.` },
          { status: 400 }
        );
      }
    }

    // Admin buat → langsung completed
    const [{ id: hvId }] = await db
      .insert(handovers)
      .values({
        userId: null,
        receiverName: receiverName.trim(),
        receiverNim: receiverNim?.trim() || null,
        unitName: unitName?.trim() || null,
        department: department.trim(),
        phone: phone?.trim() || null,
        location: location?.trim() || null,
        purpose: purpose.trim(),
        notes: notes?.trim() || null,
        status: "completed",
      })
      .$returningId();

    await db.insert(handoverItems).values(
      cartItems.map((c) => ({
        handoverId: hvId,
        itemId: c.itemId,
        quantity: c.quantity,
        notes: c.notes || null,
      }))
    );

    // Kurangi stok permanen
    for (const c of cartItems) {
      const dbItem = itemMap.get(c.itemId)!;
      const newQty       = dbItem.quantity - c.quantity;
      const newAvailable = dbItem.availableQuantity - c.quantity;
      await db.update(items).set({
        quantity: Math.max(0, newQty),
        availableQuantity: Math.max(0, newAvailable),
        status: Math.max(0, newAvailable) === 0 ? "borrowed" : "available",
        updatedAt: new Date(),
      }).where(eq(items.id, dbItem.id));
    }

    return NextResponse.json({ id: hvId, code: `ST-${String(hvId).padStart(4, "0")}` }, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/handovers error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan" }, { status: 500 });
  }
}
