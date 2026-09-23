import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items } from "@/db/schema";
import { eq } from "drizzle-orm";
import { toBool } from "@/lib/to-bool";
import { auth } from "@/auth";
import { jsonBody } from "@/lib/json-body";
import { normalizeLocation, lokasiMirip } from "@/lib/locations";
import { snapshotSebelumHapus } from "@/lib/item-snapshot";
import { barangSedangDipakai, pesanBarangDipakai } from "@/lib/item-in-use";

// Panel admin saja — halaman user membaca DB langsung (server component).
async function requireAdmin() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || (role !== "admin" && role !== "super_admin"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

/** `id` route bisa bukan angka — tanpa cek ini query jadi `WHERE id = NaN`. */
function idValid(id: string): number | null {
  const n = parseInt(id, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const { id } = await params;
    const itemId = idValid(id);
    if (itemId === null)
      return NextResponse.json({ error: "ID tidak valid" }, { status: 400 });
    const [item] = await db
      .select()
      .from(items)
      .where(eq(items.id, itemId));
    if (!item) {
      return NextResponse.json(
        { error: "Item tidak ditemukan" },
        { status: 404 }
      );
    }
    return NextResponse.json(item);
  } catch (error) {
    console.error("GET /api/items/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch item" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const { id } = await params;
    const itemId = idValid(id);
    if (itemId === null)
      return NextResponse.json({ error: "ID tidak valid" }, { status: 400 });
    const body = await jsonBody(request);
    if (!body) {
      return NextResponse.json({ error: "Body permintaan tidak valid" }, { status: 400 });
    }
    const { name, category, description, quantity, location, imageUrl, status, sn, inventoryNumber, assetNumber, lastCheckDate, condition, canBorrow, canHandover, isLabelable } =
      body;
    const [existing] = await db
      .select()
      .from(items)
      .where(eq(items.id, itemId));
    if (!existing) {
      return NextResponse.json(
        { error: "Item tidak ditemukan" },
        { status: 404 }
      );
    }

    // ── E1: unit yang sedang dipegang peminjam tidak boleh "hilang" ──
    // quantity - availableQuantity = jumlah unit yang keluar (dipinjam/diserahkan
    // tapi belum dikembalikan). Menurunkan quantity di bawah angka itu membuat
    // unit tersebut lenyap dari pembukuan.
    const unitDipegang = existing.quantity - existing.availableQuantity;
    if (quantity !== undefined && Number(quantity) < unitDipegang) {
      return NextResponse.json(
        {
          error:
            `Jumlah tidak boleh kurang dari ${unitDipegang} unit — sebanyak itu sedang ` +
            `dipinjam/di luar. Kembalikan atau selesaikan transaksinya dulu.`,
        },
        { status: 400 }
      );
    }

    await db
      .update(items)
      .set({
        ...(name !== undefined && { name }),
        ...(category !== undefined && { category }),
        ...(description !== undefined && { description }),
        ...(sn !== undefined && { sn }),
        ...(inventoryNumber !== undefined && { inventoryNumber }),
        ...(assetNumber !== undefined && { assetNumber }),
        ...(lastCheckDate !== undefined && { lastCheckDate }),
        ...(condition !== undefined && { condition }),
        ...(quantity !== undefined && {
          quantity,
          // availableQuantity ikut bertambah/berkurang sebesar selisih perubahan quantity
          // Contoh: quantity lama 5, baru 8 → availableQuantity +3
          // Contoh: quantity lama 5, baru 3 → availableQuantity -2 (tidak boleh < 0)
          availableQuantity: Math.max(
            0,
            existing.availableQuantity + (quantity - existing.quantity)
          ),
        }),
        ...(location !== undefined && {
          location: normalizeLocation(lokasiMirip(location) || location) || null,
        }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(status !== undefined && { status }),
        ...(canBorrow !== undefined && { canBorrow: toBool(canBorrow) }),
        ...(canHandover !== undefined && { canHandover: toBool(canHandover) }),
        ...(isLabelable !== undefined && { isLabelable: toBool(isLabelable) }),
        updatedAt: new Date(),
      })
      .where(eq(items.id, itemId));

    const [item] = await db.select().from(items).where(eq(items.id, itemId));
    return NextResponse.json(item);
  } catch (error) {
    console.error("PUT /api/items/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update item" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const { id } = await params;
    const itemId = idValid(id);
    if (itemId === null)
      return NextResponse.json({ error: "ID tidak valid" }, { status: 400 });

    const [existing] = await db
      .select()
      .from(items)
      .where(eq(items.id, itemId));
    if (!existing) {
      return NextResponse.json(
        { error: "Item tidak ditemukan" },
        { status: 404 }
      );
    }

    // ── F1: jangan hapus barang yang unitnya masih di tangan orang ──
    // Menghapusnya membuat transaksinya menggantung dan pengembalian mustahil.
    const dipakai = await barangSedangDipakai([itemId]);
    if (dipakai.length > 0) {
      return NextResponse.json({ error: pesanBarangDipakai(dipakai) }, { status: 400 });
    }

    // Salin identitas barang terakhir ke baris riwayat SEBELUM barang dihapus,
    // supaya riwayat yang terdampak tetap menampilkan nama & data barangnya.
    await snapshotSebelumHapus([itemId]);
    await db.delete(items).where(eq(items.id, itemId));
    return NextResponse.json({ message: "Item berhasil dihapus" });
  } catch (error) {
    console.error("DELETE /api/items/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete item" },
      { status: 500 }
    );
  }
}
