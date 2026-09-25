import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { items } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { batasUnit } from "@/lib/akses-unit";
import { normalizeUnit } from "@/lib/units";
import { generateLabelsPDF } from "@/lib/label-pdf-generator";

/**
 * Cetak label barang fisik (PDF siap cetak).
 * Body: { ids: number[] }
 *
 * Barang yang tidak memenuhi syarat DILEWATI (bukan dibuatkan kode otomatis).
 * Header balasan:
 *   X-Label-Count      — jumlah label yang benar-benar dibuat
 *   X-Label-Skipped    — total baris yang dilewati
 *   X-Label-NoCode     — dilewati karena belum punya Kode Barang
 *   X-Label-NotLabelable — dilewati karena ditandai "tidak bisa dilabeli"
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

    // ── Batas unit ──
    // Admin hanya boleh melabeli barang unit yang dikelolanya. Diperiksa di
    // server, bukan cuma disembunyikan di layar.
    const batas = await batasUnit(session);
    if (batas !== null) {
      const luar = rows.filter(
        (r) => !batas.some((u) => normalizeUnit(u) === normalizeUnit(r.unit))
      );
      if (luar.length > 0) {
        return NextResponse.json(
          { error: `Barang pilihan ada yang bukan unit Anda: ${luar.map((r) => r.name).join(", ")}.` },
          { status: 403 }
        );
      }
    }

    // Dua syarat: punya Kode Barang, dan tidak ditandai "tidak bisa dilabeli".
    const printable = rows.filter((r) => r.itemCode?.trim() && r.isLabelable);
    const tanpaKode = rows.filter((r) => !r.itemCode?.trim()).length;
    const takLabelable = rows.filter((r) => r.itemCode?.trim() && !r.isLabelable).length;
    const skipped = rows.length - printable.length;

    if (printable.length === 0) {
      const sebab =
        tanpaKode > 0 && takLabelable > 0
          ? "belum punya Kode Barang dan sebagian ditandai tidak bisa dilabeli"
          : takLabelable > 0
            ? "ditandai tidak bisa dilabeli"
            : "belum punya Kode Barang";
      return NextResponse.json(
        { error: `Barang yang dipilih ${sebab}, jadi belum bisa dilabeli.` },
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
        "X-Label-NoCode": String(tanpaKode),
        "X-Label-NotLabelable": String(takLabelable),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Gagal membuat label:", error);
    return NextResponse.json({ error: "Gagal membuat label" }, { status: 500 });
  }
}
