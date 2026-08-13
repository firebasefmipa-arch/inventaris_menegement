import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { handovers, handoverItems, items } from "@/db/schema";
import { eq } from "drizzle-orm";
import HandoverUploadForm from "./HandoverUploadForm";
import Link from "next/link";
import { ArrowLeft, Package, CheckCircle2 } from "lucide-react";

export default async function HandoverUploadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const hvId = parseInt(id, 10);
  if (isNaN(hvId)) redirect("/dashboard/riwayat");

  const [hv] = await db.select().from(handovers).where(eq(handovers.id, hvId)).limit(1);

  const role = (session.user as any)?.role;
  if (!hv || (hv.userId !== session.user.id && role !== "admin" && role !== "super_admin")) {
    redirect("/dashboard/riwayat");
  }

  const hvItemRows = await db
    .select({
      quantity: handoverItems.quantity,
      itemName: items.name,
      itemCategory: items.category,
      inventoryNumber: items.inventoryNumber,
      assetNumber: items.assetNumber,
    })
    .from(handoverItems)
    .leftJoin(items, eq(handoverItems.itemId, items.id))
    .where(eq(handoverItems.handoverId, hvId));

  if (hv.status !== "pending_signature" && hv.status !== "pending_approval") {
    const statusLabel: Record<string, string> = {
      completed: "Serah Terima Selesai",
      rejected: "Ditolak",
    };
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-teal-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">
            {statusLabel[hv.status] || "Status Tidak Valid"}
          </h2>
          <p className="text-sm text-gray-500">Dokumen tidak perlu diupload untuk status ini.</p>
          <Link href="/dashboard/riwayat"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-xl text-sm font-semibold hover:bg-teal-700 transition-colors">
            Lihat Riwayat
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <Link href="/dashboard/riwayat"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Riwayat
        </Link>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900">Lengkapi Dokumen</h1>
              <p className="text-sm text-gray-500 mt-1">
                Kode:{" "}
                <span className="font-bold text-gray-800">
                  ST-{String(hv.id).padStart(4, "0")}
                </span>
              </p>
            </div>
            <span className="shrink-0 text-xs font-semibold px-3 py-1.5 bg-teal-100 text-teal-700 border border-teal-200 rounded-full">
              {hv.status === "pending_signature" ? "Menunggu Dokumen" : "Menunggu Persetujuan"}
            </span>
          </div>

          {hvItemRows.length > 0 && (
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
                <Package className="w-4 h-4 text-gray-500" />
                <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                  Barang yang Diminta ({hvItemRows.length} jenis)
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {hvItemRows.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between px-4 py-3 gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{item.itemName || "Barang"}</p>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                        {item.itemCategory && <span>{item.itemCategory}</span>}
                        {(item.assetNumber || item.inventoryNumber) && (
                          <span className="text-gray-400">#{item.assetNumber || item.inventoryNumber}</span>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-bold text-gray-900">×{item.quantity}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <HandoverUploadForm handoverId={hv.id} currentStatus={hv.status} />
        </div>
      </div>
    </div>
  );
}
