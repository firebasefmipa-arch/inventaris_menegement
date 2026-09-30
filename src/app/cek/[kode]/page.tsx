/**
 * Halaman pemeriksaan dokumen — dibuka dengan memindai kotak QR di dokumen.
 *
 * SENGAJA TANPA LOGIN: yang memeriksa biasanya pihak luar (atasan, auditor)
 * yang tidak punya akun di sistem ini. Yang bisa dilihat hanya ringkasan yang
 * sudah dibatasi di @/lib/dokumen-verifikasi — nama/NIM/HP peminjam dan daftar
 * barang TIDAK ikut ditampilkan.
 */
import Link from "next/link";
import { ShieldCheck, ShieldX, ShieldAlert } from "lucide-react";
import { cariDokumen, labelStatus, statusBatal } from "@/lib/dokumen-verifikasi";

export const dynamic = "force-dynamic";

const bulan = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function tanggalPanjang(d: Date) {
  const t = new Date(d);
  return `${t.getDate()} ${bulan[t.getMonth()]} ${t.getFullYear()}`;
}

function tanggalJam(d: Date) {
  const t = new Date(d);
  const jam = String(t.getHours()).padStart(2, "0");
  const menit = String(t.getMinutes()).padStart(2, "0");
  return `${tanggalPanjang(d)}, ${jam}:${menit}`;
}

function Baris({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div className="flex gap-4 py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <span className="w-28 shrink-0 text-sm text-gray-500 dark:text-gray-400">{label}</span>
      <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100 break-words">{nilai}</span>
    </div>
  );
}

export default async function CekDokumenPage({
  params,
}: {
  params: Promise<{ kode: string }>;
}) {
  const { kode } = await params;
  const dok = await cariDokumen(decodeURIComponent(kode));

  const batal = dok ? statusBatal(dok.status) : false;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center py-10 px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Pemeriksaan Dokumen</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Inventaris FMIPA UII</p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
          {!dok ? (
            <>
              <div className="flex items-center gap-3 mb-4">
                <ShieldX className="w-8 h-8 text-red-600 shrink-0" />
                <span className="text-lg font-bold text-red-700 dark:text-red-400">Kode tidak ditemukan</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Kode yang dimasukkan tidak terdaftar di sistem. Dokumen dengan kode ini
                kemungkinan besar bukan keluaran resmi sistem Inventaris FMIPA UII.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-5">
                {batal ? (
                  <>
                    <ShieldAlert className="w-8 h-8 text-amber-600 shrink-0" />
                    <span className="text-lg font-bold text-amber-700 dark:text-amber-400">
                      Dokumen sudah dibatalkan
                    </span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-8 h-8 text-green-600 shrink-0" />
                    <span className="text-lg font-bold text-green-700 dark:text-green-400">
                      Dokumen terdaftar
                    </span>
                  </>
                )}
              </div>

              {batal && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
                  Dokumen ini pernah diterbitkan, tetapi pengajuannya dibatalkan. Dokumen ini
                  sudah tidak berlaku lagi.
                </p>
              )}

              <Baris
                label="Jenis"
                nilai={
                  dok.jenis === "peminjaman"
                    ? "Formulir Peminjaman Alat & Barang"
                    : "Dokumen Serah Terima"
                }
              />
              <Baris label="Nomor" nilai={`#${dok.nomor}`} />
              <Baris label="Tanggal" nilai={tanggalPanjang(dok.tanggal)} />
              <Baris label="Unit" nilai={dok.unit || "-"} />
              <Baris label="Status" nilai={labelStatus(dok.status)} />
              {dok.penyetuju && (
                <Baris
                  label="Disetujui"
                  nilai={
                    dok.tanggalSetuju
                      ? `${dok.penyetuju}\npada ${tanggalJam(dok.tanggalSetuju)}`
                      : dok.penyetuju
                  }
                />
              )}
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 dark:text-gray-600 mt-5">
          Dicetak oleh sistem Inventaris FMIPA UII
        </p>
        <p className="text-center text-xs text-gray-400 dark:text-gray-600 mt-1">
          <Link href="/login" className="underline hover:text-gray-600 dark:hover:text-gray-400">
            Masuk ke sistem
          </Link>
        </p>
      </div>
    </div>
  );
}
