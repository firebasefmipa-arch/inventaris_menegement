import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { eq, and, count } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const [{ total }] = await db
      .select({ total: count() })
      .from(transactions)
      .where(eq(transactions.userId, userId));

    const [{ active }] = await db
      .select({ active: count() })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.status, "active")));

    const [{ pendingSignature }] = await db
      .select({ pendingSignature: count() })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.status, "pending_signature")));

    const [{ pendingApproval }] = await db
      .select({ pendingApproval: count() })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.status, "pending_approval")));

    const pending = pendingSignature + pendingApproval;

    const [{ overdue }] = await db
      .select({ overdue: count() })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.status, "overdue")));

    return NextResponse.json({
      total,
      active,
      pending,
      pendingSignature, // untuk badge sidebar
      pendingApproval,
      overdue,
    });
  } catch (error) {
    console.error("GET /api/user/transactions/summary error:", error);
    return NextResponse.json({ error: "Failed to fetch summary" }, { status: 500 });
  }
}
