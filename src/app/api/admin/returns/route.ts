import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { itemReturns, items } from "@/db/schema";
import { desc, inArray, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { jsonBody } from "@/lib/json-body";
import { unitDiLuar } from "@/lib/unit-di-luar";
import { catatPengembalian } from "@/lib/pengembalian";
import { batasUnit, periksaAksesUnit } from "@/lib/akses-unit";

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
    const { denied, session } = await requireAdmin();
    if (denied) return denied;

    const batas = await batasUnit(session);

    const riwayat = await db
      .select()
      .from(itemReturns)
      .orderBy(desc(itemReturns.returnDate));

    const diLuar = await unitDiLuar(undefined, batas);

    // Riwayat disaring menurut UNIT barangnya, bukan lewat daftar "di luar" —
    // barang yang sudah kembali penuh tidak lagi muncul di daftar itu, jadi
    // menyaring dengan cara tersebut akan menghapus riwayatnya juga.
    let riwayatTersaring = riwayat;
    if (batas !== null) {
      const idRiwayat = [...new Set(riwayat.map((r) => r.itemId))];
      if (idRiwayat.length === 0) {
        riwayatTersaring = [];
      } else {
        const baris = await db
          .select({ id: items.id, unit: items.unit })
          .from(items)
          .where(inArray(items.id, idRiwayat));
        const unitBarang = new Map(baris.map((b) => [b.id, b.unit ?? ""]));
        const boleh = new Set(batas);
        riwayatTersaring = riwayat.filter((r) => boleh.has(unitBarang.get(r.itemId) ?? ""));
      }
    }

    return NextResponse.json({ riwayat: riwayatTersaring, diLuar });
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

    // Batas unit diperiksa lebih dulu lewat kode barangnya. Pemeriksaan ini di
    // luar transaksi pengembalian (barang dicari sekali lagi di dalam sana,
    // dengan kunci baris) — unit barang praktis tak pernah berubah, jadi celah
    // waktunya tidak berarti.
    const kode = String(body.itemCode ?? "").trim().toUpperCase();
    if (kode) {
      const [barang] = await db
        .select({ unit: items.unit })
        .from(items)
        .where(eq(items.itemCode, kode))
        .limit(1);
      if (barang) {
        const tolak = await periksaAksesUnit(session, barang.unit);
        if (tolak) return NextResponse.json({ error: tolak.pesan }, { status: tolak.status });
      }
    }

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
