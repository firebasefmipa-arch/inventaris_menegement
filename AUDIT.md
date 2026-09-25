# Riwayat Audit — Management logistic

Catatan semua audit yang pernah dijalankan pada aplikasi ini: masalah yang
ditemukan, buktinya, dan perbaikannya.

Beda dengan dua dokumen lain:
- **`MEMORY.md`** — aturan & konvensi sourcecode (yang berlaku SEKARANG).
- **`DEPLOY.md`** — urusan server (deploy, nginx, PM2, DB produksi).
- **`AUDIT.md`** (file ini) — catatan waktu: apa yang ditemukan, kapan, dan
  bagaimana ditutup. Ditulis dari yang TERBARU ke yang terlama.

Aturan penulisan: setiap temuan wajib punya **bukti nyata** (perintah +
keluaran), **sebab** di sourcecode, **dampak**, dan **status** (commit
penutupnya kalau sudah diperbaiki). Temuan yang sengaja dibiarkan harus
ditulis alasannya — jangan hilang begitu saja.

---

## Audit #16 — 25 Sep 2026 — Halaman admin membaca database langsung, batas unit tidak dipasang

**Kesempatan:** setelah Audit #15 ditutup, diminta audit menyeluruh lagi
("ok sekarang audit menyeluruh dan simulasi lagi"). Fokus yang dipilih: cari
kelas bug yang belum pernah diperiksa — bukan mengulang yang sudah.

**Temuan pokok:** penyaringan unit selama ini **hanya dipasang di route API**.
Sebagian halaman admin **tidak lewat API sama sekali** — server component yang
query database sendiri. Untuk halaman seperti itu, route API yang sudah benar
**tidak menolong apa pun**.

Bukti nyata (HTTP sungguhan, dua akun admin beda unit, 25 Sep 2026):

```
Admin Kimia membuka /logistik/admin/items/370   (Mikroskop — unit Farmasi)
  → 200, HTML memuat "Mikroskop"

Admin Kimia membuka /logistik/admin/items/371   (Meja — unit lain)
  → 200, HTML memuat "Meja"

Admin Kimia membuka /logistik/admin/items/368   (barang tanpa unit)
  → 200

rute API-nya sendiri:
  GET /logistik/api/items/370  → 403   ← sudah benar
```

Jadi API menolak, tetapi **halaman detail + form editnya terbuka**, dan daftar
barang seluruh unit dikirim utuh ke browser (bisa dibaca lewat Inspect Element
walau kartunya tidak ditampilkan).

**Enam temuan pada audit ini:**

| # | Temuan | Dampak |
|---|---|---|
| 1 | `admin/items/page.tsx` query `items` tanpa saring unit | admin melihat seluruh barang unit lain |
| 2 | `admin/items/[id]/page.tsx` tanpa `periksaAksesUnit` | detail + form edit unit lain terbuka (tulis tetap ditolak server) |
| 3 | `admin/items/[id]/page.tsx` membaca riwayat lewat `transactions.itemId` | kolom itu **selalu NULL** → riwayat selalu kosong |
| 4 | `admin/page.tsx` — stats & daftar transaksi tanpa batas unit | admin melihat nama peminjam & barang unit lain |
| 5 | `admin/page.tsx` badge "Terlambat" pakai `tx.status === "overdue"` | kolom `status` tak pernah bernilai `overdue` → badge tak pernah muncul |
| 6 | `admin/returns/page.tsx` mengirim riwayat semua unit ke browser | kebocoran lintas unit |
| 7 | `unitDiLuar()` dipanggil tanpa batas unit | hitungan barang "di luar" unit lain ikut terbaca |

**Bukti temuan #3** (`transactions.item_id` selalu NULL):

```
SELECT COUNT(*) total, SUM(item_id IS NULL) null_itemid FROM transactions;
→ total 22, null_itemid 22     ← 100% kosong
grep -rn "itemId:" src/app/   → tak ada satu pun penulisnya
```

**Bukti temuan #5:** `grep -rn '=== "overdue"' src/` — nilai `overdue` tidak
pernah ditulis di mana pun; "Terlambat" harus dihitung dari
`expectedReturnDate` vs waktu sekarang (`sqlTerlambat()` di `src/lib/tanggal.ts`).

**Perbaikan (commit penutup: `b6d49e7`):**

- `src/app/admin/items/page.tsx` — saring unit + `unitDiLuar` dibatasi.
- `src/app/admin/items/[id]/page.tsx` — `periksaAksesUnit` + riwayat lewat
  tabel penghubung `transaction_items`.
- `src/app/admin/page.tsx` — batas unit di `getStats()` dan daftar transaksi;
  badge/ikon "Terlambat" dihitung dari **tanggal** (`tx.telat`).
- `src/app/admin/returns/page.tsx` — riwayat disaring lewat unit barangnya.
- `scripts/check-unit.ts` — **U16** (6 pemeriksaan), total 87 butir.

**Verifikasi:** `cek-tipe.sh` bersih · `npm run build` sukses · simulasi aturan
kondisi 25/25 · simulasi alur + kebocoran lintas unit 27/27 · regresi penuh
120/120 · `check:unit` 87 lulus 0 gagal.

**Pelajarannya:** untuk tiap halaman di `src/app/admin/**/page.tsx`, periksa
apakah ia memanggil `batasUnit`/`periksaAksesUnit`. Halaman yang membaca DB
sendiri **wajib** memanggilnya — tidak bisa mengandalkan route API. Cara
mengujinya: dua akun admin beda unit, lalu cari nama barang unit lain di HTML
yang benar-benar terkirim, bukan di layar yang tampak.

**Dibiarkan (dengan alasan):**

- `/api/auth/verify` — mutasi tanpa pemeriksaan sesi, **tetapi rute ini MATI**:
  tabel `verification_tokens` tidak ada di database, jadi tidak ada kode
  verifikasi yang pernah dibuat. Belum dihapus karena masih ada halaman
  `/verify` yang menautkannya; menunggu keputusan pemilik produk.
- Halaman `/admin/users` — admin (bukan superadmin) bisa **membuka** daftar
  pengguna. Tombol pengubahnya sudah dikunci di server (hanya superadmin bisa
  mengubah peran/menghapus), jadi tidak ada data yang bisa dirusak — tetapi
  daftar nama & email terlihat. Menunggu keputusan pemilik produk.

---

## Audit #15 — 25 Sep 2026 — Barang rusak masih bisa dipinjam & diserahterimakan

**Kesempatan:** user menyadari data barang sudah punya kolom kondisi (Baik/Rusak),
tapi bertanya apa gunanya — karena barang rusak tetap muncul dan tetap bisa
dipinjam.

**Temuan:** kolom `condition` **tidak pernah dipakai sebagai penyaring** di mana
pun. Satu-satunya penjaga adalah `can_borrow`/`can_handover` yang harus
dicentang manual, dan keduanya **terbuka secara default** (`DEFAULT 1`).

Bukti (sebelum perbaikan):

```
grep -rn "condition" src/app/api src/lib src/app/dashboard | grep -iE "eq\(|where|filter"
→ (kosong)   ← kondisi tidak pernah jadi penyaring

halaman pinjam user menyaring dengan:
  available_quantity > 0  DAN  can_borrow = 1
```

Akibatnya barang berkondisi "Rusak" tetap tampil di daftar pinjam user dan tetap
bisa dipinjam — hanya gembok manual yang menahannya, dan gembok itu bisa saja
lupa dinyalakan.

**Kedua:** teks kondisi dari impor Excel dipakai **mentah**. Template impor
sendiri mencontohkan `"Rusak Ringan"` / `"Rusak Berat"`, jadi file yang mengikuti
template menghasilkan kondisi yang tak dikenali aturan mana pun.

### Perbaikan

Aturan ditulis di **satu tempat** (`src/lib/kondisi.ts`), dipakai 5 pintu:

| Aturan | Wujudnya |
|---|---|
| Hanya `"Baik"` yang boleh dipinjam/diserahterimakan | `bolehJalan()` |
| Kondisi wajib diisi saat menambah barang | `POST /api/items` menolak 400 |
| Kembali ke "Baik" membuka gemboknya lagi | jangan "mengingat" nilai lama |
| Catatan kerusakan = riwayat, tidak dihapus | `tambahCatatan()` |
| Sedang dipinjam → tidak bisa ditandai rusak | `barangSedangDipakai()` |
| `"Kurang Baik"` → **Rusak**, bukan Baik | teks buruk diperiksa lebih dulu |

Pintu yang diperiksa: halaman Pinjam user, halaman Serah Terima user, filter
barang admin, `POST /api/pinjam`, `POST /api/handovers`.

### Dua bug yang ketahuan saat pengujian sendiri

Keduanya **baru muncul setelah diuji dengan data sungguhan**, bukan dari membaca
kode:

1. **Barang yang sudah diperbaiki tetap terkunci selamanya.** Perbaikan pertama
   "mengingat" nilai gembok terakhir — padahal nilai itu `false` hasil paksaan
   saat barang ditandai rusak. Akibatnya laptop yang sudah diperbaiki tidak bisa
   dipinjam lagi. Diperbaiki: saat kondisi kembali "Baik", gembok dibuka lagi.

2. **Memeriksa gembok saja tidak cukup.** Barang lama lahir dengan
   `can_borrow = 1` dari nilai bawaan kolom, sehingga barang berkondisi kosong
   tetap bocor ke daftar user. Diperbaiki: kondisi diperiksa **langsung**, tidak
   lewat gembok.

Bukti uji (server uji :3001, 33/33 lulus): barang Rusak hilang dari kedua halaman
user; dipinjam lewat alamat langsung tetap **ditolak**; kondisi kosong + gembok
terbuka tetap ditolak; barang sedang dipinjam tidak bisa ditandai rusak; setelah
diperbaiki muncul lagi sementara catatannya tetap ada; rusak lagi menambahi
catatan alih-alih menimpa.

