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
 * Semua kunci yang bisa dipakai mengenali sebuah baris.
 *
 * Dikembalikan SEMUANYA — bukan berhenti di kunci pertama yang ada — supaya
 * baris yang sama tetap ketahuan walau kolom isiannya beda (mis. satu baris
 * mengisi "No. Inv DTI" dan baris kembarnya tidak; dulu ini lolos jadi dua
 * barang).
 *
 * Dinormalisasi huruf kecil & spasi berlebih: " Laptop 10 " = "laptop 10".
 */
function kunciSemua(
  nama: string,
  inventoryNumber: string | null,
  sn: string | null,
  lokasi: string | null
): string[] {
  const bersih = (v: string | null) => (v || "").trim().toLowerCase().replace(/\s+/g, " ");
  const kunci: string[] = [];
  if (inventoryNumber) kunci.push(`inv:${bersih(inventoryNumber)}`);
  if (sn) kunci.push(`sn:${bersih(sn)}`);
  kunci.push(`nama:${bersih(nama)}|${bersih(lokasi)}`);
  return kunci;
}

/** Terjemahan kunci jadi kalimat, untuk ditampilkan ke pemakai. */
function jelasKunci(k: string): string {
  if (k.startsWith("inv:")) return "No. Inv sama";
  if (k.startsWith("sn:")) return "SN sama";
  return "nama & lokasi sama";
}

/**
 * Impor barang dari Excel/CSV.
 *
 * Nama kolom yang diterima ada di `src/lib/item-import.ts` (sumber yang sama
 * dengan template unduhan). Kode barang dari file SELALU diabaikan — dibuat
 * ulang di server.
 *
 * Dua langkah:
 *   POST = HITUNG SAJA. Membaca berkas, melaporkan apa yang akan terjadi,
 *          tanpa menulis apa pun ke database. Ini yang dipakai layar pratinjau.
 *   PUT  = SIMPAN. Membaca berkas lagi lalu menyimpan.
 *          `sertakanMirip` (form field) menentukan baris yang mirip dengan
 *          yang sudah ada IKUT masuk atau dilewati. Bawaannya DILEWATI
 *          (perilaku lama).
 *
 * Balasan:
 *   { importedCount, dibaca, skippedRows, duplicateRows, duplicates[],
 *     mirip[], warnings[] }
 * `dibaca`      = baris berisi nama yang terbaca dari berkas.
 * `skippedRows` = baris tanpa nama (tidak bisa dibuatkan barang).
 * `mirip[]`     = baris yang menyerupai barang yang sudah ada / kembar di
 *                 berkas ini. Saat mode hitung, ini daftar yang ditawarkan.
 * `warnings[]`  = baris yang tetap masuk tapi ada kolom bermasalah.
 */
export async function POST(request: NextRequest) {
  return proses(request, { simpan: false, sertakanMirip: false });
}

export async function PUT(request: NextRequest) {
  return proses(request, { simpan: true, sertakanMirip: false });
}

async function proses(
  request: NextRequest,
  options: { simpan: boolean; sertakanMirip: boolean }
) {
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

    // Pemakai memutuskan baris mirip ikut masuk atau tidak. Hanya berlaku saat
    // menyimpan — mode hitung tidak menyimpan apa pun.
    const sertakanMirip = String(formData.get("sertakanMirip") ?? "") === "1";

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
    // Peta kunci → nama barang yang SUDAH ada di database. Dipakai untuk
    // mengenali baris kembar sekaligus menjelaskan kembarnya dengan siapa.
    const petaAda = new Map<string, string>();
    for (const e of existing) {
      for (const k of kunciSemua(e.name, e.inventoryNumber, e.sn, e.location)) {
        if (!petaAda.has(k)) petaAda.set(k, e.name);
      }
    }

    // Kunci yang sudah dipakai baris sebelumnya DI FILE INI → nomor barisnya.
    const petaFile = new Map<string, number>();

    // Baris yang mirip dengan yang sudah ada. TIDAK langsung dibuang: dihitung
    // dulu, lalu pemakainya yang memutuskan mau dilewati atau tetap masuk.
    // (Nomor inventaris yang sama untuk banyak unit fisik itu wajar — kalau
    // langsung dibuang, 9 dari 10 barang hilang tanpa jejak.)
    const mirip: Array<{ baris: number; nama: string; sebab: string; dengan: string }> = [];

    // Nama barang yang akan MASUK. Diisi dalam mode hitung supaya kembar
    // antar-baris berkas ini tetap ketahuan walau barisnya tidak jadi disimpan.
    const petaRencana = new Map<string, number>();

    // duplicateRows/duplicates lama tetap diisi saat barisnya benar-benar
    // dilewati — supaya bentuk balasan lama tak rusak.
    const duplicates: string[] = [];
    let dibaca = 0;

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

      dibaca++;

      // Mirip dengan yang sudah ada (di database) atau kembar di file ini.
      // Saat mode hitung, petaRencana yang dipakai; saat menyimpan, petaFile —
      // supaya laporan mode hitung sama persis dengan hasil penyimpanan.
      const kunci = kunciSemua(name, inventoryNumber, sn, location);
      const petaAcuan = options.simpan ? petaFile : petaRencana;
      let sebab: string | null = null;
      let dengan = "";
      for (const k of kunci) {
        const dariDb = petaAda.get(k);
        if (dariDb !== undefined) { sebab = jelasKunci(k); dengan = dariDb; break; }
        const dariFile = petaAcuan.get(k);
        if (dariFile !== undefined) {
          sebab = `${jelasKunci(k)} dengan baris ${dariFile} di berkas ini`;
          dengan = name;
          break;
        }
      }
      if (sebab) {
        mirip.push({ baris: barisKe, nama: name, sebab, dengan });
        if (!sertakanMirip) {
          duplicates.push(`Baris ${barisKe}: "${name}" ${sebab.toLowerCase()} — dilewati.`);
          continue;
        }
      }
      for (const k of kunci) if (!petaAcuan.has(k)) petaAcuan.set(k, barisKe);

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

    // ── Mode hitung (POST): laporkan saja, JANGAN menulis apa pun ──
    if (!options.simpan) {
      const akanMasuk = dibaca - duplicates.length - dilewatiUnit;
      return NextResponse.json({
        importedCount: 0,
        akanMasuk,
        dibaca,
        skippedRows,
        duplicateRows: duplicates.length,
        duplicates,
        mirip,
        warnings,
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
          mirip,
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
      dibaca,
      skippedRows,
      duplicateRows: duplicates.length,
      duplicates,
      mirip,
      warnings,
    });
  } catch (error) {
    console.error("POST /api/items/import error:", error);
    return NextResponse.json({ error: "Gagal mengimpor file" }, { status: 500 });
  }
}
