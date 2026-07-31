import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { dbPool } from '../config/database.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_DEFAULT_EMAIL || 'admin@tokiva.biz.id';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_DEFAULT_PASSWORD || 'Admin123!@#';

async function runAdminMigration() {
  console.log('🚀 [ADMIN MIGRATE] Memulai migrasi 7 tabel Admin Panel...');

  let client;
  try {
    const sqlPath = path.join(__dirname, 'admin_schema.sql');
    const sqlScript = fs.readFileSync(sqlPath, 'utf8');

    client = await dbPool.connect();
    console.log('⚡ Terhubung ke Supabase Database Pooler!');

    await client.query(sqlScript);
    console.log('✅ [ADMIN MIGRATE] 7 Tabel Admin berhasil dibuat / dipastikan ada di DB!');

    // Seed Default Super Admin Account if not exists
    const { rows: existing } = await client.query('SELECT id FROM pengguna_admin WHERE email = $1', [SUPER_ADMIN_EMAIL]);

    if (existing.length === 0) {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, salt);

      await client.query(
        `INSERT INTO pengguna_admin (nama, email, password_hash, role, aktif)
         VALUES ($1, $2, $3, $4, $5)`,
        ['Super Admin Tokiva', SUPER_ADMIN_EMAIL, passwordHash, 'super_admin', true]
      );
      console.log('🎉 [ADMIN MIGRATE] Akun Default Super Admin berhasil dibuat!');
      console.log(`   -> Email: ${SUPER_ADMIN_EMAIL}`);
    } else {
      console.log('ℹ️ [ADMIN MIGRATE] Akun Super Admin sudah ada di database.');
    }

    client.release();
    console.log('✨ [ADMIN MIGRATE] Migrasi Admin selesai sempurna!');
    process.exit(0);
  } catch (err) {
    if (client) client.release();
    console.error('❌ [ADMIN MIGRATE] Gagal mengeksekusi migrasi:', err.message);
    process.exit(1);
  }
}

runAdminMigration();
