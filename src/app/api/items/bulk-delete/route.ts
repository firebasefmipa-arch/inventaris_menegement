import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { snapshotSebelumHapus } from "@/lib/item-snapshot";
import { jsonBody } from "@/lib/json-body";
import { barangSedangDipakai, pesanBarangDipakai } from "@/lib/item-in-use";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user || (role !== "admin" && role !== "super_admin"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await jsonBody(request);
    if (!body) return NextResponse.json({ error: "Body permintaan tidak valid" }, { status: 400 });
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "Invalid or empty IDs array" },
        { status: 400 }
      );
    }

    // ── F1: tolak seluruh permintaan kalau ADA barang yang masih dipegang ──
    // Sebagian-lalu-berhenti bikin admin bingung barang mana yang jadi terhapus.
    const angka = ids.map((n: any) => Number(n)).filter((n: number) => Number.isInteger(n) && n > 0);
    if (angka.length === 0) {
      return NextResponse.json({ error: "Invalid or empty IDs array" }, { status: 400 });
    }
    const dipakai = await barangSedangDipakai(angka);
    if (dipakai.length > 0) {
      return NextResponse.json({ error: pesanBarangDipakai(dipakai) }, { status: 400 });
    }

    // Salin identitas barang terakhir ke baris riwayat SEBELUM barang dihapus,
    // supaya riwayat yang terdampak tetap menampilkan nama & data barangnya.
    await snapshotSebelumHapus(angka);
    await db.delete(items).where(inArray(items.id, angka));

    return NextResponse.json({ message: "Items deleted successfully" });
  } catch (error) {
    console.error("POST /api/items/bulk-delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete items" },
      { status: 500 }
    );
  }
}
