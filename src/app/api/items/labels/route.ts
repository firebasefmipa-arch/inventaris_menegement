import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { items } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { generateLabelsPDF } from "@/lib/label-pdf-generator";

/**
 * Cetak label barang fisik (PDF siap cetak).
 * Body: { ids: number[] }
 *
 * Barang tanpa Kode Barang DILEWATI (bukan dibuatkan kode otomatis) —
 * jumlah yang dilewati dikirim lewat header X-Label-Skipped.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user || (role !== "admin" && role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const ids = Array.isArray(body?.ids)
      ? body.ids.map((v: unknown) => Number(v)).filter((n: number) => Number.isInteger(n))
      : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: "Tidak ada barang yang dipilih" }, { status: 400 });
    }
    if (ids.length > 500) {
      return NextResponse.json({ error: "Maksimum 500 barang sekali cetak" }, { status: 400 });
    }

    const rows = await db.select().from(items).where(inArray(items.id, ids));

    // Hanya yang punya kode barang yang bisa dilabeli
    const printable = rows.filter((r) => r.itemCode?.trim());
    const skipped = rows.length - printable.length;

    if (printable.length === 0) {
      return NextResponse.json(
        { error: "Barang yang dipilih belum punya Kode Barang, jadi belum bisa dilabeli." },
        { status: 400 }
      );
    }

    const pdf = await generateLabelsPDF(
      printable.map((r) => ({
        itemCode: r.itemCode!,
        name: r.name,
        description: r.description,
        inventoryNumber: r.inventoryNumber,
        lastCheckDate: r.lastCheckDate,
        condition: r.condition,
      }))
    );

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="label-barang.pdf"',
        "X-Label-Count": String(printable.length),
        "X-Label-Skipped": String(skipped),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Gagal membuat label:", error);
    return NextResponse.json({ error: "Gagal membuat label" }, { status: 500 });
  }
}
