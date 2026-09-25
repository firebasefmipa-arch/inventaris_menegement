import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items } from "@/db/schema";
import { eq } from "drizzle-orm";
import { toBool } from "@/lib/to-bool";
import { auth } from "@/auth";
import { jsonBody } from "@/lib/json-body";
import { normalizeLocation, lokasiMirip } from "@/lib/locations";
import { normalizeUnit } from "@/lib/units";
import { cekPanjangTeks, JUMLAH_MAKS } from "@/lib/validasi";
import { periksaAksesUnit } from "@/lib/akses-unit";
import { snapshotSebelumHapus } from "@/lib/item-snapshot";
import { barangSedangDipakai, pesanBarangDipakai } from "@/lib/item-in-use";

// Panel admin saja — halaman user membaca DB langsung (server component).
async function requireAdmin() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || (role !== "admin" && role !== "super_admin"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

/**
 * Barang ini ada DAN boleh disentuh pemakai?
 * Mengembalikan barangnya, atau respons penolakan yang siap dikirim.
 *
 * Barang di luar unit admin dijawab 403 — bukan 404. Sengaja: 404 akan
 * menyamarkan keberadaannya, tapi juga bikin admin bingung mencari barang yang
 * URL-nya jelas ada. 403 lebih jujur: "ada, tapi bukan hak Anda".
 */
async function ambilBarangBoleh(id: string) {
  const itemId = idValid(id);
  if (itemId === null)
    return { tolak: NextResponse.json({ error: "ID tidak valid" }, { status: 400 }) } as const;

  const [item] = await db.select().from(items).where(eq(items.id, itemId));
  if (!item)
    return { tolak: NextResponse.json({ error: "Item tidak ditemukan" }, { status: 404 }) } as const;

  const session = await auth();
  const tolakAkses = await periksaAksesUnit(session, item.unit);
  if (tolakAkses)
    return { tolak: NextResponse.json({ error: tolakAkses.pesan }, { status: tolakAkses.status }) } as const;

  return { item } as const;
}

/** `id` route bisa bukan angka — tanpa cek ini query jadi `WHERE id = NaN`. */
function idValid(id: string): number | null {
  const n = parseInt(id, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const { id } = await params;
    const hasil = await ambilBarangBoleh(id);
    if ("tolak" in hasil) return hasil.tolak;
    return NextResponse.json(hasil.item);
  } catch (error) {
    console.error("GET /api/items/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch item" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const { id } = await params;
    const hasilAmbil = await ambilBarangBoleh(id);
    if ("tolak" in hasilAmbil) return hasilAmbil.tolak;
    const existing = hasilAmbil.item;

    const body = await jsonBody(request);
    if (!body) {
      return NextResponse.json({ error: "Body permintaan tidak valid" }, { status: 400 });
    }
    const { name, category, description, quantity, unit, location, imageUrl, status, sn, inventoryNumber, assetNumber, lastCheckDate, condition, canBorrow, canHandover, isLabelable } =
      body;

    // ── Panjang teks disesuaikan lebar kolom ──
    // Kalau kepanjangan, MySQL membalas error dan pemakai cuma melihat
    // "500 Terjadi kesalahan" tanpa tahu bagian mana yang salah.
    const tolakPanjang = cekPanjangTeks({
      Nama: [name, 255],
      Kategori: [category, 100],
      "No. Inventaris": [inventoryNumber, 255],
      "No. Asset": [assetNumber, 255],
      "Nomor Seri": [sn, 255],
      Kondisi: [condition, 255],
      Unit: [unit, 255],
      Lokasi: [location, 255],
      "URL gambar": [imageUrl, 500],
    });
    if (tolakPanjang) return NextResponse.json({ error: tolakPanjang }, { status: 400 });

    // Pindah unit = menyerahkan barang ke pengelola lain. Hanya boleh kalau
    // pemakai berhak atas unit LAMA (sudah diperiksa di atas) DAN unit BARU.
    // Tanpa cek kedua, admin TI bisa "menyumbang" barang ke unit mana pun.
    let unitFinal: string | undefined;
    if (unit !== undefined) {
      const u = normalizeUnit(unit);
      const session = await auth();
      const tolakTujuan = await periksaAksesUnit(session, u || null);
      if (tolakTujuan)
        return NextResponse.json(
          { error: `Tidak bisa memindahkan barang ke unit itu — ${tolakTujuan.pesan}` },
          { status: tolakTujuan.status }
        );
      unitFinal = u;
    }

    // ── Jumlah harus bilangan bulat ──
    // "abc" → Number() = NaN, dan NaN < apa pun = false sehingga lolos
    // penjagaan di bawah, lalu diteruskan ke database dan meledak jadi 500.
    let quantityNum: number | undefined;
    if (quantity !== undefined) {
      const n = Number(quantity);
      // Stok 0 hanya boleh lahir dari serah terima. Menurunkannya ke 0 lewat
      // form edit dilarang — barang jadi tersembunyi tanpa unit di luar, dan
      // tak bisa dikembalikan. Barang yang SUDAH 0 boleh disimpan apa adanya
      // (mis. admin cuma membetulkan namanya).
      const berkurangKeNol = n === 0 && existing.quantity !== 0;
      if (!Number.isInteger(n) || n < 0 || berkurangKeNol) {
        return NextResponse.json(
          { error: "Jumlah minimal 1 unit. Stok 0 hanya terjadi lewat serah terima." },
          { status: 400 }
        );
      }
      // Batas atas: kolom `quantity` bertipe int, dan penambahan berikutnya
      // (pengembalian) bisa melewati batas itu dan gagal simpan.
      if (n > JUMLAH_MAKS) {
        return NextResponse.json(
          { error: `Jumlah maksimal ${JUMLAH_MAKS.toLocaleString("id-ID")} unit.` },
          { status: 400 }
        );
      }
      quantityNum = n;
    }

    // ── E1: unit yang sedang dipegang peminjam tidak boleh "hilang" ──
    // quantity - availableQuantity = jumlah unit yang keluar (dipinjam/diserahkan
    // tapi belum dikembalikan). Menurunkan quantity di bawah angka itu membuat
    // unit tersebut lenyap dari pembukuan.
    const unitDipegang = existing.quantity - existing.availableQuantity;
    if (quantityNum !== undefined && quantityNum < unitDipegang) {
      return NextResponse.json(
        {
          error:
            `Jumlah tidak boleh kurang dari ${unitDipegang} unit — sebanyak itu sedang ` +
            `dipinjam/di luar. Kembalikan atau selesaikan transaksinya dulu.`,
        },
        { status: 400 }
      );
    }

    await db
      .update(items)
      .set({
        ...(name !== undefined && { name }),
        ...(category !== undefined && { category }),
        ...(description !== undefined && { description }),
        ...(sn !== undefined && { sn }),
        ...(inventoryNumber !== undefined && { inventoryNumber }),
        ...(assetNumber !== undefined && { assetNumber }),
        ...(lastCheckDate !== undefined && { lastCheckDate }),
        ...(condition !== undefined && { condition }),
        ...(quantityNum !== undefined && {
          quantity: quantityNum,
          // availableQuantity ikut bertambah/berkurang sebesar selisih perubahan quantity
          // Contoh: quantity lama 5, baru 8 → availableQuantity +3
          // Contoh: quantity lama 5, baru 3 → availableQuantity -2 (tidak boleh < 0)
          availableQuantity: Math.max(
            0,
            existing.availableQuantity + (quantityNum - existing.quantity)
          ),
        }),
        ...(unitFinal !== undefined && { unit: unitFinal || null }),
        ...(location !== undefined && {
          location: normalizeLocation(lokasiMirip(location) || location) || null,
        }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(status !== undefined && { status }),
        ...(canBorrow !== undefined && { canBorrow: toBool(canBorrow) }),
        ...(canHandover !== undefined && { canHandover: toBool(canHandover) }),
        ...(isLabelable !== undefined && { isLabelable: toBool(isLabelable) }),
        updatedAt: new Date(),
      })
      .where(eq(items.id, existing.id));

    const [item] = await db.select().from(items).where(eq(items.id, existing.id));
    return NextResponse.json(item);
  } catch (error) {
    console.error("PUT /api/items/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update item" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const { id } = await params;
    const hasilAmbil = await ambilBarangBoleh(id);
    if ("tolak" in hasilAmbil) return hasilAmbil.tolak;
    const existing = hasilAmbil.item;
    const itemId = existing.id;

    // ── F1: jangan hapus barang yang unitnya masih di tangan orang ──
    // Menghapusnya membuat transaksinya menggantung dan pengembalian mustahil.
    const dipakai = await barangSedangDipakai([itemId]);
    if (dipakai.length > 0) {
      return NextResponse.json({ error: pesanBarangDipakai(dipakai) }, { status: 400 });
    }

    // ── F2: barang stok 0 (habis diserahkan) TERKUNCI ──
    // Unitnya bisa kembali ke inventaris sewaktu-waktu, jadi barangnya harus
    // tetap ada supaya bisa dicari lewat kode saat dikembalikan. Karena stok 0
    // cuma bisa lahir dari serah terima (form edit tak boleh menurunkannya),
    // tak ada barang tersembunyi yang "nyangkut" tanpa jalan keluar.
    if (existing.quantity === 0) {
      return NextResponse.json(
        { error: "Barang dengan stok 0 tidak bisa dihapus — unitnya mungkin kembali. " +
                 "Gunakan menu Pengembalian Barang kalau unitnya sudah masuk lagi." },
        { status: 400 }
      );
    }

    // Salin identitas barang terakhir ke baris riwayat SEBELUM barang dihapus,
    // supaya riwayat yang terdampak tetap menampilkan nama & data barangnya.
    await snapshotSebelumHapus([itemId]);
    await db.delete(items).where(eq(items.id, itemId));
    return NextResponse.json({ message: "Item berhasil dihapus" });
  } catch (error) {
    console.error("DELETE /api/items/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete item" },
      { status: 500 }
    );
  }
}
