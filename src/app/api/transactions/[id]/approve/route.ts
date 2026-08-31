import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, transactionItems, items } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { copyFile, mkdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user || (role !== "admin" && role !== "super_admin"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const txId = parseInt(id, 10);
    if (isNaN(txId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const body = await request.json();
    const { action, rejectionReason } = body;

    if (action !== "approve" && action !== "reject")
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    if (action === "reject" && (!rejectionReason || !rejectionReason.trim()))
      return NextResponse.json({ error: "Alasan penolakan wajib diisi" }, { status: 400 });

    const [tx] = await db.select().from(transactions).where(eq(transactions.id, txId));
    if (!tx) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    if (tx.status !== "pending_approval")
      return NextResponse.json({ error: "Transaction is not pending approval" }, { status: 400 });

    const newStatus = action === "approve" ? "active" : "rejected";

    if (action === "approve") {
      // Pindahkan PDF dari pending/ ke signed_forms/
      let finalPdfUrl = tx.signedDocumentUrl;
      if (tx.signedDocumentUrl?.startsWith("/uploads/pending/")) {
        try {
          const filename = path.basename(tx.signedDocumentUrl);
          const srcPath  = path.join(process.cwd(), "public", tx.signedDocumentUrl);
          const destDir  = path.join(process.cwd(), "public", "uploads", "signed_forms");
          const destPath = path.join(destDir, filename);

          await mkdir(destDir, { recursive: true });
          if (existsSync(srcPath)) {
            await copyFile(srcPath, destPath);
            await unlink(srcPath).catch(() => {});
          }
          finalPdfUrl = `/uploads/signed_forms/${filename}`;
        } catch (e) {
          console.error("Pindah PDF error:", e);
        }
      }

      await db.update(transactions).set({
        status: "active",
        signedDocumentUrl: finalPdfUrl,
      }).where(eq(transactions.id, txId));

    } else {
      // Reject — hapus PDF pending dan kembalikan stok
      if (tx.signedDocumentUrl?.startsWith("/uploads/pending/")) {
        const filePath = path.join(process.cwd(), "public", tx.signedDocumentUrl);
        if (existsSync(filePath)) await unlink(filePath).catch(() => {});
      }

      await db.update(transactions).set({
        status: "rejected",
        rejectionReason: rejectionReason.trim(),
      }).where(eq(transactions.id, txId));

      // Kembalikan stok
      const txItems = await db.select().from(transactionItems).where(eq(transactionItems.transactionId, txId));
      if (txItems.length > 0) {
        for (const txItem of txItems) {
          const [item] = await db.select().from(items).where(eq(items.id, txItem.itemId)).limit(1);
          if (item) {
            const newAvailable = item.availableQuantity + txItem.quantity;
            await db.update(items).set({
              availableQuantity: newAvailable,
              status: newAvailable > 0 ? "available" : "borrowed",
              updatedAt: new Date(),
            }).where(eq(items.id, item.id));
          }
        }
      } else if (tx.itemId) {
        const [item] = await db.select().from(items).where(eq(items.id, tx.itemId)).limit(1);
        if (item) {
          const newAvailable = item.availableQuantity + tx.quantity;
          await db.update(items).set({
            availableQuantity: newAvailable,
            status: newAvailable > 0 ? "available" : "borrowed",
            updatedAt: new Date(),
          }).where(eq(items.id, item.id));
        }
      }
    }

    return NextResponse.json({ success: true, status: newStatus });
  } catch (error) {
    console.error("Approve/Reject error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