Uji logika tebakan kondisi: **39/39 lulus** — termasuk `Kurang Baik` → Rusak,
`Tidak lengkap` → Rusak, `Baik Sekali` → Baik, `ada` → data tidak lengkap.

Dijaga oleh penjaga `check:unit` **U15** (17 pemeriksaan baru, total **81**).

**Status:** diperbaiki. Commit `6393a84`.

**Belum dikerjakan (sengaja):** barang lama berkondisi kosong dibiarkan, tidak
diisi otomatis — admin mengisi kapan sempat, dan selama itu barangnya
disembunyikan dari user dengan tanda "data tidak lengkap" di kartunya.

---

## Audit #14 — 25 Sep 2026 — Stok bisa beranak (satu pengajuan diproses berkali-kali)

**Latar.** Audit menyeluruh + simulasi semua skenario (permintaan user). Pola
yang dicari: tempat yang mengubah data tanpa menyaring status barisnya.

**Temuan (bukti nyata).** Barang stok 10, ditahan 6, lalu penolakan dikirim
TIGA KALI BERSAMAAN:

```
stok tersedia: 22   ← dari fisik 10
status balasan: 200, 200, 200
```

Ketiga permintaan sama-sama balas "berhasil", `kembalikanKeStok` jalan tiga
kali. Hal yang sama terjadi pada pembatalan oleh user (10 → 18) dan pada
serah terima. Persetujuan bersamaan juga tiga kali balas 200 — stok aman
karena memang atomik, tapi berkas PDF dipindah/dihapus tiga kali.

**Sebab di sourcecode.** `UPDATE` hanya memakai `WHERE id`, tanpa
`AND status = 'pending_approval'`, dan hasilnya tidak diperiksa jumlah
barisnya. Di `/api/user/.../cancel` urutannya juga terbalik: stok dikembalikan
DULU, penandaan status baru di akhir — jadi dua permintaan paralel sama-sama
melewati pengembalian stok sebelum salah satunya menandai.

**Dampak.** Jumlah "bisa dipinjam" bisa MELEBIHI jumlah fisik barang. Aplikasi
lalu mengizinkan peminjaman yang secara fisik tidak ada, dan angkanya tidak
bisa dipulihkan sendiri tanpa hitung ulang manual.

**Perbaikan (`13bb04a`).** Keempat berkas disamakan polanya: status ikut
disyaratkan di `WHERE`, `affectedRows` diperiksa, yang kalah balapan balas
**409** ("sudah diproses, muat ulang"). Urutan dibalik: **kunci status dulu,
baru sentuh stok**. Persetujuan serah terima juga tidak lagi mengunci
"selesai" kalau stok ternyata tak cukup — dikembalikan ke menunggu. Ditambah
penjaga **U12** (12 pemeriksaan) supaya pola `WHERE id` telanjang tidak
kembali masuk.

**Verifikasi.** 17/17 lulus di server uji :3001 (`200, 409, 409` di keempat
jalur; stok pulih tepat 10/10). Regresi utuh tetap hijau: uji-1 25/25,
uji-2 21/21, uji-super 23/23.

**Temuan kedua dari audit yang sama — DIPERBAIKI (`cf9b889`).**

*Masukan angka & panjang teks tidak diperiksa.* Bukti sebelum perbaikan:

```
POST /api/items   { quantity: -5 }         → 201, tersimpan quantity=-5
POST /api/items   { quantity: 2.5 }        → 201, tersimpan jadi 3
POST /api/items   { quantity: 0 }          → 201, barang tersembunyi permanen
POST /api/items   { name: "x"*5000 }       → 500 (kolom hanya 255)
POST /api/pinjam  { cart:[{quantity:0}] }  → diterima, dicatat jadi 1
PATCH .../correct { items:[{quantity:-5}] }→ diterima, stok malah BERTAMBAH 5
```

Akar: `const qty = quantity || 1` (`items/route.ts`) dan
`Math.max(1, Number(c.quantity) || 1)` (`pecah-unit.ts`) — keduanya memaksa
angka ngawur jadi 1 tanpa memeriksa. Di jalur koreksi lebih halus lagi: jumlah
hanya dibandingkan dengan stok tersedia, dan perbandingan dengan `NaN` atau
angka negatif selalu bernilai `false`, jadi selalu lolos.

Perbaikan: satu tempat pemeriksaan, `src/lib/validasi.ts`
(`pesanJumlahTidakValid`, `cekPanjangTeks`, `JUMLAH_MAKS = 1.000.000`), dipakai
di 8 titik: tambah barang, edit barang, 4 jalur keranjang (pinjam, serah
terima, ajukan transaksi, serah terima admin), dan 2 jalur koreksi. Panjang
teks kini dibatasi sesuai lebar kolom dengan pesan yang menyebut batasnya,
bukan 500. Penjaga **U13** (14 pemeriksaan) ditambahkan.

**Verifikasi temuan kedua.** uji-masukan **23/23** lulus, uji-koreksi **13/13**
lulus, uji-balapan **15/15** lulus; regresi uji-1 25/25, uji-2 21/21,
uji-super 23/23.

**Sisa dari audit yang sama — DIPERBAIKI (pilihan 1, commit `a2f6976`).**

*`/api/public/borrow` + halaman `/katalog` masih hidup.* Diuji langsung di
server uji :3001 dengan user biasa:

```
GET  /logistik/katalog          → 200 (terbuka tanpa login)
POST /api/public/borrow         → 201 BERHASIL
catatan: id 128 | unit = NULL | grup_id = NULL | "uji lewat alamat lama"
banding: id 129 | unit = Divisi Teknologi Informasi | grup_id = <uuid>
```

Permintaannya masuk, tapi tersimpan **tanpa kolom `unit`**. Karena unit itulah
yang menentukan admin mana yang berhak menyetujui, baris itu tidak muncul di
daftar tugas admin mana pun — hanya superadmin yang melihatnya. Bukan
kebocoran data, tapi pengajuan menggantung tanpa penanggung jawab jelas.

Awalnya dikira hanya "alamat lama tanpa tautan". Ternyata halaman `/katalog`
masih ada dan masih menembak ke alamat itu — jadi memperbaiki endpointnya saja
tidak cukup.

Perbaikan: dihapus ketiganya — `src/app/(public)/katalog/`,
`src/app/api/public/borrow/`, dan `src/components/PinjamFlow.tsx` (komponen
mati). Verifikasi: `/logistik/katalog` → **404**, `POST
/api/public/borrow` → **404**; halaman dalam aplikasi (`/`, `/login`,
`/dashboard/*`, `/admin/items`) tetap normal (200 atau 307 ke login), dan
`POST /api/pinjam` tanpa login tetap **401**. Regresi 120/120 lulus.

**Audit #14 selesai seluruhnya.** Tidak ada temuan terbuka dari audit ini.

---

## Audit #13 — 25 Sep 2026 — Batas unit bocor lewat alamat berkas langsung

