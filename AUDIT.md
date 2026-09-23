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

### #5.6 — Endpoint hapus peminjaman massal: yatim & tanpa pemakai — SEDANG

Bukti:

```
pemanggil dari UI (seluruh src, termasuk superadmin) : 0
menghapus 1 transaksi -> baris transaction_items TETAP ADA (yatim)
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
