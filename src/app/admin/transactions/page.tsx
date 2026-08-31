import { db } from "@/db";
import { transactions, items, transactionItems } from "@/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
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

  // Untuk transaksi yang itemName null (multi-item), ambil nama dari transactionItems
  const nullNameIds = data.filter((tx) => !tx.itemName).map((tx) => tx.id);

  let multiItemNames: Record<number, string> = {};
  if (nullNameIds.length > 0) {
    const rows = await db
      .select({
        transactionId: transactionItems.transactionId,
        itemName: items.name,
        quantity: transactionItems.quantity,
      })
      .from(transactionItems)
      .leftJoin(items, eq(transactionItems.itemId, items.id))
      .where(sql`${transactionItems.transactionId} IN (${sql.join(nullNameIds.map(id => sql`${id}`), sql`, `)})`);

    // Kelompokkan per transactionId, ambil nama pertama + jumlah item
    const grouped: Record<number, { names: string[]; total: number }> = {};
    for (const r of rows) {
      if (!grouped[r.transactionId]) grouped[r.transactionId] = { names: [], total: 0 };
      if (r.itemName) grouped[r.transactionId].names.push(r.itemName);
      grouped[r.transactionId].total++;
    }

    for (const [txId, val] of Object.entries(grouped)) {
      const first = val.names[0] || "Barang";
      multiItemNames[Number(txId)] = val.total > 1
        ? `${first} +${val.total - 1} lainnya`
        : first;
    }
  }

  // Merge nama multi-item ke data
  const mergedData = data.map((tx) => ({
    ...tx,
    itemName: tx.itemName || multiItemNames[tx.id] || "Barang",
  }));

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <TransactionsClient
        transactions={mergedData}
        currentStatus={statusFilter}
      />
    </div>
  );
}
