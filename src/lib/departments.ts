// Sumber tunggal daftar Divisi & Program Studi FMIPA UII.
// Dipakai di: register/complete, dashboard/profil, admin/users/create.
//
// Nama lama SENGAJA dipertahankan apa adanya — data user yang sudah tersimpan
// memakai string ini; mengganti namanya akan membuat prodi mereka dianggap
// tidak dikenal (Profil.tsx jatuh ke mode "Lainnya / isi manual").
// Daftar prodi mengikuti https://science.uii.ac.id/program-studi/

export const DEPARTMENT_GROUPS = [
  {
    group: "Divisi",
    options: [
      "Divisi Administrasi Akademik",
      "Divisi Administrasi Keuangan",
      "Divisi Teknologi Informasi",
      "Divisi Administrasi Umum, Rumah Tangga",
    ],
  },
  {
    group: "Program Studi",
    options: [
      // ── Diploma (D3) ──
      "D3 Analisis Kimia",
      // ── Sarjana (S1) ──
      "S1 Statistika",
      "S1 Kimia",
      "S1 Farmasi",
      "S1 Farmasi (Program Internasional)",
      "S1 Pendidikan Kimia",
      // ── Profesi ──
      "Program Profesi Apoteker",
      // ── Magister (S2) ──
      "S2 Magister Kimia",
      "S2 Magister Farmasi",
      "S2 Magister Statistika",
      // ── Doktor (S3) ──
      "S3 Doktor Farmasi",
    ],
  },
  { group: "Lainnya", options: ["Lainnya (isi manual)"] },
];

export const ALL_DEPARTMENT_OPTIONS = DEPARTMENT_GROUPS.flatMap((g) => g.options);
