import { config } from "dotenv";
config({ path: ".env.local" });
import mysql from "mysql2/promise";

async function run() {
  const pool = mysql.createPool({ uri: process.env.DATABASE_URL });
  try {
    console.log("Altering items.status enum to remove 'maintenance'...");
    await pool.query(`ALTER TABLE items MODIFY COLUMN status ENUM('available','borrowed') NOT NULL DEFAULT 'available'`);
    console.log("Done! Status enum updated.");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
