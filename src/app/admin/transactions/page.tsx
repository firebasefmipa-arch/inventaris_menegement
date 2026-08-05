import { db } from "@/db";
import { transactions, items } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { TransactionsClient } from "./TransactionsClient";

export const dynamic = "force-dynamic";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const statusFilter = status || "";

  const conditions = [];
  if (statusFilter) {
    conditions.push(
      eq(transactions.status, statusFilter as "pending_signature" | "pending_approval" | "active" | "returned" | "overdue" | "rejected")
    );
  }

  const data = await db
    .select({
      id: transactions.id,
      itemId: transactions.itemId,
      quantity: transactions.quantity,
      status: transactions.status,
      signedDocumentUrl: transactions.signedDocumentUrl,
      borrowDate: transactions.borrowDate,
      expectedReturnDate: transactions.expectedReturnDate,
      actualReturnDate: transactions.actualReturnDate,
      notes: transactions.notes,
      rejectionReason: transactions.rejectionReason,
      createdAt: transactions.createdAt,
      itemName: items.name,
      itemCategory: items.category,
      borrowerName: transactions.borrowerName,
      borrowerDepartment: transactions.borrowerDepartment,
    })
    .from(transactions)
    .leftJoin(items, eq(transactions.itemId, items.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(transactions.createdAt)) as any[];

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <TransactionsClient
        transactions={data}
        currentStatus={statusFilter}
      />
    </div>
  );
}
