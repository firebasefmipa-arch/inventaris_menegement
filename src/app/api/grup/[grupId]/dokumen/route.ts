import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, handovers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/auth";
import { gabungPdfDariUrl } from "@/lib/penggabung-pdf";
import { unitDikelola, bolehKelolaUnit } from "@/lib/akses-unit";

/**
 * Dokumen gabungan untuk satu kelompok pengajuan.
 *
 * Kenapa endpoint terpisah, bukan menggabung di berkas aslinya: dokumen tiap
 * pecahan tetap disimpan sendiri-sendiri karena tiap admin unit menyetujui
 * bagiannya masing-masing (dan bisa menolaknya). Yang digabung hanya saat
 * peminjam membukanya.
 *
 * GET /api/grup/[grupId]/dokumen?jenis=transaksi|serah-terima
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ grupId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { grupId } = await params;
    if (!grupId) return NextResponse.json({ error: "Grup tidak valid" }, { status: 400 });

    const { searchParams } = new URL(request.url);
    const jenis = searchParams.get("jenis") === "serah-terima" ? "serah-terima" : "transaksi";

    const role = (session.user as any).role;
    const bolehSemua = role === "super_admin";

    let urls: (string | null)[] = [];
    let nama = "dokumen-gabungan";
    let unitPecahan: (string | null)[] = [];
    let pemilikId: string | null = null;

    if (jenis === "transaksi") {
      const baris = await db
        .select({
          id: transactions.id,
          userId: transactions.userId,
          signedDocumentUrl: transactions.signedDocumentUrl,
          borrowerName: transactions.borrowerName,
          unit: transactions.unit,
        })
        .from(transactions)
        .where(eq(transactions.grupId, grupId))
        .orderBy(transactions.id);

      if (baris.length === 0) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });
      unitPecahan = baris.map((b) => b.unit);
      pemilikId = baris[0].userId;
      urls = baris.map((b) => b.signedDocumentUrl);
      nama = `PB_${(baris[0].borrowerName || "Peminjam").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30)}_gabungan`;
    } else {
      const baris = await db
        .select({
          id: handovers.id,
          userId: handovers.userId,
          signedDocumentUrl: handovers.signedDocumentUrl,
          receiverName: handovers.receiverName,
          unit: handovers.unit,
        })
        .from(handovers)
        .where(eq(handovers.grupId, grupId))
        .orderBy(handovers.id);

      if (baris.length === 0) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });
      unitPecahan = baris.map((b) => b.unit);
      pemilikId = baris[0].userId;
      urls = baris.map((b) => b.signedDocumentUrl);
      nama = `ST_${(baris[0].receiverName || "Penerima").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30)}_gabungan`;
    }

    // ── Siapa yang boleh membuka ──
    // Pemiliknya sendiri, superadmin, atau admin yang mengelola SALAH SATU unit
    // di kelompok itu. Admin unit lain tidak boleh — dulu di sini cukup
    // "role === admin", sehingga admin unit mana pun bisa membuka dokumen
    // pengajuan orang lain.
    if (!bolehSemua && pemilikId !== session.user.id) {
      if (role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

      const daftar = (await unitDikelola(session.user.id)) ?? [];
      const boleh = unitPecahan.some((u) => bolehKelolaUnit(role, daftar, u));
      if (!boleh) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const pdf = await gabungPdfDariUrl(urls);
    if (!pdf) {
      return NextResponse.json(
        { error: "Dokumen belum tersedia. Mungkin masih menunggu persetujuan." },
        { status: 404 }
      );
    }

    const inline = searchParams.get("inline") === "1";
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${nama}.pdf"`,
      },
    });
  } catch (error) {
    console.error("GET dokumen gabungan error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan" }, { status: 500 });
  }
}
