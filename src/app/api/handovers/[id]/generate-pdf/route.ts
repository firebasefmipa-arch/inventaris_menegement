import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { handovers, handoverItems, items, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { generateHandoverPDF } from "@/lib/handover-pdf-generator";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });

    const { id } = await params;
    const hvId = parseInt(id, 10);
    if (isNaN(hvId)) return new NextResponse("Invalid ID", { status: 400 });

    const [hv] = await db.select().from(handovers).where(eq(handovers.id, hvId)).limit(1);
    if (!hv) return new NextResponse("Not found", { status: 404 });

    const role = (session.user as any)?.role;
    if (hv.userId !== session.user.id && role !== "admin" && role !== "super_admin") {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    // Ambil item-item serah terima
    const hvItemRows = await db
      .select({
        itemId: handoverItems.itemId,
        quantity: handoverItems.quantity,
        notes: handoverItems.notes,
        itemName: items.name,
        inventoryNumber: items.inventoryNumber,
        assetNumber: items.assetNumber,
      })
      .from(handoverItems)
      .leftJoin(items, eq(handoverItems.itemId, items.id))
      .where(eq(handoverItems.handoverId, hvId));

    if (hvItemRows.length === 0) {
      return new NextResponse("No items found", { status: 404 });
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
      items: hvItemRows.map((r) => ({
        name: r.itemName || "Barang",
        quantity: r.quantity,
        assetNumber: r.assetNumber,
        inventoryNumber: r.inventoryNumber,
      })),
    });

    return new NextResponse(pdfBuffer as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Formulir_SerahTerima_ST-${String(hvId).padStart(4, "0")}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Generate handover PDF error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
