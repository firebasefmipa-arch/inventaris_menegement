import { db } from './src/db';
import { sql } from 'drizzle-orm';

async function run() {
  try {
    await db.execute(sql`ALTER TABLE transactions MODIFY COLUMN status ENUM('pending_signature', 'pending_approval', 'active', 'rejected', 'returned', 'overdue') NOT NULL DEFAULT 'pending_signature'`);
    console.log('Modified status enum');
  } catch(e: any) {
    console.error('Status alter failed:', e.message);
  }
  
  try {
    await db.execute(sql`ALTER TABLE transactions ADD COLUMN signed_document_url VARCHAR(500)`);
    console.log('Added signed_document_url');
  } catch(e: any) {
    if (e.message.includes('Duplicate column name')) {
      console.log('signed_document_url already exists');
    } else {
      console.error('Column add failed:', e.message);
    }
  }
  console.log('Done');
  process.exit(0);
}

run();