**Latar.** Uji hak superadmin (menjawab pertanyaan "superadmin tetap punya semua
akses kan?") menemukan hal lain: perbaikan `e9ce9c7` baru menutup pintu DEPAN
(`/api/grup/[grupId]/dokumen`), sementara pintu SAMPING masih terbuka.

**Cara menemukannya:** setelah memastikan superadmin memang masih punya seluruh
akses lamanya (23/23 lulus), pertanyaan lanjutannya: "kalau begitu, apakah
pembatasan unit bisa dilewati dengan cara lain?" Berkas PDF-nya juga bisa dibuka
langsung dari `/uploads/...`, dan di situ aturannya masih lama — *admin/superadmin
boleh semua berkas*.

**Bukti (sebelum diperbaiki):** dokumen milik unit Kimia dibuka langsung dari
alamat berkasnya:

| Peran | Status |
|---|---|
| admin TI (unit lain) | **200** ← bocor |
| admin Farmasi (unit lain) | **200** ← bocor |
| pemiliknya | 200 |
| tanpa login | 401 (aman) |

Berlaku juga untuk berkas **tanda tangan pribadi** user lain di
`/uploads/signatures/...`.

**Perbaikan** (`src/app/uploads/[...path]/route.ts`):

| Peran | Aturan baru |
|---|---|
| superadmin | semua berkas (tidak berubah) |
| pemiliknya | berkasnya sendiri |
| admin | hanya dokumen **unit yang dikelolanya** (unit dibaca dari transaksi/serah terima) |
| admin lain | 403 |
| anonim | 401 |

Tanda tangan hanya untuk pemiliknya + superadmin — admin unit mana pun tidak.

**Keputusan user:** pilih opsi 1 — **tutup juga**, bukan membiarkannya.

**Penjaga:** `check:unit` naik ke **35** (U10 dokumen gabungan, U11 berkas
unggahan). Verifikasi lapangan di server uji :3001: **14/14 lulus**
(superadmin/pemilik/admin unit boleh; admin unit lain 403; anonim 401).

**Status:** DIPERBAIKI. Deploy menyusul menunggu persetujuan user.

---

## Audit #12 — 25 Sep 2026 — Fitur Unit: batas kelola per unit + sisa pola stok lama

**Latar.** Fitur baru: barang punya **Unit** (pemilik: divisi/prodi), berbeda
dari **Lokasi** (tempat). Kode barang pindah dari lokasi ke unit. Admin hanya
boleh mengelola barang unit yang ditugaskan padanya. Satu pengajuan user yang
memuat barang dari beberapa unit **dipecah di belakang layar** (satu bagian per
unit) tapi tetap **satu pengajuan** di layar user.

**Cara menemukannya:** dua bagian. (a) menelusuri SETIAP endpoint yang menyentuh
barang/transaksi/serah terima untuk memasang batas unitnya; (b) memeriksa ulang
semua tempat yang mengubah stok, karena fitur ini menambah jalur baru.

**(a) Batas unit dipasang di — kalau hanya disembunyikan di layar, URL bisa
diketik langsung:**

| Berkas | Aksi |
|---|---|
| `api/items/route.ts` | daftar disaring unit; POST periksa hak |
| `api/items/[id]/route.ts` | GET/PUT/DELETE periksa hak barang lama & unit baru |
| `api/items/import/route.ts` | baris unit lain DILEWATI (bukan gagalkan seluruh berkas) |
| `api/items/labels/route.ts` | admin tak boleh melabeli barang unit lain |
| `api/items/bulk-delete/route.ts` | ditolak kalau satu saja di luar wewenang |
| `api/transactions/route.ts`, `api/transactions/[id]/*` | daftar, approve/reject, koreksi, rincian, unggah, PDF, batal |
| `api/handovers/route.ts`, `api/admin/handovers*` | sama, jalur serah terima |
| `api/admin/returns/route.ts` | pengembalian dibatasi unit |
| `api/stats/route.ts` | angka ringkasan tak boleh membocorkan unit lain |
| `admin/transactions/page.tsx`, `admin/handovers/page.tsx` | disaring di SERVER — kalau tidak, kartu unit lain ikut terkirim ke browser |

**(b) Tiga pola stok lama yang masih baca-lalu-tulis, ikut ditutup:**

| # | Tempat | Gejala yang mungkin |
|---|---|---|
| 1 | `transactions/[id]/route.ts` (tombol "dikembalikan" — jalur lama) | stok dikembalikan lewat angka hasil hitungan aplikasi |
| 2 | `transactions/[id]/correct` | stok barang lama dikembalikan & barang baru dikurangi tanpa syarat |
| 3 | `admin/handovers/[id]/correct` | sama untuk jalur serah terima |

Ditambah dua pembatalan yang seluruhnya baca-lalu-tulis:
`user/transactions/[id]/cancel`, `user/handovers/[id]/cancel`.

**Perbaikan.** Semua pengurangan memakai syarat di `WHERE` + periksa
`affectedRows` (0 → 409); semua penambahan memakai ekspresi DB
(`available_quantity + n`) dengan status dihitung `CASE WHEN`.

**Temuan sampingan (cerobekan fitur baru):** laporan rincian transaksi
(`/api/transactions/[id]/items`) dan serah terima
(`/api/admin/handovers/[id]/items`) awalnya **hanya memeriksa peran**, tidak
unit — admin unit lain bisa membaca rincian barang unit lain lewat URL. Sudah
ditutup.

**Keputusan yang menyertainya:**
- Dokumen: **satu penandatanganan berlaku untuk semua pecahan** — kalau tidak,
  pecahan lain tetap menunggu dokumen dan tak pernah bisa disetujui adminnya.
- Pembatalan: **batal = batal semua pecahan**; ditolak kalau ada satu saja yang
  sudah diproses.
- Kelompok **tidak punya status sendiri**; status dihitung untuk tampilan saja.

**Penjaga:** `npm run check:unit` — 27 pemeriksaan (kode dari unit, tiap unit
urutan sendiri, unit tak dikenal → `LAIN`, hak kelola superadmin/admin/user,
barang tanpa unit hanya superadmin, pemecahan keranjang tak tercampur).
Seluruh penjaga lain tetap lulus: `check:pdf` 25, `check:label` 51,
`check:habis` 15, `check:kembali` 22, `check:kode` 22, `check:snapshot` 19.

**Status:** DIPERBAIKI + **DI-DEPLOY 25 Sep 2026** (`105d02c`, `e9ce9c7`, `9b9e62f`).

**Uji asap lintas unit (sebelum deploy, server uji :3001, DB kosong).** Dijalankan
dengan akun uji sementara sendiri (`@uji.local`, dihapus lagi setelah selesai) —
**46/46 lulus**:

| Bagian | Yang dibuktikan |
|---|---|
| Uji 1 (25) | kode barang per unit (`FMIPA-TI-…`/`FMIPA-KIM-…`, urutan tiap unit sendiri); pengajuan campur 2 unit → **terpecah 2 transaksi, 1 `grup_id`**; satu unggahan dokumen mengisi KEDUA pecahan; admin TI **ditolak** menyetujui/menolak/mengedit/menghapus pecahan & barang Kimia (403 di server, bukan sekadar tombol hilang); stok terpotong sesuai; user biasa ditolak membuat barang |
| Uji 2 (21) | serah terima juga terpecah + tiap pecahan lahir dengan PDF sendiri ber-kode unit; admin TI ditolak pada pecahan Kimia; dokumen gabungan jadi PDF sah; **admin unit lain tak bisa membuka dokumen gabungan milik orang lain**; balapan stok (3 pinjaman serentak atas stok 4 → tak semuanya lolos, stok tak minus); batal lintas unit membatalkan kedua pecahan sekaligus + stok kedua barang kembali penuh |

**Bug baru yang ketemu lewat uji ini (satu, sudah diperbaiki di `e9ce9c7`):**
`api/grup/[grupId]/dokumen` sebelumnya hanya memeriksa `role === "admin"`,
sehingga **admin unit mana pun bisa membuka dokumen gabungan milik siapa pun**.
Sekarang dibatasi: pemiliknya sendiri, superadmin, atau admin yang mengelola
salah satu unit di kelompok itu.

**Catatan susulan (bukan bug, sengaja):** serah terima lahir langsung berstatus
`pending_approval` dan PDF-nya dibuat otomatis (berbeda dari peminjaman yang
harus diunggah user) — ini perilaku lama, tak diubah oleh fitur Unit.

---

## Audit #11 — 24 Sep 2026 — Empat bug "bentrok" (dua orang mengklik bersamaan)

**Cara menemukannya:** bukan memeriksa tampilan, tapi **menyerbu** endpoint dengan
beberapa permintaan di detik yang sama (seperti dua admin mengklik Simpan
bersamaan), lalu menghitung stoknya.

**Empat temuan, satu akar:** urutan *baca → hitung → tulis* yang tidak dikunci.
Semua permintaan membaca angka lama, lalu menulis angka hasil hitungan masing-masing.
Yang terakhir menulis menimpa yang sebelumnya (*lost update*).

| # | Tempat | Gejala terbukti | Asal |
|---|---|---|---|
| 1 | `generateItemCode()` | 6 barang serentak → **3 berhasil, 3 error 500**; nomor sama dipakai dua kali | kode baru (Bagian B) |
| 2 | `catatPengembalian()` | 1 unit di luar, 2 pengembalian serentak → **dua-duanya diterima**, stok naik 2 | kode baru (Bagian C) |
| 3 | `POST /api/pinjam` | stok 4, 3 pinjaman @2 unit serentak → **ketiganya lolos** (6 dari 4) | sudah lama ada |
| 4 | `POST /api/admin/handovers` | stok 4, 3 serah terima @2 unit → **ketiganya lolos**; stok akhir ngawur | sudah lama ada |

**Bukti mentah temuan #1** (`audit-race.sh`, sebelum perbaikan):

```
req1 http=201 kode=FMIPA-TI-2026-005
req2 http=201 kode=FMIPA-TI-2026-007
req3 http=500 kode=-
req4 http=201 kode=FMIPA-TI-2026-006
req5 http=500 kode=-
req6 http=500 kode=-
```

**Bukti mentah temuan #2:** `quantity` jadi **2** dari 1 unit yang keluar; 2 baris
`item_returns` untuk satu unit.

**Bukti mentah temuan #4:** 6 unit tercatat keluar dari stok 4; stok akhir 2
(padahal seharusnya 0).

**Penting — data produksi BELUM rusak.** Diperiksa langsung: tak ada stok negatif,
tak ada `quantity < available_quantity`, tak ada catatan tak sinkron. Kejadian
bersamaan ini belum pernah menimpa produksi, jadi ini **pencegahan**, bukan pemulihan.

**Perbaikan** (tiga pola, satu tujuan: pindahkan syarat "cukup" ke dalam perintah tulis):

1. **`catatKode()` mengembalikan status klaim.** Sebelumnya `INSERT IGNORE` menelan
   bentrok dengan senyap; sekarang `affectedRows` diperiksa. `generateItemCode()`
   mengulang sampai berhasil mengklaim nomor (maks 25 percobaan).
2. **`catatPengembalian()` dibungkus satu transaksi + `SELECT ... FOR UPDATE`.**
   Baris barang dikunci sebelum sisa "di luar" dihitung, jadi pengembalian kedua
   menunggu dan melihat angka yang sudah final.
3. **Stok dikurangi lewat `UPDATE ... WHERE stok >= jumlah`.** Syarat kecukupan
   ikut di dalam perintah; kalau 0 baris terpengaruh, permintaan dibatalkan
   (`409`) dan baris transaksi/serah terima yang telanjur dibuat dihapus kembali.

**Yang TIDAK berubah:** aturan peminjaman (data diri, validasi, TTD, tanggal),
aturan serah terima, tampilan, alur kerja sehari-hari. Yang berubah hanya
**cara menulis stok ke database**. Pada peminjaman/penyerahan normal, hasilnya
identik.

**Perubahan perilaku yang disengaja:** saat dua permintaan bentrok dan stok tak
cukup untuk keduanya, yang kedua **ditolak** dengan pesan "stok tidak lagi
mencukupi — coba lagi", bukan sama-sama "berhasil" sambil merusak stok.

**Bukti sesudah perbaikan** (`audit-race-ulang.sh` + `audit-race4.sh`):

```
#1  6 permintaan serentak   → 6 × 201, 6 nomor berbeda
#2  2 pengembalian serentak → 1 × 201, 1 × 400; 1 baris; stok naik 1
#3  3 pinjaman serentak     → 2 × 201, 1 × 409; stok berhenti di 0, tak negatif
#4  3 serah terima serentak → 2 × 201, 1 × 409; total keluar 4 (pas), stok 0
```

**Penjaga baru:** `check-kode-barang.ts` bertambah 3 pemeriksaan bentrok
(8 permintaan serentak → 8 nomor berbeda) → total **17**.

**Berkas diubah:** `src/lib/item-code.ts`, `src/lib/pengembalian.ts`,
`src/app/api/pinjam/route.ts`, `src/app/api/admin/handovers/route.ts`,
`scripts/check-kode-barang.ts`.

---

## Audit #10 — 24 Sep 2026 — Nomor barang dipakai ulang (buku register)

**Temuan (dilaporkan user, dibuktikan di produksi):** kode barang
`FMIPA-TI-2026-001` dipakai dua barang berbeda.

Bukti dari log produksi:

```
03:04:58  DELETE /api/items/8     (Proyektor Epson EB-E01 dihapus admin)
03:05:37  POST   /api/items       (Leptop No. 15 dibuat)
          → Leptop No. 15 mendapat FMIPA-TI-2026-001  ← nomor bekas
```

**Akar masalah:** `nextSequence()` di `src/lib/item-code.ts` menghitung
`MAX(urut)` dari baris `items` yang **masih hidup**. Begitu barang dihapus,
nomornya bebas dan diberikan lagi ke barang berikutnya.

Reproduksi: `repro-kode.sh` (57 baris) membuktikan bug ini di DB salinan.

**Perbaikan:** tabel `kode_terpakai` (buku register) sebagai sumber nomor.

| Sebelum | Sesudah |
|---|---|
| `MAX(urut)` dari `items` hidup | `MAX(urut)` dari `kode_terpakai` |
| barang dihapus → nomor bebas | nomor terkunci selamanya |
| tak ada jejak nomor | satu baris per kode yang pernah keluar |

**Keputusan penting:** tabel ini **SENGAJA TANPA foreign key** ke `items`.
Kalau dikasih `ON DELETE CASCADE` (seperti `item_returns`), catatan nomor ikut
terhapus bersama barangnya — fiturnya batal total. Ini disadari dan disengaja.

Kedua: kode dicatat **saat dibuat**, bukan saat barang tersimpan. Kalau
penyimpanan gagal, nomornya tetap terkunci (bolong). Dipilih bolong daripada
nomor diberikan dua kali.

**Yang TIDAK dipulihkan (keputusan user):** nomor bekas yang sudah terlanjur
dipakai ganda dibiarkan apa adanya. `Leptop No. 15` tetap memakai
`FMIPA-TI-2026-001`. Nomor berikutnya untuk lokasi TI = `005`.

**Nomor yang tak bisa dilacak:** `Mouse Logitech` & `Laptop Macbook Pro`
barangnya sudah terhapus dan `item_snapshot.item_code` kosong, jadi nomor
keduanya tidak pernah bisa ditentukan. Sudah tidak relevan — nomor itu
terkunci otomatis begitu dipakai barang berikutnya.

**Isi awal register saat pemasangan:** 9 nomor.

```
6 nomor barang hidup (semai otomatis dari tabel items)
3 nomor sisa uji yang pernah terpakai (FMIPA-TI-2026-002, -004, FMIPA-D-2026-001)
```

**Perintah perawatan:** `npm run kode:bebas {daftar|cek|semai|lepas [--paksa]} <KODE>`
— manual, di server. `lepas` DITOLAK kalau nomornya masih dipakai barang hidup.

**Bukti uji:**

```
check-kode-barang.ts          14/14 lulus
ujiB-skenario.sh              A dapat 009 → dihapus → B dapat 010  (bukan 009)
ujiB-lepas.sh                 lepas kode hidup → DITOLAK
                              lepas kode bekas → berhasil, nomor bisa dipakai lagi
                              register setelah semua uji: 9 nomor, 0 sisa
```

**Berkas baru:** `src/lib/kode-register.ts` (42), `scripts/kode-bebas.ts` (148),
`scripts/check-kode-barang.ts` (139), `scripts/sql/kode_terpakai.sql` (28).
**Diubah:** `src/lib/item-code.ts` (121), `src/db/schema.ts`,
`src/app/api/items/import/route.ts`, `package.json`.

---

## Audit #9 — 24 Sep 2026 — Fitur pengembalian barang (Bagian C)

**Pemicu:** lanjutan Audit #8. Setelah barang yang habis diserahkan tidak lagi
dihapus (cuma disembunyikan), muncul kebutuhan: **bagaimana barang itu kembali?**
Keputusan user: admin mengetik **kode barang** → stok **bertambah**.

**Temuan yang muncul saat menyiapkan:**

- **T-1. Riwayat serah terima kolom kode kosong 0/4.** Sisi "keluar" karena itu
  dilacak lewat `handover_items.item_id`, bukan lewat kode. Tidak diperbaiki —
  jalur pengembalian memakai kode barang HIDUP (`items.item_code`), yang memang
  terisi (6/6). Kode di riwayat hanya snapshot historis.
- **T-2. Barang yang dulu diserahkan sudah terhapus** (`Mouse Logitech`,
  `Laptop Macbook Pro`) mengikuti aturan lama. Kodenya ikut lenyap, jadi kedua
  barang itu **tidak bisa dikembalikan** lewat fitur ini. Konsekuensi keputusan
  "tidak usah dipulihkan" — dicatat, bukan diperbaiki.
- **T-3. Tidak ada satu pun barang yang sedang di luar** di data sekarang —
  keenam barang utuh. Kolom "Sedang di Luar" mulai dari 0; itu benar.
- **T-4. Belum ada tabel pengembalian.** Dibuat `item_returns` (ALTER manual).

**Yang dikerjakan:**

- Tabel `item_returns` — kode, jumlah, nama pengembali, penerima, catatan, tanggal.
- `src/lib/unit-di-luar.ts` — SATU-SATUNYA definisi "sedang di luar":
  Σ `handover_items` pada `handovers` berstatus `completed` − Σ `item_returns`.
- `src/lib/pengembalian.ts` — `catatPengembalian()`. Stok **ditambah**, tidak
  ditimpa, supaya pengembalian bertahap benar. Dipisah dari route agar bisa diuji.
- `GET`/`POST /api/admin/returns` — admin & super_admin saja.
- Halaman `/admin/returns` (menu sidebar "Pengembalian") — form input kode,
  daftar unit yang masih di luar (bisa diklik → kode terisi), riwayat.
- Kolom "Sedang di Luar" di kartu & baris daftar barang.

**Verifikasi:**

- Penjaga `check:kembali` — **22 pemeriksaan lulus, 0 gagal**.
- Endpoint di :3001 — anon 401, user biasa 401, kode salah 404, jumlah melebihi
  400, jumlah 0 400, tanpa nama 400, kembali bertahap 201+201, tak ada sisa 400.
- Browser (playwright) — stok 0 tersembunyi → kembalikan 1 lewat formulir →
  **barang muncul lagi di daftar** → kembalikan sisanya → daftar "di luar" kosong.
  Konsol bersih.
- Baseline DB dipulihkan persis: items 6 · tx 6 · ti 7 · hv 4 · hi 4 · usr 9 · ret 0.

**Belum ditutup:** `item_returns` belum ada di dump skema deploy — kalau DB lain
dibangun ulang, tabel ini harus dibuat manual. Lihat commit untuk SQL-nya.

---

## Audit #8 — 24 Sep 2026 — Barang habis diserahkan dihapus permanen + kode barang dipakai ulang

**Pemicu:** dua hal dari user. (1) Ralat aturan: barang yang habis karena
diserahterimakan **tidak boleh** hilang dari database — cuma disembunyikan,
karena ada kemungkinan unitnya kembali ke inventaris. (2) Laporan mis-logic:
kode barang yang sudah pernah dipakai tidak boleh diberikan ke barang lain.

### Temuan P — kode barang dipakai ulang setelah barang dihapus

**Bukti dari log produksi (nginx, 24 Sep 2026):**

```
03:04:58  DELETE /api/items/8   → Proyektor Epson EB-E01 dihapus
                                kode FMIPA-TI-2026-001
03:05:37  POST   /api/items     → Leptop No. 15 dibuat
                                kode FMIPA-TI-2026-001  ← KODE SAMA
          (39 detik kemudian)
```

Terbukti terulang lewat uji terkendali: barang A dapat `FMIPA-TI-2026-002`,
A dihapus, barang B **juga** dapat `-002`.

**Akar masalah:** `nextSequence()` (`src/lib/item-code.ts`) menghitung nomor
berikutnya dari **barang yang masih ada** (`MAX` baris hidup) + 1. Barang
dihapus → barisnya hilang → nomornya dianggap bebas.

Catatan: kolom `item_code` di `transaction_items`/`handover_items` **ada tapi
kosong** (0 dari 11 baris), jadi riwayat tak bisa dipakai sebagai daftar nomor
terpakai apa adanya.

**Status: BELUM DIPERBAIKI** — rancangan sudah disusun (tabel buku register
nomor + perintah pembebas superadmin). Direncanakan sebagai "Bagian B".

### Temuan Q — barang habis diserahkan dihapus permanen (PERILAKU LAMA)

Fitur "hapus otomatis" (`hapusBarangHabis()`) membuang barang begitu stok fisik
jadi 0 lewat serah terima. Akibatnya barang yang unitnya **bisa kembali** sudah
tak bisa ditemukan lagi — apalagi pengembalian dirancang lewat pencarian kode
barang.

**Perbaikan (SELESAI): barang disembunyikan, bukan dihapus.**

```
hapusBarangHabis()                    → DIHAPUS dari src/lib/item-in-use.ts
2 pemanggil di jalur serah terima     → dicabut
export function hapusBarangHabis      → hilang; src/lib/item-in-use.ts tinggal 73 baris
scripts/check-hapus-habis.ts          → diganti scripts/check-barang-habis.ts
```

**Tampilan menurut peran** (`admin/items/page.tsx` + `ItemsClient.tsx`):
`page.tsx` mengirim semua barang tanpa saringan + prop `canSeeHidden`;
penyaringan di klien karena bergantung peran.

- admin → tersembunyi, tombol `Tampilkan yang habis (N)`
- super_admin → tampil langsung, bertanda `Habis`, tanpa tombol
- badge "Habis" menggantikan "Dipinjam" untuk `quantity === 0` (pinjaman tak
  pernah menurunkan stok fisik) — dipasang di grid, list desktop, dan mobile

**Penjaga baru di jalur hapus manual:** F2 — barang `quantity = 0` terkunci
("unitnya mungkin kembali"). Barang `quantity > 0` tetap bisa dihapus supaya
admin masih bisa membuang barang salah input.

**Penutup celah:** `PUT /api/items/[id]` menolak menurunkan stok ke 0; barang
yang sudah 0 tetap boleh disimpan apa adanya (betulkan nama). Jadi stok 0
**hanya** lahir dari serah terima → selalu ada unit di luar → tak ada barang
tersembunyi yang nyangkut tanpa jalan keluar.

**Bukti (salinan uji :3001, browser sungguhan + jalur serah terima resmi):**

```
serah terima 3 unit → stok 0
  barang di database     : ADA       (dulu: terhapus)
  tampil di daftar admin : TIDAK

ADMIN       stok-0 tersembunyi · tombol ada · label Habis 0
            setelah diklik → tampil · label Habis 1
SUPERADMIN  stok-0 tampil langsung · label Habis 1 · tanpa tombol

hapus barang stok 0            → DITOLAK
hapus borongan berisi stok 0   → DITOLAK
PUT stok jadi 0 dari >0        → DITOLAK
hapus barang stok >0           → BOLEH
simpan barang stok 0 (nama)    → BOLEH
```

Penjaga `npm run check:habis` = 15 pemeriksaan lulus. Tujuh penjaga lain lulus.
`npx tsc --noEmit` bersih. Data uji dibersihkan, kembali ke baseline
6/6/7/4/4/9.

**Tidak dipulihkan:** barang yang sudah telanjur terhapus aturan lama
(Mouse Logitech, Laptop Macbook Pro, Proyektor Epson EB-E01) — keputusan user,
"mulai sekarang begini saja".

### Insiden saat uji — .env.local salinan berbagi inode

`cp -al` membuat hardlink, jadi `.env.local` di salinan uji berbagi inode
dengan aslinya. Menulis `UPLOAD_DIR` di salinan **ikut mengubah produksi**
(menunjuk folder uji beberapa menit). Dipulihkan dengan menulis lewat berkas
sementara lalu `mv` (memutus hardlink). Diverifikasi sesudahnya: katalog 200,
login 200, API anon 401, csrf keluar, 6 barang terbaca dari DB, folder unggahan
utuh (6/2/4/0), berkas produksi anon 401.

**Pelajaran: `cp -al` TIDAK cukup untuk mengisolasi berkas konfigurasi —
putus hardlink `.env.local` (dan berkas rahasia lain) SEBELUM menulis apa pun.**

---

## Audit #7 — 24 Sep 2026 — Nama barang kosong di kartu dashboard admin

**Pemicu:** audit menyeluruh + simulasi atas permintaan user. Bukan dari
keluhan — temuan muncul saat memeriksa konsistensi antara API, query halaman,
dan tampilan yang benar-benar ter-render.

**Temuan P — kartu "Transaksi Terbaru" tak pernah menampilkan nama barang**

Kartu di dashboard admin membaca nama barang lewat
`leftJoin(items, eq(transactions.itemId, items.id))` dan mengambil `items.name`.
Masalahnya: **`transactions.item_id` selalu NULL** — tautan barang ada di tabel
pivot `transaction_items`, karena satu transaksi bisa berisi banyak barang.
Kolom `item_id` di `transactions` adalah warisan yang hanya diisi jalur lama.

Bukti (7 dari 7 baris `item_id` NULL):

```
SELECT COUNT(*) total, SUM(item_id IS NULL) item_id_null FROM transactions;
  total  item_id_null
  7      7
```

Karena `items.name` selalu NULL dan tak ada jaring pengaman, `itemName` jadi
NULL untuk SEMUA baris. Terbukti di halaman yang benar-benar ter-render:

```
yang DILIHAT admin      : 5 nama PEMINJAM, 0 nama BARANG
yang SEHARUSNYA         : 5 nama peminjam, 5 nama barang
```

Angka konkretnya: `transaction_items` punya 8 baris; 4 di antaranya masih
menyimpan salinan nama (`Mouse Logitech`, `Laptop Macbook Pro`, dua baris lain
sudah tak punya karena dibuat sebelum kolom salinan ada). Jadi 4 baris
seharusnya bernama, bukan 0.

**Dampak ke pengguna:** admin membuka dashboard, melihat deretan kartu berisi
nama peminjam dan jumlah unit — tapi baris nama barangnya bolong. Tidak ada
pesan error; kartunya hanya tampak "kosong di atas". Admin tak bisa tahu barang
apa yang baru dipinjam tanpa membuka halaman daftar transaksi.

Kenapa tak ketahuan lebih awal: seluruh pengujian sebelumnya menyentuh API dan
halaman daftar transaksi — dan halaman daftar **punya penambal** (kalau
`itemName` NULL, ia membaca pivot dan menambal sendiri). Kartu dashboard tidak
punya penambal itu. Jadi satu jalur tertutup rapi, jalur satunya bolong.

**Temuan Q — endpoint `/api/stats` memakai kunci pivot yang salah (sama)**

Subquery nama barang di `recentTransactions` memasangkan
`transaction_items.item_id` dengan `transactions.item_id` — dua kolom yang
berbeda arti, dan yang kanan selalu NULL. Pasangan yang benar lewat
`transaction_items.transaction_id = transactions.id`. Endpoint ini belum punya
pemakai di UI (halaman admin query DB langsung), jadi **belum berdampak** —
tapi dibiarkan akan jadi jebakan bagi pemakai berikutnya.

**Perbaikan (`e62d638` + `aba81b3`)**

- `admin/page.tsx`: pembacaan nama dipindah ke SETELAH baris terbaca, lewat
  pivot — pola yang sama dengan kartu "akan jatuh tempo" di file yang sama
  (jadi pola benarnya sudah ada di situ, hanya kartu ini terlewat). Baris yang
  memang belum punya salinan nama ditampilkan `"Barang"`, sama seperti halaman
  daftar transaksi — bukan kosong.
- `api/stats/route.ts`: kunci subquery diperbaiki.

**Bukti sesudah (dashboard produksi, akun uji sementara):**

```
KARTU TRANSAKSI TERBARU — 5 baris:
    [Barang]
    [Barang]
    [Barang]
    [Mouse Logitech, Laptop Macbook Pro]
    [Laptop Macbook Pro]
```

Perhatikan baris **4**: itu transaksi berisi dua barang berbeda, dan keduanya
kini tersambung dengan koma — hal yang mustahil dilakukan join satu-kolom,
sekaligus bukti bahwa jalur pivot memang yang benar.

**Diverifikasi TIDAK ada masalah (sweep)** — semua diuji, semuanya hijau:

| Yang diperiksa | Hasil |
|---|---|
| 40 rute API tanpa login | 401 semua |
| 4 folder berkas unggahan tanpa login | 401 semua |
| IDOR: user membuka/mengubah data user lain | 403 |
| Batas peran: user ke rute admin | 401 |
| Batas peran: admin ke rute super_admin | 401 |
| Body kosong/rusak di 8 rute | 400, tak ada 500 |
| `id tidak valid`, `quantity bukan angka`, nol, minus | 400/404 |
| Alur penuh: pinjam → setujui → kembalikan | stok 5→2→2→5, benar |
| Barang dipinjam: `quantity` diturunkan di bawahnya | ditolak, stok utuh |
| Barang dipinjam: dihapus (satuan & massal) | ditolak, sebut `PB-####` |
| Dua peminjam nama sama, tanggal sama | dua berkas berbeda (`_21` & `_22`) |
| `parseInt` tanpa `isNaN` | 0 nyata (semua lewat `idValid`) |
| `request.json()` mentah | 1, sudah pakai `.catch(() => null)` |
| `formData()` mentah | 0 |
| Barang stok 0 yang masih dirujuk | 0 |
| Mode gelap: 46 varian kelas belum ter-remap | **dibiarkan** — lihat bawah |

**SENGAJA DIBIARKAN — 46 varian kelas ber-opasitas belum masuk tabel mode gelap**

Sweep menemukan 46 kelas seperti `bg-indigo-900/20`, `border-red-800/50`,
`bg-slate-700/60` yang dipakai di 20-an berkas tapi tak punya padanan di
`globals.css`. Ini **keterbatasan yang sudah diketahui** dan tercatat di
`MEMORY.md`: tabel mode gelap bekerja dengan mencocokkan NAMA KELAS, jadi
varian ber-opasitas harus ditambahkan manual satu per satu.

Dibiarkan karena: (a) bukan kemunduran — sudah begitu sejak awal; (b) menambah
46 baris CSS sekaligus tanpa memeriksa tiap layar di mode gelap berisiko
menghasilkan warna yang justru salah; (c) yang paling sering dipakai (25 varian)
sudah ter-remap. Kalau nanti ada keluhan warna di mode gelap, mulai dari daftar
ini.

**Jejak uji bersih** — data kembali persis ke keadaan semula:

```
              SEBELUM   SESUDAH
items            6     →    6
transactions     6     →    6
transaction_items 7    →    7
handovers        4     →    4
handover_items   4     →    4
users            9     →    9
```

Semua barang: `available_quantity = quantity` (tak ada sisa pinjaman uji).
Akun uji sementara dihapus; berkas TTD & PDF ujinya dibuang; folder `pending`
kosong; `git status --short` bersih.

---

## Audit #6 — 23 Sep 2026 — Barang habis diserahkan: label salah & baris mati

**Pemicu:** user menghitung 6 barang di halaman daftar barang, sementara
database punya 8. Bukan bug hitung — daftar menyaring `quantity > 0` — tapi
menyingkap dua cacat di belakangnya.

**Temuan N — status barang habis-serah-terima ditulis "borrowed"** (label salah)

Saat serah terima disetujui, kode menulis `status = availableQuantity === 0 ?
"borrowed" : "available"` (`admin/handovers/[id]/route.ts:68`). Untuk barang yang
habis diserahkan, `availableQuantity` memang 0, jadi labelnya jadi `borrowed`
alias "Dipinjam" — padahal barangnya tidak dipinjam dan tidak akan kembali.
Tidak terlihat di layar (barang `quantity = 0` tidak pernah ditampilkan), tapi
salah di laporan mentah.

**Temuan O — barang habis diserahkan tetap tinggal di database**

Barang yang `quantity = 0` karena diserahkan tidak akan kembali, tapi barisnya
masih ada. Efeknya: daftar menyaring dia, tapi query mentah tetap menghitungnya —
persis sumber kebingungan "database 8, layar 6".

**Perbaikan — pilihan user: HAPUS OTOMATIS, bukan label baru**

User menolak menambah jenis label (`handed_over`): lebih hemat menghapus barangnya
sekalian, karena barisnya memang tak berguna lagi. Dua-duanya tutup sekaligus —
label yang salah ikut lenyap bersama barisnya.

- Helper baru `hapusBarangHabis()` di `src/lib/item-in-use.ts`.
- **Patokan `quantity`, BUKAN `availableQuantity`** — koreksi penting dari user:
  "stock 0 itu maksudnya stock fisik bukan stock yang available untuk di pinjam".
  Barang yang dipinjam juga bisa `availableQuantity = 0` padahal bakal kembali.
- Dipasang di dua pintu serah terima: approve pengajuan + admin buat langsung.
  Peminjaman tidak disentuh.
- Urutan dijaga: `snapshotSebelumHapus()` dulu, baru `delete` — kebalik = nama
  riwayat kosong.
- Pengaman `barangSedangDipakai()` tetap dipasang (gratis, jalur yang sama dengan
  tombol hapus manual). Secara normal mustahil terjadi: menyerahkan seluruh stok
  tak mungkin selagi ada unit di tangan peminjam.
- Penjaga `scripts/check-hapus-habis.ts` (11 pemeriksaan).

**Bersih-bersih data:** #3 (Mouse Logitech) & #4 (Laptop Macbook Pro) —
`quantity = 0` sisa serah terima lama (#9930 sudah dihapus lebih dulu atas
permintaan user). Dihapus lewat pintu resmi (`DELETE /api/items/[id]`) supaya
pengaman + salinan identitas tetap bekerja. Daftar barang: **8 → 6**, cocok
dengan yang tampil di layar. 8 baris riwayat yang menunjuk keduanya tetap
menampilkan nama barang dengan benar.

**Bukti:** uji end-to-end dua pintu — habis total → hilang + riwayat bersalinan;
sebagian (2 dari 5) → tetap ada; user ajukan → admin setujui → hilang; `quantity = 0`
tapi ada pinjaman berjalan → ditahan. Commit `457a245`.

**Sisa yang dibiarkan (keputusan user):** 3 riwayat lama (tx #4, #5, #6) yang nama
barangnya kosong. Sebabnya barang #1 & #5 dihapus SEBELUM kolom snapshot ada,
dan namanya tidak ada di cadangan mana pun (dump lama, binlog, riwayat git sudah
disisir) — surat pinjam aslinya masih tersimpan sebagai PDF bertanda tangan dan
perlu dibaca manual. User memilih membiarkannya.

---

## Audit #5 — 23 Sep 2026 — Audit menyeluruh + simulasi 3 peran (lanjutan #4)

**Metode:** sama seperti #4 — login sungguhan 3 peran, 41 endpoint diserang
curl dengan cookie per peran, setiap perubahan stok diverifikasi ke MySQL.
Tujuan: memeriksa ULANG temuan lama masih terpasang, DAN menyapu bidang yang
belum pernah diaudit (formData, impor, pemisahan status, jalur non-angka).

Baseline: items 7 · transactions 6 · transaction_items 7 · handovers 4 · users 8.

### #5.1 — Nomor inventaris panjang rusak saat impor — TINGGI

Bukti:

```
barang impor user, No. Inv DTI ditulis sbg ANGKA di Excel:
  tersimpan : 4.0901E+11        <-- rusak
  seharusnya: 409010025366
file uji dibaca dua mode:
  raw:false -> "4.0901E+11"  (string, angka belakang hilang)
  raw:true  -> 409010025366  (number, utuh)
```

Sebab: `POST /api/items/import` memanggil `sheet_to_json(..., { raw: false })`
— mengambil TAMPILAN sel, bukan nilainya. Excel menampilkan angka 12+ digit
sebagai notasi ilmiah. Semua nomor inventaris UII 12 digit, jadi kerusakan ini
pasti terjadi setiap kali nomor diimpor sebagai angka.

Dampak berlipat: nomor inventaris dipakai sebagai kunci pendeteksi duplikat
(`No. Inv DTI` → `SN` → `Nama+Lokasi`). Nomor yang tersimpan rusak membuat
file yang sama bisa lolos jadi barang kembar.

Ditutup: `e5f419a` — `raw: true` + `keTeks()` (number → `String()` utuh).

### #5.2 — Lokasi salah ketik 1 huruf bikin kode barang bercabang — SEDANG

Bukti:

```
user menulis : "Devisi Teknologi Informasi"   ("Devisi")
daftar resmi : "Divisi Teknologi Informasi"   ("Divisi")
selisih      : 1 huruf

kode jadi    : FMIPA-DTI-2026-001
seharusnya   : FMIPA-TI-2026-001

di DB sekarang ada DUA lokasi untuk tempat yang sama:
  "Divisi Teknologi Informasi" -> 2 barang -> FMIPA-TI-2026-001
  "Devisi Teknologi Informasi" -> 1 barang -> FMIPA-DTI-2026-001
```

Sebab: `normalizeLocation()` hanya mencocokkan nama resmi kalau SAMA PERSIS
(beda besar-kecil huruf saja). Salah ketik dianggap lokasi baru, lalu
`locationCode()` mengambil inisial katanya (D-T-I). Lokasi palsu tersimpan
permanen di kolom `items.location`.

Dampak: barang di lokasi yang sama punya dua seri kode berbeda; pembukuan
jadi bercabang dan sulit direkap.

Ditutup: `e5f419a` — `lokasiMirip()` di `src/lib/locations.ts` (jarak edit /
Levenshtein, ambang 15% panjang nama, TIDAK menebak kalau hasilnya seri).
Dipakai di impor DAN `PUT /api/items/[id]`. Impor membetulkan otomatis
SEKALIGUS melaporkannya di `warnings[]`; lokasi yang benar-benar jauh hanya
diberi peringatan "dianggap lokasi baru".

### #5.3 — `formData()` yang melempar berubah jadi 500 "server rusak" — SEDANG

Bukti:

```
POST /api/items/import          tanpa body -> 500
POST /api/user/signature        tanpa body -> 500
POST /api/transactions/<id>/upload tanpa body -> 500
POST /api/handovers/<id>/upload tanpa body -> 500
multipart TANPA file -> 400 (penjagaan ada, tapi terlambat)
```

Sebab: `await request.formData()` melempar `TypeError` kalau Content-Type
bukan multipart/form-data, dan di dalam `try/catch` route berubah jadi 500.
Ini kelas yang SAMA dengan temuan #4.5 (`request.json()` → 500), tapi
`jsonBody()` hanya menutup jalur JSON — 4 route `formData` ini tidak pernah
ikut diperbaiki.

Ditutup: `e5f419a` — `formDataAman()` di `src/lib/json-body.ts`, dipakai 4
route → 400 "Berkas tidak ditemukan".

### #5.4 — Tiga definisi "Terlambat" tidak sepakat — SEDANG–TINGGI

Bukti (data nyata, sebelum perbaikan):

```
kartu dashboard : 0
daftar admin    : 1      <-- beda
__ uji kasus tenggat HARI INI __
  API (NOW() UTC + status active) : telat
  badge UI (hariTerlambat, WIB)   : belum telat
```

Sebab: tiga rumus berbeda —

```
kartu   : status='active' AND expected_return_date < NOW()   (UTC)
daftar  : kalender WIB, termasuk yang sudah dikembalikan
klien   : hariTerlambat() — kalender WIB
```

Tenggat disimpan `00:00` sedangkan `NOW()` di server UTC, jadi transaksi yang
tenggatnya HARI INI terbaca telat oleh kartu tapi tidak oleh daftar. Dan
transaksi yang sudah dikembalikan tapi dulu telat tidak dihitung kartu.

Dampak: admin melihat "Terlambat: 1", mengeklik, dan tidak menemukan barisnya
— atau sebaliknya, peminjaman yang harus dikejar tidak muncul di kartu.

Ditutup: `42629fd` — SATU definisi `sqlTerlambat()` di `src/lib/tanggal.ts`
(bandingkan `DATE()` di zona WIB; "dikembalikan" = `actual_return_date` ATAU
sekarang, sehingga satu rumus menangani dua keadaan). Dipakai 6 tempat:
kartu admin, `/api/stats`, daftar admin, `/api/transactions`, daftar user,
ringkasan user. Aturan: **jangan tulis ulang predikat ini** — pakai helper.

### #5.5 — `PUT /api/items/<id>` jumlah non-angka → 500 — RENDAH

Bukti: `PUT /api/items/11 {"quantity":"abc"}` → 500 "Gagal memperbarui item".

Sebab: `Number("abc")` = `NaN`, dan `NaN < angka` = `false` sehingga lolos
penjagaan E1, lalu `NaN` diteruskan ke driver dan meledak. Tidak ada data
rusak (UPDATE gagal seluruhnya), tapi pesannya menyesatkan.

Ditutup: `42629fd` — validasi `Number.isInteger()` lebih dulu → 400
"Jumlah harus berupa bilangan bulat 0 atau lebih." Jalur `/api/pinjam` sudah
aman (`Math.max(1, ...)`).

### #5.6 — Endpoint hapus peminjaman massal: tanpa pemakai & meninggalkan sisa — SELESAI

Bukti:

```
pemanggil dari UI (seluruh src, termasuk superadmin) : 0
menghapus 1 transaksi -> baris transaction_items TETAP ADA (baris sisa)
informasi_schema: FK hanya untuk tabel account & session
schema.ts mendeklarasikan references(... onDelete:"cascade")  <- deklarasi saja
komentar bulk-delete/route.ts:85 "cascade ke transaction_items" <- tidak ada
```

Dampak: baris pivot menumpuk tiap kali dipakai. Belum merusak angka karena
semua query pivot memakai `JOIN transactions` — tapi satu query tanpa JOIN
langsung salah.

Keputusan user: **endpoint dihapus** (Cara A), bukan ditambal — memperbaiki
sesuatu tanpa pemakai itu sia-sia, dan menghapusnya menutup masalah sampai
akar tanpa menyentuh struktur DB sama sekali.

Ditutup: `f8a53f5` — `src/app/api/transactions/bulk-delete/` dihapus (96
baris). Sekarang `POST/GET/DELETE` ke path itu → 405 (tak ada handler).

**Catatan penting:** alasan TIDAK memilih FK cascade — schema mendeklarasikan
cascade untuk `items.id` juga, yang berarti menghapus barang akan IKUT
menghapus riwayatnya. Itu membatalkan fitur snapshot identitas barang
("hapus barang tidak menghapus riwayat"). Ada 3 baris nyata yang menunjuk
barang yang sudah dihapus (`item_id` 1 & 5) — bukti fitur itu dipakai.

### #5.7 — Diverifikasi BENAR (tidak ada temuan)

```
anon 401 di semua endpoint
IDOR user<->user 403 (cancel, generate-pdf, regenerate-doc, upload)
admin -> /api/admin/documents 401 ; super_admin 200
role escalation GAGAL (user & admin kirim role=super_admin -> tak berubah)
DELETE tanda tangan hanya milik sendiri
path traversal hapus dokumen ditolak (/etc/passwd utuh)
15 route ber-[id] balas 400 untuk id "abc"
dobel-proses approve / kembalikan / hapus -> yang kedua 400, stok tak gandakan
invariant quantity >= availableQuantity benar untuk semua barang
impor duplikat dilewati
impor TANPA berkas -> 400 (setelah #5.3)
jumlah 0 / negatif saat pinjam aman (Math.max di pinjam/route.ts:70)
stats konsisten (pending_approval memang bukan active)
/register hanya tombol Google (bukan pendaftaran bebas)
```

### #5.8 — Catatan pengujian

- `POST /api/items/import` user jam 03:29:36 UTC → **200** (berhasil, 2 barang
  jadi). Pesan "berkas tidak ada" TIDAK berasal dari impor itu — berasal dari
  permintaan yang memang tidak melampirkan berkas. Log nginx membuktikan:
  satu-satunya `POST //api/items/import` di hari itu berstatus 200, 95 byte.
- Tiga definisi "Terlambat" sebelum perbaikan: kartu=0, daftar=1 — bukti
  ketidaksepakatan pada data nyata (bukan cuma potensi).
- Penjaga baru yang ditinggalkan: `scripts/check-import-fix.ts` (7 periksa)
  dan `scripts/check-terlambat.ts` (7 periksa — ketiga sumber harus sama).

---

## Audit #4 — 23 Sep 2026 — Audit total + simulasi 3 peran

**Metode:** login sungguhan 3 peran (user / admin / super_admin) lewat
`POST /api/auth/callback/credentials` (ambil `GET /api/auth/csrf` dulu, field
`username` bukan `email`), lalu semua endpoint diserang curl dengan cookie jar
per peran. Setiap perubahan stok diverifikasi langsung ke MySQL. Snapshot
sebelum-sesudah dipakai untuk membuktikan data pulih.

Baseline: items 7 · transactions 6 · transaction_items 7 · handovers 4 · users 8.
Semua dipulihkan persis setelah audit. Akun uji & berkas uji dihapus.

### #4.1 — Dokumen serah terima tidak bisa dibuka pemiliknya — TINGGI

Bukti:
```
signed_forms(tx)   pemilik=200 admin=200 anon=401
handovers(hv)      pemilik=403 admin=200 anon=401   <-- masalah
signatures(ttd)    pemilik=200 admin=200 anon=401
```

Sebab: `src/app/uploads/[...path]/route.ts` hanya mengenali folder
`signed_forms`, `pending`, `signatures`. Folder `handovers` — tempat PDF
serah terima disimpan setelah disetujui — lupa didaftarkan, jadi pemilik
selalu ditolak.

Dampak: user tak bisa mengunduh bukti serah terimanya sendiri. Admin tetap bisa.

**Status: DIPERBAIKI** — `b1d9814`. Daftar folder ditambah + komentar
peringatan. Dicatat sebagai MEMORY.md butir 16/17.

### #4.2 — `/api/public/borrow` lewati persetujuan + nama bisa dipalsukan — TINGGI

Bukti (login akun biasa, kirim nama "Nama Palsu" ke pintu lama):
```
transactions: tx 21 (/api/pinjam)  status=pending_approval nim=AUDITUSR purpose="uji audit"
              tx 22 (pintu lama)   status=active  nim=NULL purpose=NULL borrower_name="Nama Palsu"
stok Printer (id 12): 1 -> 0   <-- turun tanpa persetujuan admin
```

Sebab: `src/app/api/public/borrow/route.ts` (endpoint lama katalog publik)
menulis `status: "active"` langsung dan mengambil `borrowerName` dari body.
Bandingkan `/api/pinjam` yang benar: `pending_approval` + identitas dari sesi.

Halaman `/katalog` sudah tidak punya menu/link ke sana, tapi alamatnya masih
bisa dibuka langsung.

Dampak: pemilik akun bisa menghabiskan stok tanpa persetujuan dan mencatat
peminjaman atas nama orang lain.

**Status: DIPERBAIKI** — `aa09a76`. Status `pending_approval`, identitas dari
sesi, keperluan wajib. Form `KatalogClient.tsx` dibersihkan (input
nama/divisi/email/HP dibuang). Dicatat sebagai MEMORY.md butir 17.

### #4.3 — Ubah jumlah barang bisa bikin angka mustahil — TINGGI

Bukti (barang 5 unit, 2 sedang dipinjam):
```
PUT /api/items/<id>  {"quantity":1}   -> HTTP 200
sebelum: quantity=5  available=3
sesudah: quantity=1  available=0   <-- quantity < unit yang dipinjam (2)
```

Sebab: `PUT /api/items/[id]` tidak memeriksa unit yang sedang dipegang
(`quantity - availableQuantity`).

Dampak: 2 unit lenyap dari pembukuan. Pengembalian nanti menaikkan
`available` melebihi `quantity` sebenarnya.

**Status: DIPERBAIKI** — `aa09a76`. Ditolak 400 + menyebut angkanya.
Dicatat sebagai MEMORY.md butir 16.

### #4.4 — Barang bisa dihapus padahal masih dipegang — TINGGI

Bukti: `DELETE /api/items/[id]` → 200 untuk barang yang dirujuk transaksi
aktif. Transaksi menggantung, pengembalian mustahil.

Sebab: tidak ada pemeriksaan transaksi aktif di `DELETE /api/items/[id]`
maupun `POST /api/items/bulk-delete`.

**Status: DIPERBAIKI** — `aa09a76`. Ditolak 400 + nomor transaksinya
(`PB-xxxx` / `ST-xxxx`). Hapus massal ditolak SELURUHNYA kalau ada satu saja
yang dipegang. Helper baru `src/lib/item-in-use.ts`.

Catatan penting: barang `quantity = 0` karena habis diserahterimakan
(transaksinya sudah `completed`/`returned`) TETAP bisa dihapus — aturan
"stok 0 hilang dari daftar" tidak dilanggar.

### #4.5 — 20 route balas 500 saat body kosong / JSON rusak — SEDANG

Bukti — daftar route terkonfirmasi 500 (12 contoh dari 20):
```
500  POST   /api/items
500  PUT    /api/items/<id>
500  POST   /api/admin/handovers
500  PATCH  /api/transactions/<id>/correct
500  POST   /api/transactions/<id>/approve
500  POST   /api/items/bulk-delete
500  POST   /api/transactions/bulk-delete
500  POST   /api/pinjam
500  POST   /api/public/borrow
500  POST   /api/auth/update-profile
500  POST   /api/transactions
500  PATCH  /api/admin/handovers/<id>/correct
```

Sebab: pola `await request.json()` tanpa penjagaan. `SyntaxError` tertangkap
`catch` terluar → 500 "Terjadi kesalahan", padahal seharusnya 400.

Dampak: klien menerima pesan salah, dan 500 palsu menutupi error asli di log.

**Status: DIPERBAIKI** — `b1d9814`. Helper baru `src/lib/json-body.ts`
(`jsonBody()`), dipasang di seluruh route mutasi. Dicatat sebagai MEMORY.md
butir 15.

### #4.6 — `/api/auth/verify` 500 saat body kosong — RENDAH

Sama keluarga #4.5, dicatat terpisah karena ini endpoint publik tanpa login.

**Status: DIPERBAIKI** — `b1d9814`.

### #4.7 — Diverifikasi BENAR (tidak ada temuan)

Ditulis supaya tidak diperiksa ulang dari nol:

- Anon ditolak 401 di seluruh route admin (items, transactions, handovers, documents, users).
- IDOR user↔user: 403. User tak bisa mengubah/membatalkan transaksi atau serah terima milik orang lain.
- Data diri double-role: user biasa mengirim nama palsu ke `/api/pinjam` → body diabaikan, yang tersimpan tetap identitasnya.
- Batas peran: admin biasa → `/api/admin/documents` 401 (benar, super_admin saja).
- Stok: pinjam turun · approve tidak mengubah stok · tolak memulihkan · serah terima menurunkan `quantity` permanen.
- Validasi: tanggal kembali lampau ditolak · quantity melebihi stok ditolak 400 · pinjam tanpa TTD/NIM → 422.
- Dokumen tanpa login → 401 di semua folder.
- Alur ujung-ke-ujung (user pinjam 2 → admin approve → admin serah terima 1) hijau 8/8.
- Aturan "barang habis diserahterimakan hilang dari daftar" sudah jalan (`gt(items.quantity, 0)` di page + API).

### #4.8 — Catatan pengujian

- **Sesi JWT hidup 30 hari.** Menghapus user TIDAK mematikan sesinya. Pernah
  bikin uji gagal (`NIM_REQUIRED`) karena memakai sesi akun yang sudah dihapus —
  pesan errornya menyesatkan, sebabnya beda. Kalau habis menghapus akun uji,
  buat ulang akun + login ulang.
- Respons `POST /api/admin/handovers` memakai kunci **`id`**, bukan
  `handoverId` (yang punya `/api/handovers`). `pdfUrl` ada di keduanya.
- Serah terima admin langsung berstatus **`completed`** (bukan `active`).
- Serah terima menurunkan `quantity` — memang permanen, bukan bug.
- Akun uji wajib punya **NIM + TTD** sebelum bisa menguji alur pinjam
  (`SIGNATURE_REQUIRED`). Upload lewat `POST /api/user/signature` (formData).

**Commit penutup audit #4:** `b1d9814`, `aa09a76`, `a0ed011` (docs).
Laporan mentah: `/root/audit-20260922/temuan-audit-20260923.md`

---

## Audit #3 — 22 Sep 2026 — Audit keamanan berkas & stok

Metode: pengujian langsung endpoint tanpa login, dengan cookie user lain, dan
dengan cookie admin — fokus pada akses berkas dan konsistensi stok.

### #3.1 — Dokumen bertanda tangan bisa diunduh TANPA login — SEDANG–TINGGI

Bukti:
```
curl http://127.0.0.1:3000/logistik/uploads/signed_forms/PB_Rizky_Wibowo_04092026_2_regen.pdf
  -> 200, 888862 byte  (tanpa cookie apa pun)
curl http://127.0.0.1:3000/logistik/uploads/handovers/ST_Sabil_Hudek_07092026_4.pdf
  -> 200, 531125 byte
```
Cookie user biasa juga bisa mengunduh dokumen MILIK ORANG LAIN.

Sebab: `public/uploads` dilayani Next.js sebagai berkas statis (bind mount di
`public/`). Tidak ada kode yang memeriksa sesi/pemilik. Nama berkas memuat nama
orang + tanggal (`PB_<Nama>_<DDMMYYYY>_<id>.pdf`) → pola mudah ditebak.

Dampak: siapa pun yang tahu/menebak URL bisa mengunduh PDF berisi nama, tanda
tangan, dan data peminjaman orang lain. Tautan yang pernah dibagikan terus hidup.

**Status: DIPERBAIKI** — `456d160`. Folder fisik dipindah KE LUAR `public/`
(`/var/www/inventaris_uploads`, UPLOAD_DIR), bind mount dilepas, nginx
`/uploads/` tidak lagi `alias` tapi proxy ke Next. Semua akses lewat
`src/app/uploads/[...path]/route.ts` yang memeriksa sesi + kepemilikan
(anon 401, user lain 403, admin 200).

### #3.2 — `PUT /api/transactions/[id]` tidak validasi transisi status → stok menggelembung — SEDANG

Bukti (peran admin, barang #10 stok awal 1):
```
PUT {"status":"active"}    -> diterima, stok tetap 1   <-- approve palsu
PUT {"status":"returned"}  -> diterima, stok jadi 2    <-- +1 dari udara
```

Sebab: `src/app/api/transactions/[id]/route.ts` — cabang `returned` hanya
memeriksa status tujuan bukan `returned`, tanpa memeriksa status ASAL harus
`active`. Urutan pada transaksi yang stoknya belum pernah dipotong
(`rejected`/`pending_approval`) membuat stok dikembalikan dua kali.

Catatan positif: status ngawur (`STATUS_NGAWUR`) ditolak constraint MySQL (500).

Dampak: stok bisa lebih besar dari fisik → over-booking pada persetujuan
berikutnya. Hanya bisa dilakukan admin/super_admin.

**Status: DIPERBAIKI** — `d0ffb07`. Transisi divalidasi; `returned` hanya sah
dari `active`; hanya `notes` yang boleh diubah bebas.

### #3.3 — Nama berkas unggahan tanpa ID → berkas saling menimpa — SEDANG

Bukti: dua transaksi nama peminjam sama ("Timpa Uji"), tanggal sama:
```
POST /api/transactions/12/upload -> {"url":"/uploads/signed_forms/PB_Timpa_Uji_22092026.pdf"}
POST /api/transactions/13/upload -> {"url":"/uploads/signed_forms/PB_Timpa_Uji_22092026.pdf"}  <-- SAMA
isi folder: hanya 1 berkas — berkas tx#12 hilang tertimpa
```

Sebab: `src/app/api/transactions/[id]/upload/route.ts` —
`safeFilename = PB_${borrowerSafe}_${dateStr}${originalExt}` tanpa pembeda
unik. Pola sama di `src/app/api/handovers/[id]/upload/route.ts`.

Dampak: dua peminjam bernama sama di hari sama saling menghapus dokumen.
Yang kalah kehilangan berkas bertanda tangan padahal DB masih menunjuk ke sana.

**Status: DIPERBAIKI** — `2aca862`. `${txId}` / `${hvId}` ditambahkan ke
`safeFilename`.

### #3.4 — Temuan tambahan saat audit #3

- `GET /api/transactions` terbuka → ditutup di `45a5783`.
- Halaman `/admin/transactions` gagal load (`Unknown column
  transaction_items.item_name`) → `a42cb88` (`namaSqlLegacy()`).
- `fix(items): tolak ID non-angka dengan 400, bukan 500` → `17941d6`.

**Laporan mentah:** `/root/audit-20260922/temuan.md`

---

## Audit #2 — Awal Sep 2026 — Audit auth endpoint & logika lokasi/kode

Fokus: endpoint auth, logika lokasi/kode barang, double role.

Temuan utama (commit `45a5783` "Audit menyeluruh: tutup GET
/api/transactions, fix 6 bug lokasi/kode/PDF" dan `6063fe4` "audit auth
endpoint"):

- `GET /api/transactions` bisa diakses tanpa login → ditutup.
- 6 bug lokasi/kode barang + PDF diperbaiki.
- Endpoint auth diperiksa.

**Status: SELESAI.**

---

## Audit #1 — 3 Sep 2026 — Pembersihan riwayat tanda tangan

Tanda tangan asli user sempat ikut ter-commit ke git. Ditangani dengan
`git filter-repo` + force-push, lalu `public/uploads` berhenti dilacak
(`e6a6dee`), dan prosedurnya dicatat (`59f3d96`).

**Status: SELESAI.** Prosedur: lihat skill `git-history-hygiene`.

---

## Temuan yang SENGAJA DIBIARKAN

Ditulis dengan alasannya supaya tidak dikira kelewat.

| Temuan | Alasan dibiarkan | Kapan ditinjau ulang |
|---|---|---|
| 3 riwayat lama nama barangnya kosong (tx#4, #5, #6) → tampil "Barang" | Barangnya dihapus SEBELUM kolom snapshot ada; tidak bisa dipulihkan | Kalau perlu, isi manual dari dokumen PDF lama |
| Mikroskop 5 unit hanya dapat 1 label | `item_code` per baris, bukan per unit. Belum dirancang pemecahan kode per unit | Kalau label per unit fisik dibutuhkan |
| Tabel `handovers` DB tak punya kolom `signature_url` meski schema Drizzle mendeklarasikannya | Tidak dipakai di alur nyata | Sebelum memakai kolom itu |
| Login Google `error=Configuration` belum dites ulang di domain science | Kredensial OAuth belum dipasang di domain baru | Sebelum mengaktifkan login Google |
| Impor barang belum transaksional (satu INSERT massal) | Risiko kecil untuk file kecil; gagal di tengah bisa menyisakan sebagian baris | Kalau file bisa ratusan baris → bungkus transaksi |
| Kasus salah PILIH barang (Laptop 10 vs fisik 11) | Diputuskan ditunda 22 Sep 2026; hanya bisa diperbaiki selama `pending_approval` | Kalau muncul lagi |
| 2 salinan aturan peminjaman (`/api/pinjam` dan `/api/public/borrow`) | Sudah disamakan perilakunya, tapi kodenya masih terpisah | Kalau salah satu diubah, ubah keduanya |
