import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { auth } from "@/auth";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user || (role !== "admin" && role !== "super_admin"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "Invalid or empty IDs array" },
        { status: 400 }
      );
    }

    await db.delete(items).where(inArray(items.id, ids));

    return NextResponse.json({ message: "Items deleted successfully" });
  } catch (error) {
    console.error("POST /api/items/bulk-delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete items" },
      { status: 500 }
    );
  }
}
