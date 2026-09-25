import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items } from "@/db/schema";
import { eq, like, or, and, gt, inArray, sql } from "drizzle-orm";
import { toBool } from "@/lib/to-bool";
import { auth } from "@/auth";
import { jsonBody } from "@/lib/json-body";
import { generateItemCode } from "@/lib/item-code";
import { normalizeLocation } from "@/lib/locations";
import { normalizeUnit } from "@/lib/units";
import { cekPanjangTeks, pesanJumlahTidakValid } from "@/lib/validasi";
import { batasUnit, periksaAksesUnit } from "@/lib/akses-unit";

// Semua endpoint /api/items adalah panel admin. Halaman user membaca DB
// langsung (server component), jadi tidak ada konsumen non-admin.
async function requireAdmin() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "admin" && role !== "super_admin")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

/**
 * Saringan "hanya unit yang dikelola".
 * superadmin → tak ada batasan (null).
 * admin      → hanya unit yang ditugaskan; barang berunit LAIN tak muncul.
 * admin tanpa unit → tak melihat apa pun (bukan berarti melihat yang kosong).
 */
async function saringUnit(session: any) {
  const daftar = await batasUnit(session);
  if (daftar === null) return null; // superadmin
  if (daftar.length === 0) return sql`1 = 0`; // tak mengelola unit apa pun
  return inArray(items.unit, daftar);
}

export async function GET(request: NextRequest) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const session = await auth();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const category = searchParams.get("category") || "";
    const status = searchParams.get("status") || "";
    const unitFilter = searchParams.get("unit") || "";
    const canBorrow = searchParams.get("canBorrow");
    const canHandover = searchParams.get("canHandover");

    const conditions = [];

    // Sembunyikan item yang sudah habis total (quantity=0, hasil serah terima
    // permanen — tidak akan kembali). Item dipinjam tetap muncul (avail 0, qty>0).
    conditions.push(gt(items.quantity, 0));

    // Admin hanya melihat barang unit yang dikelolanya.
    const batas = await saringUnit(session);
    if (batas) conditions.push(batas);

    // Penyaring unit dari layar: hanya berlaku kalau bukan superadmin,
    // supaya admin tak bisa mengintip unit lain lewat parameter URL.
    if (unitFilter) {
      const daftar = await batasUnit(session);
      const boleh = daftar === null || daftar.some((u) => normalizeUnit(u) === normalizeUnit(unitFilter));
      if (boleh) conditions.push(eq(items.unit, normalizeUnit(unitFilter)));
    }

    if (canBorrow === "1") conditions.push(eq(items.canBorrow, true));
    if (canHandover === "1") conditions.push(eq(items.canHandover, true));

    if (search) {
      conditions.push(
        or(
          like(items.name, `%${search}%`),
          like(items.description, `%${search}%`),
          like(items.inventoryNumber, `%${search}%`),
          like(items.assetNumber, `%${search}%`),
          like(items.sn, `%${search}%`),
          like(items.itemCode, `%${search}%`),
          like(items.location, `%${search}%`),
          like(items.condition, `%${search}%`)
        )
      );
    }
    if (category) {
      conditions.push(eq(items.category, category));
    }
    if (status) {
      conditions.push(
        eq(items.status, status as "available" | "borrowed")
      );
    }

    const data = await db
      .select()
      .from(items)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(items.name);

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/items error:", error);
    return NextResponse.json(
      { error: "Failed to fetch items" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const session = await auth();
    const body = await jsonBody(request);
    if (!body) {
      return NextResponse.json({ error: "Body permintaan tidak valid" }, { status: 400 });
    }
    const { name, category, description, quantity, unit, location, imageUrl, sn, inventoryNumber, assetNumber, lastCheckDate, condition, canBorrow, canHandover, isLabelable } = body;

    if (!name || !category) {
      return NextResponse.json(
        { error: "Nama dan kategori wajib diisi" },
        { status: 400 }
      );
    }

    // Unit menentukan kode barang DAN siapa yang berhak mengelolanya.
    // Admin hanya boleh menambah barang untuk unit yang ditugaskannya;
    // superadmin bebas (termasuk barang tanpa unit).
    const normalizedUnit = normalizeUnit(unit);
    const tolak = await periksaAksesUnit(session, normalizedUnit);
    if (tolak) return NextResponse.json({ error: tolak.pesan }, { status: tolak.status });

    // ── Jumlah harus bilangan bulat minimal 1 ──
    // Dulu `quantity || 1`, sehingga `-5`, `2.5`, `0`, atau `"abc"` ikut
    // tersimpan apa adanya (atau meledak jadi 500 di kolom int). Perhatikan
    // `quantity || 1`: angka 0 pun ditelan jadi 1 — padahal 0 justru yang
    // paling berbahaya karena barangnya langsung tersembunyi.
    // Patokan `items/[id]` (form edit) yang sudah benar sejak awal.
    //
    // `null` juga DITOLAK, bukan diartikan 1: `Number(null)` bernilai 0, dan
    // menganggap "kosong" sebagai satu unit membuat kesalahan isi formulir
    // tak pernah ketahuan.
    let qty = 1;
    if (quantity !== undefined) {
      const pesanJumlah = pesanJumlahTidakValid(quantity);
      if (pesanJumlah) return NextResponse.json({ error: pesanJumlah }, { status: 400 });
      qty = Number(quantity);
    }

    // ── Panjang teks disesuaikan lebar kolom ──
    // Tanpa ini, nama 5000 karakter membuat MySQL membalas error dan
    // pemakai hanya melihat "Failed to create item" (500) tanpa penjelasan.
    const tolakPanjang = cekPanjangTeks({
      Nama: [name, 255],
      Kategori: [category, 100],
      "No. Inventaris": [inventoryNumber, 255],
      "No. Asset": [assetNumber, 255],
      "Nomor Seri": [sn, 255],
      Kondisi: [condition, 255],
      Unit: [normalizedUnit, 255],
      Lokasi: [location, 255],
      "URL gambar": [imageUrl, 500],
    });
    if (tolakPanjang) return NextResponse.json({ error: tolakPanjang }, { status: 400 });

    // Kode barang dibuat di server, terkunci — nilai itemCode dari klien diabaikan.
    const { code: itemCode, unit: unitFinal } = await generateItemCode(normalizedUnit);

    const [{ id }] = await db
      .insert(items)
      .values({
        name,
        category,
        description: description || null,
        sn: sn || null,
        itemCode,
        inventoryNumber: inventoryNumber || null,
        assetNumber: assetNumber || null,
        lastCheckDate: lastCheckDate || null,
        condition: condition || null,
        imageUrl: imageUrl || null,
        quantity: qty,
        availableQuantity: qty,
        canBorrow: canBorrow === undefined ? true : toBool(canBorrow),
        canHandover: canHandover === undefined ? true : toBool(canHandover),
        isLabelable: isLabelable === undefined ? true : toBool(isLabelable),
        unit: unitFinal || null,
        // Lokasi bebas diketik → hanya dirapikan kapitalisasinya.
        location: normalizeLocation(location) || null,
        status: "available",
      })
      .$returningId();

    const [item] = await db.select().from(items).where(eq(items.id, id));

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error("POST /api/items error:", error);
    return NextResponse.json(
      { error: "Failed to create item" },
      { status: 500 }
    );
  }
}
