import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { handovers, handoverItems, items, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { generateHandoverPDF } from "@/lib/handover-pdf-generator";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const hvId = parseInt(id, 10);
    if (isNaN(hvId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const [hv] = await db.select().from(handovers).where(eq(handovers.id, hvId)).limit(1);
    if (!hv) return NextResponse.json({ error: "Serah terima tidak ditemukan" }, { status: 404 });

    const role = (session.user as any)?.role;
    if (hv.userId !== session.user.id && role !== "admin" && role !== "super_admin") {
      return NextResponse.json({ error: "Tidak memiliki akses" }, { status: 403 });
    }

    // Hanya bisa regenerate jika status 'deleted' ATAU file fisik tidak ada (rusak/hilang)
    const fileMissing =
      hv.signedDocumentUrl &&
      hv.signedDocumentUrl !== "deleted" &&
      hv.signedDocumentUrl.startsWith("/uploads/") &&
      !existsSync(path.join(process.cwd(), "public", hv.signedDocumentUrl));
    if (hv.signedDocumentUrl !== "deleted" && !fileMissing) {
      return NextResponse.json({ error: "Dokumen belum dihapus atau sudah ada" }, { status: 400 });
    }

    // Ambil item serah terima
    const hvItemRows = await db
      .select({
        itemId: handoverItems.itemId,
        quantity: handoverItems.quantity,
        notes: handoverItems.notes,
        itemName: items.name,
        inventoryNumber: items.inventoryNumber,
        assetNumber: items.assetNumber,
        itemCode: items.itemCode,
      })
      .from(handoverItems)
      .leftJoin(items, eq(handoverItems.itemId, items.id))
      .where(eq(handoverItems.handoverId, hvId));

    if (hvItemRows.length === 0) {
      return NextResponse.json({ error: "Tidak ada barang ditemukan" }, { status: 404 });
    }

    // Ambil TTD elektronik pemohon (user yang membuat handover)
    let signatureUrl: string | null = null;
    if (hv.userId) {
      const [hvUser] = await db.select({ signatureUrl: users.signatureUrl }).from(users).where(eq(users.id, hv.userId as any)).limit(1);
      signatureUrl = hvUser?.signatureUrl || null;
    }

    // Generate PDF
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
      items: hvItemRows.map((r) => ({
        name: r.itemName || "Barang",
        quantity: r.quantity,
        assetNumber: r.assetNumber,
        itemCode: r.itemCode,
        inventoryNumber: r.inventoryNumber,
      })),
    });

    // Simpan ke disk
    const receiverSafe = (hv.receiverName || "Penerima")
      .replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_").slice(0, 40);
    const d = hv.handoverDate;
    const dateStr = `${String(new Date(d).getDate()).padStart(2, "0")}${String(new Date(d).getMonth() + 1).padStart(2, "0")}${new Date(d).getFullYear()}`;
    const filename = `ST_${receiverSafe}_${dateStr}_${hvId}_regen.pdf`;

    const uploadDir = path.join(process.cwd(), "public", "uploads", "handovers");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, filename), pdfBuffer);

    const newUrl = `/uploads/handovers/${filename}`;

    // Update DB — set URL baru saja, status tidak berubah
    await db.update(handovers).set({
      signedDocumentUrl: newUrl,
    }).where(eq(handovers.id, hvId));

    return NextResponse.json({ success: true, url: newUrl, message: "Dokumen berhasil digenerate ulang" });
  } catch (error) {
    console.error("Regenerate handover doc error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan" }, { status: 500 });
  }
}
