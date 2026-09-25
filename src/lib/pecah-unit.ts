// Pemecahan satu pengajuan (keranjang) menjadi beberapa bagian per UNIT.
//
// Latar: satu kali user mengajukan bisa berisi barang dari beberapa unit
// berbeda. Karena tiap unit punya adminnya sendiri, pengajuan itu harus
// dipecah supaya tiap admin hanya menyetujui bagian unitnya. Tapi bagi
// peminjam, semua pecahan tetap SATU pengajuan — karena itu semua pecahan
// diberi grupId yang sama, dan tampilan yang membingkainya kembali jadi satu.
//
// Dipakai bersama oleh /api/pinjam (peminjaman) dan /api/handovers (serah
// terima) supaya aturannya tak bisa berbeda di antara kedua jalur itu.

export type Keranjang = { itemId: number; quantity: number; notes: string };

/**
 * Kelompokkan keranjang menurut unit barang. Urutan grup mengikuti kemunculan
 * pertama di keranjang supaya hasilnya bisa diramalkan (bukan urutan acak Map).
 *
 * Barang yang unit-nya kosong dikumpulkan di satu grup ber-kunci "" — tidak
 * dilarang, tapi hanya superadmin yang bisa menyetujuinya.
 */
export function pecahPerUnit(
  keranjang: Keranjang[],
  unitBarang: Map<number, string | null | undefined>
): Map<string, Keranjang[]> {
  const grup = new Map<string, Keranjang[]>();
  for (const c of keranjang) {
    const unit = (unitBarang.get(c.itemId) || "").trim();
    const daftar = grup.get(unit);
    if (daftar) daftar.push(c);
    else grup.set(unit, [c]);
  }
  return grup;
}

/** Peubah bentuk keranjang dari body permintaan, sekaligus rapi-rapikan nilai. */
export function bacaKeranjang(cart: any[]): Keranjang[] {
  return cart.map((c) => ({
    itemId: Number(c.itemId),
    quantity: Math.max(1, Number(c.quantity) || 1),
    notes: String(c.notes ?? "").trim(),
  }));
}
