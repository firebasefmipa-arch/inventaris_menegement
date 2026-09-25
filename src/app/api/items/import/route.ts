import { NextRequest, NextResponse } from "next/server";
// @ts-ignore
import { read, utils } from "xlsx";
import { db } from "@/db";
import { items } from "@/db/schema";
import { auth } from "@/auth";
import { LOCATION_CODES, normalizeLocation, lokasiMirip } from "@/lib/locations";
import { normalizeUnit, unitDikenal } from "@/lib/units";
import { batasUnit } from "@/lib/akses-unit";
import { resolvePrefix, nextSequence, formatCode, catatKodeMassal } from "@/lib/item-code";
import { IMPORT_COLUMNS, normalizeHeader, pickColumn } from "@/lib/item-import";
import { formDataAman } from "@/lib/json-body";
import { rapikanKondisi, bolehJalan } from "@/lib/kondisi";

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

    // Unit-unit yang dikelola admin ini; null = superadmin (semua unit).
    const batas = await batasUnit(session);
    let dilewatiUnit = 0;

    const formData = await formDataAman(request);
    if (!formData) {
      return NextResponse.json({ error: "Berkas tidak ditemukan" }, { status: 400 });
    }
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

    // raw: true → ambil NILAI selnya, bukan tampilan di layar.
    // Nomor inventaris UII 12 digit (409010025366) ditampilkan Excel sebagai
    // "4.0901E+11" kalau dibaca sebagai teks — angkanya rusak. Nilai mentah
    // tetap utuh karena selnya bertipe angka.
    const parsed = utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
      raw: true,
    });

    // Ambil teks tanpa merusak angka panjang: 409010025366 → "409010025366",
    // bukan "4.0901E+11". Number() dikembalikan ke String() utuh.
    const keTeks = (v: unknown): string | null => {
      if (v === null || v === undefined) return null;
      if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
      const s = String(v).trim();
      return s || null;
    };

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
      unit?: string | null;
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

      const teks = (nama: string) => keTeks(pickColumn(norm, col(nama)));

      const name = teks("Nama Barang");
      if (!name) {
        skippedRows++;
        continue;
      }

      const category = teks("Kategori") || name.split(" ")[0] || "Umum";

      const inventoryNumber = teks("No. Inv DTI");
      const sn = teks("SN");

      // ── Unit: penentu KODE BARANG ──
      // Harus ada di daftar resmi. Kalau tidak, kode memakai "LAIN" dan
      // barisnya diberi peringatan supaya bisa dibetulkan.
      const unitRaw = teks("Unit");
      const unit = normalizeUnit(unitRaw);
      if (unitRaw && !unitDikenal(unitRaw)) {
        warnings.push(
          `Baris ${barisKe} ("${name}"): unit "${unitRaw}" tidak ada di daftar unit — ` +
          `kode barang memakai "LAIN". Perbaiki ejaannya atau minta Super Admin menambahkannya.`
        );
      } else if (!unitRaw) {
        warnings.push(
          `Baris ${barisKe} ("${name}"): kolom "Unit" kosong — kode barang memakai "LAIN" ` +
          `dan hanya Super Admin yang bisa mengelolanya.`
        );
      }
      // Lokasi: tempat/ruangan, bebas diketik → hanya dirapikan kapitalisasinya.
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

      // Kode dari file Excel DIABAIKAN — selalu di-generate ulang dari UNIT.
      const { prefix, unit: unitFinal } = await resolvePrefix(unit);

      // ── Batas unit ──
      // Admin hanya boleh mengimpor barang untuk unit yang dikelolanya. Baris
      // milik unit lain DILEWATI (bukan membatalkan seluruh berkas) supaya satu
      // berkas bersama tetap bisa dipakai tanpa saling merusak.
      if (batas !== null) {
        const target = normalizeUnit(unitFinal);
        const boleh = !!target && batas.some((u) => normalizeUnit(u) === target);
        if (!boleh) {
          warnings.push(
            `Baris ${barisKe} ("${name}"): unit "${unitRaw || "(kosong)"}" bukan unit yang Anda kelola — baris dilewati.`
          );
          dilewatiUnit++;
          continue;
        }
      }
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
        condition: rapikanKondisi(teks("Kondisi")),
        quantity,
        unit: unitFinal || null,
        location: normalizeLocation(location || "") || null,
        imageUrl: null,
      });
    }

    if (!newItems.length) {
      const sebab = [
        skippedRows ? `${skippedRows} baris dilewati karena kolom "Nama Barang" kosong` : "",
        duplicates.length ? `${duplicates.length} baris duplikat` : "",
        dilewatiUnit ? `${dilewatiUnit} baris bukan unit Anda` : "",
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
        // Hanya "Baik" yang boleh dipinjam/diserahterimakan. Barang hasil impor
        // tanpa kondisi (atau teks "Kondisi" yang tak dikenali) tetap MASUK,
        // tapi langsung terkunci dan bertanda "data tidak lengkap" di kartu
        // admin — tidak hilang diam-diam dari pandangan.
        canBorrow: bolehJalan(item.condition),
        canHandover: bolehJalan(item.condition),
        imageUrl: item.imageUrl || null,
        quantity: item.quantity,
        availableQuantity: item.quantity,
        unit: item.unit || null,
        location: item.location || null,
        status: "available" as const,
      }))
    );

    // Catat semua kode yang baru dibuat ke buku register — supaya nomornya
    // terkunci walau barangnya kelak dihapus.
    await catatKodeMassal(
      newItems.map((i) => i.itemCode).filter((k): k is string => !!k),
      "impor"
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
