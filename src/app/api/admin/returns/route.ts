import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { itemReturns } from "@/db/schema";
import { desc } from "drizzle-orm";
import { auth } from "@/auth";
import { jsonBody } from "@/lib/json-body";
import { unitDiLuar } from "@/lib/unit-di-luar";
import { catatPengembalian } from "@/lib/pengembalian";

// Semua endpoint pengembalian = panel admin. Hanya admin & super_admin.
async function requireAdmin() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || (role !== "admin" && role !== "super_admin")) {
    return { denied: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), session: null };
  }
  return { denied: null, session };
}

// GET /api/admin/returns — riwayat pengembalian + daftar unit yang masih di luar.
// Satu endpoint saja: daftar "di luar" tak pernah besar, jadi klien menyaring
// sendiri saat admin mengetik kode (tak perlu rute pencarian kedua).
export async function GET() {
  try {
    const { denied } = await requireAdmin();
    if (denied) return denied;

    const riwayat = await db
      .select()
      .from(itemReturns)
      .orderBy(desc(itemReturns.returnDate));

    const diLuar = await unitDiLuar();

    return NextResponse.json({ riwayat, diLuar });
  } catch (error) {
    console.error("GET /api/admin/returns error:", error);
    return NextResponse.json({ error: "Gagal memuat data" }, { status: 500 });
  }
}

// POST /api/admin/returns — catat barang yang kembali, stok DITAMBAH.
export async function POST(req: NextRequest) {
  try {
    const { denied, session } = await requireAdmin();
    if (denied) return denied;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await jsonBody(req);
    if (!body) return NextResponse.json({ error: "Body permintaan tidak valid" }, { status: 400 });

    const hasil = await catatPengembalian({
      itemCode: body.itemCode,
      quantity: body.quantity,
      returnedBy: body.returnedBy,
      notes: body.notes,
      receivedBy: session.user?.name ?? null,
      receivedById: session.user?.id ?? null,
    });

    if (!hasil.ok) {
      return NextResponse.json({ error: hasil.error }, { status: hasil.status });
    }

    return NextResponse.json(hasil, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/returns error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan" }, { status: 500 });
  }
}
