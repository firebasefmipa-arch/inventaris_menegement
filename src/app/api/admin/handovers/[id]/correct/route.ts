import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { handovers, handoverItems, items, users } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { generateHandoverPDF } from "@/lib/handover-pdf-generator";
import { writeFile, mkdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

/**
 * PATCH /api/admin/handovers/[id]/correct
 * Admin koreksi daftar barang serah terima sebelum approve.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user || (role !== "admin" && role !== "super_admin"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const hvId = parseInt(id, 10);
    if (isNaN(hvId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const body = await req.json();
    const newItems: { itemId: number; quantity: number; notes?: string }[] = body.items;

    if (!Array.isArray(newItems) || newItems.length === 0)
      return NextResponse.json({ error: "Minimal satu barang wajib ada" }, { status: 400 });

    const [hv] = await db.select().from(handovers).where(eq(handovers.id, hvId));
    if (!hv) return NextResponse.json({ error: "Serah terima tidak ditemukan" }, { status: 404 });
    if (hv.status !== "pending_approval")
      return NextResponse.json({ error: "Hanya bisa koreksi serah terima berstatus menunggu persetujuan" }, { status: 400 });

    // ── Kembalikan stok items lama ──
    const oldItems = await db.select().from(handoverItems).where(eq(handoverItems.handoverId, hvId));
    for (const old of oldItems) {
      const [item] = await db.select().from(items).where(eq(items.id, old.itemId)).limit(1);
      if (item) {
        const newAvailable = item.availableQuantity + old.quantity;
        await db.update(items).set({
          availableQuantity: newAvailable,
          status: newAvailable > 0 ? "available" : "borrowed",
          updatedAt: new Date(),
        }).where(eq(items.id, item.id));
      }
    }

    // ── Validasi & kurangi stok items baru ──
    const itemIds = newItems.map((i) => i.itemId);
    const dbItems = await db.select().from(items).where(inArray(items.id, itemIds));
    const itemMap = new Map(dbItems.map((i) => [i.id, i]));

    for (const ni of newItems) {
      const dbItem = itemMap.get(ni.itemId);
      if (!dbItem) return NextResponse.json({ error: `Barang ID ${ni.itemId} tidak ditemukan` }, { status: 404 });
      if (dbItem.availableQuantity < ni.quantity)
        return NextResponse.json({ error: `Stok "${dbItem.name}" tidak mencukupi. Tersisa ${dbItem.availableQuantity} unit.` }, { status: 400 });
    }

    // ── Replace items ──
    await db.delete(handoverItems).where(eq(handoverItems.handoverId, hvId));
    await db.insert(handoverItems).values(
      newItems.map((ni) => ({
        handoverId: hvId,
        itemId: ni.itemId,
        quantity: ni.quantity,
        notes: ni.notes?.trim() || null,
      }))
    );

    for (const ni of newItems) {
      const dbItem = itemMap.get(ni.itemId)!;
      const newAvailable = dbItem.availableQuantity - ni.quantity;
      await db.update(items).set({
        availableQuantity: newAvailable,
        status: newAvailable === 0 ? "borrowed" : "available",
        updatedAt: new Date(),
      }).where(eq(items.id, dbItem.id));
    }

    // ── Regenerate PDF ──
    let pdfUrl = hv.signedDocumentUrl;
    try {
      let signatureUrl: string | null = null;
      if (hv.userId) {
        const [userRow] = await db.select({ signatureUrl: users.signatureUrl }).from(users).where(eq(users.id, hv.userId)).limit(1);
        signatureUrl = userRow?.signatureUrl ?? null;
      }

      const pdfBuffer = await generateHandoverPDF({
        receiverName: hv.receiverName,
        receiverNim: hv.receiverNim || "",
        unitName: hv.unitName || hv.department || "",
        department: hv.department || "",
        phone: hv.phone || "",
        location: hv.location || "",
        purpose: hv.purpose || "",
        notes: hv.notes || "",
        handoverDate: hv.handoverDate,
        signatureUrl,
        items: newItems.map((ni) => ({
          name: itemMap.get(ni.itemId)?.name || "Barang",
          quantity: ni.quantity,
          assetNumber: itemMap.get(ni.itemId)?.assetNumber ?? null,
          inventoryNumber: itemMap.get(ni.itemId)?.inventoryNumber ?? null,
        })),
      });

      const receiverSafe = hv.receiverName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_").slice(0, 40);
      const d = hv.handoverDate;
      const dateStr = `${String(d.getDate()).padStart(2,"0")}${String(d.getMonth()+1).padStart(2,"0")}${d.getFullYear()}`;
      const filename = `${receiverSafe}_${dateStr}_${hvId}_corrected.pdf`;
      const uploadDir = path.join(process.cwd(), "public", "uploads", "pending");
      await mkdir(uploadDir, { recursive: true });

      if (hv.signedDocumentUrl?.startsWith("/uploads/pending/")) {
        const oldPath = path.join(process.cwd(), "public", hv.signedDocumentUrl);
        if (existsSync(oldPath)) await unlink(oldPath).catch(() => {});
      }

      await writeFile(path.join(uploadDir, filename), pdfBuffer);
      pdfUrl = `/uploads/pending/${filename}`;
      await db.update(handovers).set({ signedDocumentUrl: pdfUrl }).where(eq(handovers.id, hvId));
    } catch (pdfErr) {
      console.error("Regenerate handover PDF error:", pdfErr);
    }

    return NextResponse.json({ success: true, pdfUrl, totalItems: newItems.length });
  } catch (error) {
    console.error("PATCH /api/admin/handovers/[id]/correct error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan" }, { status: 500 });
  }
}
