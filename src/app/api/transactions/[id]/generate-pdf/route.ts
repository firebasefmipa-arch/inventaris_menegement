import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, transactionItems, items, users } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { generateBorrowingPDF } from "@/lib/pdf-generator";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { id } = await params;
    const txId = parseInt(id, 10);
    if (isNaN(txId)) return new NextResponse("Invalid ID", { status: 400 });

    // Ambil transaksi utama
    const [tx] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, txId))
      .limit(1);

    if (!tx) return new NextResponse("Transaction not found", { status: 404 });

    const role = (session.user as any)?.role;
    if (tx.userId !== session.user.id && role !== "admin" && role !== "super_admin") {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    // Ambil semua item dalam transaksi ini
    const txItemRows = await db
      .select({
        itemId: transactionItems.itemId,
        quantity: transactionItems.quantity,
        notes: transactionItems.notes,
        itemName: items.name,
        inventoryNumber: items.inventoryNumber,
      })
      .from(transactionItems)
      .leftJoin(items, eq(transactionItems.itemId, items.id))
      .where(eq(transactionItems.transactionId, txId));

    // Fallback: jika transaction_items kosong tapi itemId lama masih ada
    let pdfItems: { name: string; quantity: number; inventoryNumber?: string | null; notes?: string }[] = [];

    if (txItemRows.length > 0) {
      pdfItems = txItemRows.map((r) => ({
        name: r.itemName || "Barang",
        quantity: r.quantity,
        inventoryNumber: r.inventoryNumber,
        notes: r.notes || "",
      }));
    } else if (tx.itemId) {
      // Legacy single-item
      const [item] = await db.select().from(items).where(eq(items.id, tx.itemId)).limit(1);
      if (item) {
        pdfItems = [{
          name: item.name,
          quantity: tx.quantity,
          inventoryNumber: item.inventoryNumber,
          notes: "",
        }];
      }
    }

    if (pdfItems.length === 0) {
      return new NextResponse("No items found for this transaction", { status: 404 });
    }

    // Ambil nim dari tabel user jika userId tersedia
    let nimValue = "";
    if (tx.userId) {
      const [txUser] = await db
        .select({ nim: users.nim })
        .from(users)
        .where(eq(users.id, tx.userId))
        .limit(1);
      nimValue = txUser?.nim || "";
    }

    const pdfBuffer = await generateBorrowingPDF({
      borrowerName: tx.borrowerName,
      borrowerId: nimValue,
      department: tx.borrowerDepartment || "",
      phone: tx.borrowerPhone || "",
      purpose: tx.purpose || "",
      notes: tx.notes || "",
      borrowDate: tx.borrowDate,
      returnDate: tx.expectedReturnDate,
      items: pdfItems,
    });

    return new NextResponse(pdfBuffer as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Formulir_Peminjaman_PB-${String(txId).padStart(4, "0")}.pdf"`,
      },
    });
  } catch (error) {
    console.error("PDF generation error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
