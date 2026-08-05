import { NextRequest, NextResponse } from "next/server";
// @ts-ignore
import { read, utils } from "xlsx";
import { db } from "@/db";
import { items } from "@/db/schema";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "File tidak ditemukan" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const workbook = read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) {
      return NextResponse.json({ error: "Sheet pertama tidak ditemukan" }, { status: 400 });
    }

    const parsed = utils.sheet_to_json<Record<string, string | number | null>>(sheet, {
      defval: null,
      raw: false,
    });

    const newItems: Array<{
      name: string;
      category: string;
      description?: string | null;
      sn?: string | null;
      inventoryNumber?: string | null;
      assetNumber?: string | null;
      lastCheckDate?: string | null;
      condition?: string | null;
      quantity: number;
      location?: string | null;
      imageUrl?: string | null;
    }> = [];

    for (const row of parsed) {
      // normalize keys to make matching robust for headers like "Nama Barang", "Spesifikasi", "No. Inv DTI"
      const norm: Record<string, any> = {};
      for (const k in row) {
        const nk = String(k).toLowerCase().replace(/\s+|\.|\-/g, "").replace(/_/g, "");
        norm[nk] = row[k];
      }

      const name = (norm["namabarang"] || norm["nama"] || norm["name"] || "").toString().trim();
      const categoryGuess = (norm["kategori"] || norm["category"] || null);
      const spesifikasi = (norm["spesifikasi"] || norm["deskripsi"] || norm["description"] || null)
        ? String(norm["spesifikasi"] || norm["deskripsi"] || norm["description"]).trim()
        : null;
      const sn = norm["sn"] ? String(norm["sn"]).trim() : null;
      const noInv = norm["noinvdti"] ? String(norm["noinvdti"]).trim() : null;
      const noAsset = norm["noasset"] ? String(norm["noasset"]).trim() : null;
      const tanggalCek = norm["tanggalcek"] ? String(norm["tanggalcek"]).trim() : null;
      const kondisi = norm["kondisi"] ? String(norm["kondisi"]).trim() : null;
      const quantityRaw = norm["jumlah"] ?? norm["quantity"] ?? 1;
      const location = norm["lokasi"] ? String(norm["lokasi"]).trim() : null;

      const quantity = Number(quantityRaw) || 1;

      if (!name) continue;

      const category = categoryGuess ? String(categoryGuess).trim() : (name.split(" ")[0] || "Umum");

      const description = spesifikasi;

      newItems.push({
        name,
        category,
        description,
        sn,
        inventoryNumber: noInv,
        assetNumber: noAsset,
        lastCheckDate: tanggalCek,
        condition: kondisi,
        quantity,
        location,
        imageUrl: null,
      });
    }

    if (!newItems.length) {
      return NextResponse.json({ error: "Tidak ada data yang valid dalam file" }, { status: 400 });
    }

    await db.insert(items).values(
      newItems.map((item) => ({
        name: item.name,
        category: item.category,
        description: item.description || null,
        sn: item.sn || null,
        inventoryNumber: item.inventoryNumber || null,
        assetNumber: item.assetNumber || null,
        lastCheckDate: item.lastCheckDate || null,
        condition: item.condition || null,
        imageUrl: item.imageUrl || null,
        quantity: item.quantity,
        availableQuantity: item.quantity,
        location: item.location || null,
        status: "available" as const,
      }))
    );

    return NextResponse.json({ importedCount: newItems.length });
  } catch (error) {
    console.error("POST /api/items/import error:", error);
    return NextResponse.json({ error: "Gagal mengimpor file" }, { status: 500 });
  }
}
