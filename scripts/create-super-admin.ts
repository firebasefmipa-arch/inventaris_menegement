/**
 * Script untuk membuat akun Super Admin pertama kali
 * Jalankan dengan: npx tsx scripts/create-super-admin.ts
 */

import { db } from "../src/db";
import { users } from "../src/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function createSuperAdmin() {
  console.log("═".repeat(60));
  console.log("  SETUP AKUN SUPER ADMIN");
  console.log("═".repeat(60));
  console.log();

  try {
    const name = await question("Nama lengkap Super Admin: ");
    const email = await question("Email (username untuk login): ");
    const password = await question("Password: ");
    const phone = await question("No. HP (opsional): ");
    const department = await question("Departemen (opsional, misal: IT): ");

    if (!name.trim() || !email.trim() || !password.trim()) {
      console.error("\n❌ Nama, email, dan password wajib diisi!");
      rl.close();
      process.exit(1);
    }

    // Cek apakah email sudah ada
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.trim()))
      .limit(1);

    if (existing) {
      console.error(`\n❌ Email "${email}" sudah terdaftar!`);
      rl.close();
      process.exit(1);
    }

    // Hash password
    console.log("\n⏳ Membuat akun...");
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert ke database
    await db.insert(users).values({
      name: name.trim(),
      email: email.trim(),
      password: hashedPassword,
      phone: phone.trim() || null,
      department: department.trim() || null,
      role: "super_admin",
      status: "active",
      emailVerified: new Date(),
    });

    console.log("\n✅ Akun Super Admin berhasil dibuat!");
    console.log("═".repeat(60));
    console.log("  DETAIL AKUN");
    console.log("═".repeat(60));
    console.log(`Nama      : ${name}`);
    console.log(`Email     : ${email}`);
    console.log(`Role      : Super Admin`);
    console.log(`Status    : Active`);
    console.log();
    console.log("💡 Login di: /admin/login");
    console.log();
  } catch (error) {
    console.error("\n❌ Terjadi kesalahan:", error);
    process.exit(1);
  } finally {
    rl.close();
    process.exit(0);
  }
}

createSuperAdmin();
