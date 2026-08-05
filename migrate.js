const mysql = require('mysql2/promise');
async function run() {
  const conn = await mysql.createConnection('mysql://root:@127.0.0.1:3306/modern_lending');
  try {
    await conn.query('ALTER TABLE transactions ADD COLUMN borrower_name VARCHAR(255) NOT NULL DEFAULT "Unknown"');
    await conn.query('ALTER TABLE transactions ADD COLUMN borrower_email VARCHAR(255)');
    await conn.query('ALTER TABLE transactions ADD COLUMN borrower_phone VARCHAR(50)');
    await conn.query('ALTER TABLE transactions ADD COLUMN borrower_department VARCHAR(100)');
  } catch (e) {
    console.error(e.message);
  }
  console.log('done');
  process.exit(0);
}
run();
