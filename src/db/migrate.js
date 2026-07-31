import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dbPool } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  console.log('🔄 Memulai eksekusi skema database Supabase PostgreSQL (schema.sql)...');
  
  try {
    const sqlPath = path.join(__dirname, 'schema.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    const client = await dbPool.connect();
    console.log('⚡ Terhubung ke Supabase PostgreSQL!');
    
    await client.query(sqlContent);
    client.release();
    
    console.log('✅ BERHASIL! Seluruh 26 tabel, triggers, indexes, dan RLS telah dibuat di Supabase!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Gagal mengeksekusi migration SQL:', err.message);
    process.exit(1);
  }
}

runMigration();
