import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items } from "@/db/schema";
import { eq, like, or, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const category = searchParams.get("category") || "";
    const status = searchParams.get("status") || "";

    const conditions = [];

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
    const body = await request.json();
    const { name, category, description, quantity, location, imageUrl, sn, inventoryNumber, assetNumber, lastCheckDate, condition } = body;

    if (!name || !category) {
      return NextResponse.json(
        { error: "Nama dan kategori wajib diisi" },
        { status: 400 }
      );
    }

    const qty = quantity || 1;

    const [{ id }] = await db
      .insert(items)
      .values({
        name,
        category,
        description: description || null,
        sn: sn || null,
        inventoryNumber: inventoryNumber || null,
        assetNumber: assetNumber || null,
        lastCheckDate: lastCheckDate || null,
        condition: condition || null,
        imageUrl: imageUrl || null,
        quantity: qty,
        availableQuantity: qty,
        location: location || null,
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
