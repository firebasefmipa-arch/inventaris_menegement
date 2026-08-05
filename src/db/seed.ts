import "dotenv/config";
import { db } from "./index";
import { items, transactions } from "./schema";

async function seed() {
  console.log("🌱 Seeding database (MySQL)...");

  // Clear existing data (child table first)
  await db.delete(transactions);
  await db.delete(items);

  // Seed items (one-by-one to capture each generated id)
  const itemValues = [
    {
      name: "Proyektor Epson EB-X41",
      category: "Elektronik",
      description: "Proyektor 3600 lumens, cocok untuk presentasi dan pemutaran video. Resolusi XGA dengan kontras tinggi.",
      quantity: 5,
      availableQuantity: 3,
      status: "available" as const,
      location: "Ruang Server Lt.2",
    },
    {
      name: "Laptop Dell Latitude 5520",
      category: "Elektronik",
      description: "Laptop bisnis dengan Intel Core i7, RAM 16GB, SSD 512GB. Cocok untuk pekerjaan kantor dan presentasi.",
      quantity: 8,
      availableQuantity: 6,
      status: "available" as const,
      location: "Ruang IT Lt.1",
    },
    {
      name: "Speaker JBL PartyBox 310",
      category: "Audio",
      description: "Speaker portable Bluetooth 240W dengan lampu LED. Suara bass menggelegar cocok untuk acara.",
      quantity: 3,
      availableQuantity: 2,
      status: "available" as const,
      location: "Gudang Aula",
    },
    {
      name: "Kamera Canon EOS R10",
      category: "Fotografi",
      description: "Kamera mirrorless 24.2MP dengan lensa 18-45mm. Hasil foto tajam dan video 4K.",
      quantity: 3,
      availableQuantity: 1,
      status: "available" as const,
      location: "Ruang Multimedia",
    },
    {
      name: "Tripod Manfrotto MK290",
      category: "Fotografi",
      description: "Tripod aluminium ringan dengan kepala ball head. Tinggi maksimal 170cm.",
      quantity: 6,
      availableQuantity: 4,
      status: "available" as const,
      location: "Ruang Multimedia",
    },
    {
      name: "Microphone Wireless Sennheiser",
      category: "Audio",
      description: "Mic wireless profesional dengan receiver dual-channel. Jangkauan hingga 100 meter.",
      quantity: 4,
      availableQuantity: 0,
      status: "borrowed" as const,
      location: "Ruang Server Lt.2",
    },
    {
      name: "Tenda Lipat 3x3 Meter",
      category: "Peralatan Acara",
      description: "Tenda lipat portable dengan rangka besi kokoh. Termasuk tas carry.",
      quantity: 4,
      availableQuantity: 4,
      status: "available" as const,
      location: "Gudang Utama",
    },
    {
      name: "Kursi Lipat Plastik",
      category: "Peralatan Acara",
      description: "Kursi lipat plastik tebal warna putih. Kapasitas beban 120kg per kursi.",
      quantity: 50,
      availableQuantity: 35,
      status: "available" as const,
      location: "Gudang Utama",
    },
  ];

  const itemIds: number[] = [];
  for (const item of itemValues) {
    const [{ id }] = await db.insert(items).values(item).$returningId();
    itemIds.push(id);
  }

  // Mock borrower data
  const borrowerValues = [
    {
      borrowerName: "Andi Pratama",
      borrowerEmail: "andi.pratama@company.com",
      borrowerPhone: "081234567890",
      borrowerDepartment: "IT",
    },
    {
      borrowerName: "Budi Santoso",
      borrowerEmail: "budi.santoso@company.com",
      borrowerPhone: "081298765432",
      borrowerDepartment: "Marketing",
    },
    {
      borrowerName: "Citra Dewi",
      borrowerEmail: "citra.dewi@company.com",
      borrowerPhone: "081355512345",
      borrowerDepartment: "HRD",
    },
  ];

  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000);
  const daysFromNow = (d: number) => new Date(now.getTime() + d * 86400000);

  await db.insert(transactions).values([
    {
      itemId: itemIds[0],
      ...borrowerValues[0],
      quantity: 1,
      status: "active",
      borrowDate: daysAgo(3),
      expectedReturnDate: daysFromNow(2),
      notes: "Untuk presentasi mingguan",
    },
    {
      itemId: itemIds[1],
      ...borrowerValues[1],
      quantity: 1,
      status: "active",
      borrowDate: daysAgo(3),
      expectedReturnDate: daysFromNow(7),
      notes: "Untuk workshop marketing",
    },
    {
      itemId: itemIds[2],
      ...borrowerValues[2],
      quantity: 1,
      status: "active",
      borrowDate: daysAgo(3),
      expectedReturnDate: daysFromNow(2),
      notes: "Acara gathering HRD",
    },
    {
      itemId: itemIds[3],
      ...borrowerValues[0],
      quantity: 1,
      status: "active",
      borrowDate: daysAgo(1),
      expectedReturnDate: daysFromNow(7),
      notes: "Dokumentasi event",
    },
    {
      itemId: itemIds[5],
      ...borrowerValues[1],
      quantity: 2,
      status: "active",
      borrowDate: daysAgo(3),
      expectedReturnDate: daysFromNow(2),
      notes: "Untuk recording podcast",
    },
    {
      itemId: itemIds[4],
      ...borrowerValues[2],
      quantity: 1,
      status: "active",
      borrowDate: daysAgo(3),
      expectedReturnDate: daysFromNow(2),
      notes: "Foto produk HR",
    },
    {
      itemId: itemIds[7],
      ...borrowerValues[0],
      quantity: 15,
      status: "active",
      borrowDate: daysAgo(5),
      expectedReturnDate: daysFromNow(1),
      notes: "Untuk acara company gathering",
    },
    {
      itemId: itemIds[0],
      ...borrowerValues[1],
      quantity: 1,
      status: "returned",
      borrowDate: daysAgo(14),
      expectedReturnDate: daysAgo(7),
      actualReturnDate: daysAgo(7),
      notes: "Training selesai",
    },
    {
      itemId: itemIds[1],
      ...borrowerValues[2],
      quantity: 1,
      status: "returned",
      borrowDate: daysAgo(10),
      expectedReturnDate: daysAgo(3),
      actualReturnDate: daysAgo(3),
      notes: "Penggunaan selesai",
    },
  ]);

  console.log("✅ Database seeded successfully!");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
