import { NextRequest, NextResponse } from "next/server";
// @ts-ignore
import { read, utils } from "xlsx";
import { db } from "@/db";
import { items } from "@/db/schema";
import { auth } from "@/auth";
import { resolvePrefix, nextSequence, formatCode } from "@/lib/item-code";
import { IMPORT_COLUMNS, normalizeHeader, pickColumn } from "@/lib/item-import";

/**
 * Kunci identitas barang untuk mendeteksi duplikat.
 *
 * Urutan prioritas: No. Inv DTI (paling unik) → SN → Nama + Lokasi.
 * Dinormalisasi huruf kecil & spasi berlebih supaya " Laptop 10 " dan
 * "laptop 10" dianggap sama.
 */
function kunciBarang(nama: string, inventoryNumber: string | null, sn: string | null, lokasi: string | null): string {
  const bersih = (v: string | null) => (v || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (inventoryNumber) return `inv:${bersih(inventoryNumber)}`;
  if (sn) return `sn:${bersih(sn)}`;
  return `nama:${bersih(nama)}|${bersih(lokasi)}`;
}

/**
 * Impor barang dari Excel/CSV.
 *
 * Nama kolom yang diterima ada di `src/lib/item-import.ts` (sumber yang sama
 * dengan template unduhan). Kode barang dari file SELALU diabaikan — dibuat
 * ulang di server.
 *
 * Barang yang sudah ada di database (atau kembar di dalam file yang sama)
 * DILEWATI, tidak diimpor ulang.
 *
 * Balasan:
 *   { importedCount, skippedRows, duplicateRows, duplicates[], warnings[] }
 * `skippedRows` = baris tanpa nama (tidak bisa dibuatkan barang).
 * `warnings[]`  = baris yang tetap masuk tapi ada kolom bermasalah.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user || (role !== "admin" && role !== "super_admin"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

    const parsed = utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
      raw: false,
    });

    const col = (nama: string) =>
      IMPORT_COLUMNS.find((c) => c.header === nama)!.aliases;

    const newItems: Array<{
      name: string;
      category: string;
      description?: string | null;
      sn?: string | null;
      itemCode?: string | null;
      inventoryNumber?: string | null;
      assetNumber?: string | null;
      lastCheckDate?: string | null;
      condition?: string | null;
      quantity: number;
      location?: string | null;
      imageUrl?: string | null;
    }> = [];

    const warnings: string[] = [];
    let skippedRows = 0;
    let barisKe = 1; // baris 1 = header

    // Kunci identitas barang yang SUDAH ada di database.
    const existing = await db
      .select({
        name: items.name,
        inventoryNumber: items.inventoryNumber,
        sn: items.sn,
        location: items.location,
      })
      .from(items);
    const kunciAda = new Set(
      existing.map((e) => kunciBarang(e.name, e.inventoryNumber, e.sn, e.location))
    );

    // Kunci yang sudah dipakai baris sebelumnya DI FILE INI, supaya file
    // dengan baris kembar tak menggandakan barang.
    const kunciFile = new Set<string>();
    const duplicates: string[] = [];

    // Penomoran per lokasi, dihitung sekali lalu ditambah di memori
    // supaya barang dalam satu file tidak berebut nomor yang sama.
    const seqCache = new Map<string, number>();
    const year = new Date().getFullYear();

    for (const row of parsed) {
      barisKe++;

      // Normalisasi nama kolom: "No. Inv DTI" -> "noinvdti"
      const norm: Record<string, unknown> = {};
      for (const k in row) norm[normalizeHeader(k)] = row[k];

      const teks = (nama: string) => {
        const v = pickColumn(norm, col(nama));
        return v === null ? null : String(v).trim() || null;
      };

      const name = teks("Nama Barang");
      if (!name) {
        skippedRows++;
        continue;
      }

      const category = teks("Kategori") || name.split(" ")[0] || "Umum";

      const inventoryNumber = teks("No. Inv DTI");
      const sn = teks("SN");
      const location = teks("Lokasi");

      // Duplikat: sudah ada di database, atau kembar di file ini.
      const kunci = kunciBarang(name, inventoryNumber, sn, location);
      if (kunciAda.has(kunci) || kunciFile.has(kunci)) {
        duplicates.push(`Baris ${barisKe}: "${name}" sudah ada — dilewati.`);
        continue;
      }
      kunciFile.add(kunci);

      // Jumlah harus bilangan bulat >= 1; kalau tidak, kembali ke 1 + peringatan
      const jumlahRaw = teks("Jumlah");
      let quantity = 1;
      if (jumlahRaw !== null) {
        const n = Number(jumlahRaw);
        if (Number.isInteger(n) && n > 0) {
          quantity = n;
        } else {
          warnings.push(`Baris ${barisKe} ("${name}"): Jumlah "${jumlahRaw}" bukan bilangan bulat positif — dipakai 1.`);
        }
      }

      // Kode dari file Excel DIABAIKAN — selalu di-generate ulang.
      const { prefix, location: normalizedLocation } = await resolvePrefix(location);
      let seq = seqCache.get(prefix);
      if (seq === undefined) seq = await nextSequence(prefix, year);
      seqCache.set(prefix, seq + 1);

      newItems.push({
        name,
        category,
        description: teks("Spesifikasi"),
        sn,
        itemCode: formatCode(prefix, year, seq),
        inventoryNumber,
        assetNumber: teks("No. Asset"),
        lastCheckDate: teks("Tanggal Cek"),
        condition: teks("Kondisi"),
        quantity,
        location: normalizedLocation,
        imageUrl: null,
      });
    }

    if (!newItems.length) {
      const sebab = [
        skippedRows ? `${skippedRows} baris dilewati karena kolom "Nama Barang" kosong` : "",
        duplicates.length ? `${duplicates.length} baris duplikat` : "",
      ].filter(Boolean).join(", ");
      return NextResponse.json(
        {
          error: sebab
            ? `Tidak ada barang baru untuk diimpor: ${sebab}. Pastikan nama kolom di baris pertama file sama dengan template.`
            : "Tidak ada data yang valid dalam file",
          skippedRows,
          duplicateRows: duplicates.length,
          duplicates,
        },
        { status: 400 }
      );
    }

    await db.insert(items).values(
      newItems.map((item) => ({
        name: item.name,
        category: item.category,
        description: item.description || null,
        sn: item.sn || null,
        itemCode: item.itemCode,
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

    return NextResponse.json({
      importedCount: newItems.length,
      skippedRows,
      duplicateRows: duplicates.length,
      duplicates,
      warnings,
    });
  } catch (error) {
    console.error("POST /api/items/import error:", error);
    return NextResponse.json({ error: "Gagal mengimpor file" }, { status: 500 });
  }
}
