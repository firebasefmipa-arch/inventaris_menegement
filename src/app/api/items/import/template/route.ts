import { NextResponse } from "next/server";
// @ts-ignore
import { utils, write } from "xlsx";
import { auth } from "@/auth";
import { templateRows } from "@/lib/item-import";

/**
 * Unduh template impor barang (.xlsx).
 *
 * Template dibuat dari `IMPORT_COLUMNS` — sumber yang sama dengan parser —
 * supaya header di template tak pernah melenceng dari yang dibaca server.
 * Contoh 2 baris diisi agar jelas format tiap kolom.
 */
export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || (role !== "admin" && role !== "super_admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ws = utils.aoa_to_sheet(templateRows());
  ws["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 30 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 8 }, { wch: 28 }];

  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, "Barang");
  const buf: Buffer = write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="template-import-barang.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
