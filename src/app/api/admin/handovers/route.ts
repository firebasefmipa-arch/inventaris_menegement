import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { handovers, handoverItems, items, users } from "@/db/schema";
import { eq, desc, inArray, and, gte, sql } from "drizzle-orm";
import { namaSql } from "@/lib/item-snapshot";
import { auth } from "@/auth";
import { jsonBody } from "@/lib/json-body";
import { batasUnit, periksaAksesUnit } from "@/lib/akses-unit";
import { bacaKeranjang, pecahPerUnit, pesanKeranjangTidakValid, type Keranjang } from "@/lib/pecah-unit";
import { unitCode } from "@/lib/units";
import { generateHandoverPDF } from "@/lib/handover-pdf-generator";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { uploadPath, uploadPathFromUrl } from "@/lib/upload-dir";

// GET /api/admin/handovers — daftar semua serah terima (admin)
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user || (role !== "admin" && role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const conditions = status ? [eq(handovers.status, status as any)] : [];

    // Admin hanya melihat pecahan dari unit yang ditugaskannya; superadmin
    // melihat semua. Barang tanpa unit hanya muncul untuk superadmin.
    const batas = await batasUnit(session);
    if (batas !== null) {
      conditions.push(batas.length > 0 ? inArray(handovers.unit, batas) : sql`1 = 0`);
    }

    const hvList = await db
      .select({
        id: handovers.id,
        userId: handovers.userId,
        receiverName: handovers.receiverName,
        receiverNim: handovers.receiverNim,
        unitName: handovers.unitName,
        department: handovers.department,
        phone: handovers.phone,
        purpose: handovers.purpose,
        notes: handovers.notes,
        signedDocumentUrl: handovers.signedDocumentUrl,
        status: handovers.status,
        rejectionReason: handovers.rejectionReason,
        handoverDate: handovers.handoverDate,
        createdAt: handovers.createdAt,
      })
      .from(handovers)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(handovers.createdAt));

    if (hvList.length === 0) return NextResponse.json([]);

    const hvIds = hvList.map((h) => h.id);

    const hvItemRows = await db
      .select({
        handoverId: handoverItems.handoverId,
        itemId: handoverItems.itemId,
        quantity: handoverItems.quantity,
        notes: handoverItems.notes,
        itemName: namaSql(items.name, handoverItems.itemName),
        itemCategory: items.category,
        itemInventoryNumber: items.inventoryNumber,
        itemAssetNumber: items.assetNumber,
      })
      .from(handoverItems)
      .leftJoin(items, eq(handoverItems.itemId, items.id))
      .where(inArray(handoverItems.handoverId, hvIds));

    const itemsByHv = new Map<number, typeof hvItemRows>();
    for (const row of hvItemRows) {
      const existing = itemsByHv.get(row.handoverId) ?? [];
      existing.push(row);
      itemsByHv.set(row.handoverId, existing);
    }

    const result = hvList.map((hv) => {
      const hvItems = itemsByHv.get(hv.id) ?? [];
      // File dokumen hilang dari disk? (URL ada di DB tapi file tidak ditemukan)
      let documentMissing = false;
      if (hv.signedDocumentUrl && hv.signedDocumentUrl !== "deleted") {
        const filePath = uploadPathFromUrl(hv.signedDocumentUrl);
        documentMissing = !existsSync(filePath);
      }
      return {
        ...hv,
        itemName: hvItems[0]?.itemName ?? null,
        items: hvItems,
        documentMissing,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/admin/handovers error:", error);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

// POST /api/admin/handovers — admin buat serah terima manual (langsung completed)
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user || (role !== "admin" && role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await jsonBody(req);
    if (!body) return NextResponse.json({ error: "Body permintaan tidak valid" }, { status: 400 });
    const { cart, receiverName, receiverNim, unitName, department, phone, location, purpose, notes } = body;

    if (!receiverName?.trim() || !department?.trim()) {
      return NextResponse.json(
        { error: "Nama penerima dan divisi/prodi wajib diisi" },
        { status: 400 }
      );
    }

    if (!purpose?.trim()) {
      return NextResponse.json(
        { error: "Keperluan wajib diisi" },
        { status: 400 }
      );
    }

    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return NextResponse.json({ error: "Pilih minimal satu barang" }, { status: 400 });
    }

    // Jumlah dari klien diperiksa DULU — jangan sampai angka ngawur
    // (0, negatif, 2.5, "abc") diam-diam dibetulkan jadi 1 oleh bacaKeranjang.
    const pesanKeranjang = pesanKeranjangTidakValid(cart);
    if (pesanKeranjang) return NextResponse.json({ error: pesanKeranjang }, { status: 400 });

    const cartItems: Keranjang[] = bacaKeranjang(cart);

    const itemIds = cartItems.map((c) => c.itemId);
    const dbItems = await db.select().from(items).where(inArray(items.id, itemIds));
    const itemMap = new Map(dbItems.map((i) => [i.id, i]));

    for (const c of cartItems) {
      const dbItem = itemMap.get(c.itemId);
      if (!dbItem) {
        return NextResponse.json({ error: `Barang ID ${c.itemId} tidak ditemukan` }, { status: 404 });
      }
      if (dbItem.availableQuantity < c.quantity) {
        return NextResponse.json(
          { error: `Stok "${dbItem.name}" tidak mencukupi. Tersisa ${dbItem.availableQuantity} unit.` },
          { status: 400 }
        );
      }
      if (!dbItem.canHandover) {
        return NextResponse.json(
          { error: `Barang "${dbItem.name}" tidak tersedia untuk diserahterimakan.` },
          { status: 400 }
        );
      }
      // Admin hanya boleh menyerahkan barang dari unit yang ditugaskan padanya.
      const tolak = await periksaAksesUnit(session, dbItem.unit);
      if (tolak) {
        return NextResponse.json(
          { error: `${tolak.pesan} (barang "${dbItem.name}")` },
          { status: tolak.status }
        );
      }
    }

    // ── Pecah per unit ──
    // Konsisten dengan pengajuan serah terima dari user: satu penyerahan yang
    // memuat barang dari beberapa unit jadi beberapa baris, supaya tiap admin
    // unit hanya melihat bagiannya. Di jalur admin statusnya langsung selesai,
    // jadi tidak ada persetujuan yang perlu dipecah.
    const grupId = crypto.randomUUID();
    const grup = pecahPerUnit(cartItems, new Map(dbItems.map((i) => [i.id, i.unit])));

    const dibuat: { id: number; unit: string; cart: Keranjang[] }[] = [];
    for (const [unit, isiGrup] of grup) {
      const [{ id: hvId }] = await db
        .insert(handovers)
        .values({
          userId: null,
          grupId,
          unit: unit || null,
          receiverName: receiverName.trim(),
          receiverNim: receiverNim?.trim() || null,
          unitName: unitName?.trim() || null,
          department: department.trim(),
          phone: phone?.trim() || null,
          location: location?.trim() || null,
          purpose: purpose.trim(),
          notes: notes?.trim() || null,
          status: "completed",
        })
        .$returningId();

      await db.insert(handoverItems).values(
        isiGrup.map((c) => ({
          handoverId: hvId,
          itemId: c.itemId,
          quantity: c.quantity,
          notes: c.notes || null,
          itemName: itemMap.get(c.itemId)?.name ?? null,
          itemCode: itemMap.get(c.itemId)?.itemCode ?? null,
          itemInventoryNumber: itemMap.get(c.itemId)?.inventoryNumber ?? null,
        }))
      );

      // Kurangi stok permanen — ATOMIK. Syarat "stok cukup" diletakkan di WHERE,
      // jadi dua permintaan yang datang bersamaan tidak bisa sama-sama lolos:
      // yang kalah mendapat 0 baris terpengaruh dan request-nya dibatalkan.
      for (const c of isiGrup) {
        const hasil = await db
          .update(items)
          .set({
            quantity: sql`${items.quantity} - ${c.quantity}`,
            availableQuantity: sql`${items.availableQuantity} - ${c.quantity}`,
            status: sql`CASE WHEN ${items.availableQuantity} - ${c.quantity} <= 0 THEN 'borrowed' ELSE 'available' END`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(items.id, c.itemId),
              gte(items.quantity, c.quantity),
              gte(items.availableQuantity, c.quantity)
            )
          );

        const data = (Array.isArray(hasil) ? hasil[0] : hasil) as unknown as { affectedRows?: number };
        if (Number(data?.affectedRows ?? 0) === 0) {
          // Kalah balapan / stok berubah → batalkan SEMUA pecahan yang dibuat.
          const ids = [...dibuat.map((d) => d.id), hvId];
          await db.delete(handoverItems).where(inArray(handoverItems.handoverId, ids));
          await db.delete(handovers).where(inArray(handovers.id, ids));
          return NextResponse.json(
            {
              error: `Stok "${itemMap.get(c.itemId)?.name}" tidak lagi mencukupi — mungkin baru diambil permintaan lain. Coba lagi.`,
            },
            { status: 409 }
          );
        }
      }

      dibuat.push({ id: hvId, unit, cart: isiGrup });
    }

    // Auto-generate PDF per pecahan dan simpan ke disk
    for (const bagian of dibuat) {
      try {
        const pdfBuffer = await generateHandoverPDF({
          receiverName: receiverName.trim(),
          receiverNim: receiverNim?.trim() || "",
          unitName: unitName?.trim() || "",
          department: department.trim(),
          phone: phone?.trim() || "",
          location: location?.trim() || "",
          purpose: purpose.trim(),
          notes: notes?.trim() || "",
          handoverDate: new Date(),
          items: bagian.cart.map((c) => ({
            name: itemMap.get(c.itemId)?.name || "Barang",
            quantity: c.quantity,
            assetNumber: itemMap.get(c.itemId)?.assetNumber ?? null,
            itemCode: itemMap.get(c.itemId)?.itemCode ?? null,
            inventoryNumber: itemMap.get(c.itemId)?.inventoryNumber ?? null,
          })),
        });

        const receiverSafe = receiverName.trim()
          .replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_").slice(0, 40);
        const now = new Date();
        const dateStr = `${String(now.getDate()).padStart(2, "0")}${String(now.getMonth() + 1).padStart(2, "0")}${now.getFullYear()}`;
        const kodeUnit = bagian.unit ? unitCode(bagian.unit) : "LAIN";
        const filename = `ST_${receiverSafe}_${dateStr}_${bagian.id}_${kodeUnit}.pdf`;

        const uploadDir = uploadPath("handovers");
        await mkdir(uploadDir, { recursive: true });
        await writeFile(path.join(uploadDir, filename), pdfBuffer);

        await db
          .update(handovers)
          .set({ signedDocumentUrl: `/uploads/handovers/${filename}` })
          .where(eq(handovers.id, bagian.id));
      } catch (pdfErr) {
        console.error("Auto-generate handover PDF error:", pdfErr);
        // Tidak gagalkan request jika PDF error
      }
    }

    const ringkas = dibuat.map((b) => ({
      id: b.id,
      code: `ST-${String(b.id).padStart(4, "0")}`,
      unit: b.unit || null,
    }));

    return NextResponse.json({
      grupId,
      pecahan: ringkas.map((r) => ({ id: r.id, code: r.code, unit: r.unit })),
      // Bentuk lama dipertahankan agar tampilan lama tidak langsung rusak.
      id: ringkas[0]?.id ?? null,
      code: ringkas[0]?.code ?? null,
      pdfUrl: null,
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/handovers error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan" }, { status: 500 });
  }
}
