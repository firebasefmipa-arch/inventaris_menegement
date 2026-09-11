import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items } from "@/db/schema";
import { eq, like, or, and, gt } from "drizzle-orm";
import { toBool } from "@/lib/to-bool";
import { auth } from "@/auth";
import { generateItemCode } from "@/lib/item-code";

// Semua endpoint /api/items adalah panel admin. Halaman user membaca DB
// langsung (server component), jadi tidak ada konsumen non-admin.
async function requireAdmin() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "admin" && role !== "super_admin")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const category = searchParams.get("category") || "";
    const status = searchParams.get("status") || "";
    const canBorrow = searchParams.get("canBorrow");
    const canHandover = searchParams.get("canHandover");

    const conditions = [];

    // Sembunyikan item yang sudah habis total (quantity=0, hasil serah terima
    // permanen — tidak akan kembali). Item dipinjam tetap muncul (avail 0, qty>0).
    conditions.push(gt(items.quantity, 0));

    if (canBorrow === "1") conditions.push(eq(items.canBorrow, true));
    if (canHandover === "1") conditions.push(eq(items.canHandover, true));

    if (search) {
      conditions.push(
        or(
          like(items.name, `%${search}%`),
          like(items.description, `%${search}%`),
          like(items.inventoryNumber, `%${search}%`),
          like(items.assetNumber, `%${search}%`),
          like(items.sn, `%${search}%`),
          like(items.condition, `%${search}%`)
        )
      );
    }
    if (category) {
      conditions.push(eq(items.category, category));
    }
    if (status) {
      conditions.push(
        eq(items.status, status as "available" | "borrowed")
      );
    }

    const data = await db
      .select()
      .from(items)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(items.name);

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/items error:", error);
    return NextResponse.json(
      { error: "Failed to fetch items" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const body = await request.json();
    const { name, category, description, quantity, location, imageUrl, sn, inventoryNumber, assetNumber, lastCheckDate, condition, canBorrow, canHandover } = body;

    if (!name || !category) {
      return NextResponse.json(
        { error: "Nama dan kategori wajib diisi" },
        { status: 400 }
      );
    }

    const qty = quantity || 1;

    // Kode barang dibuat di server, terkunci — nilai itemCode dari klien diabaikan.
    const { code: itemCode, location: normalizedLocation } = await generateItemCode(location);

    const [{ id }] = await db
      .insert(items)
      .values({
        name,
        category,
        description: description || null,
        sn: sn || null,
        itemCode,
        inventoryNumber: inventoryNumber || null,
        assetNumber: assetNumber || null,
        lastCheckDate: lastCheckDate || null,
        condition: condition || null,
        imageUrl: imageUrl || null,
        quantity: qty,
        availableQuantity: qty,
        canBorrow: canBorrow === undefined ? true : toBool(canBorrow),
        canHandover: canHandover === undefined ? true : toBool(canHandover),
        location: normalizedLocation || null,
        status: "available",
      })
      .$returningId();

    const [item] = await db.select().from(items).where(eq(items.id, id));

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error("POST /api/items error:", error);
    return NextResponse.json(
      { error: "Failed to create item" },
      { status: 500 }
    );
  }
}
