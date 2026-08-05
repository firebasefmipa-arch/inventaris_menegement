import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [item] = await db
      .select()
      .from(items)
      .where(eq(items.id, parseInt(id)));
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
    const { id } = await params;
    const itemId = parseInt(id);
    const body = await request.json();
    const { name, category, description, quantity, location, imageUrl, status, sn, inventoryNumber, assetNumber, lastCheckDate, condition } =
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
        ...(quantity !== undefined && { quantity }),
        ...(location !== undefined && { location }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(status !== undefined && { status }),
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
    const { id } = await params;
    const itemId = parseInt(id);

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
