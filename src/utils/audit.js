import { supabaseAdmin } from '../config/database.js';

export async function auditLog({ toko_id, user_id, aksi, tabel, record_id, detail }) {
  try {
    await supabaseAdmin.from('audit_log').insert([{
      toko_id: toko_id || null,
      user_id: user_id || null,
      aksi,
      tabel: tabel || null,
      record_id: record_id || null,
      detail: detail ? JSON.stringify(detail) : null,
    }]);
  } catch (err) {
    console.error('Audit log error (non-blocking):', err.message);
  }
}
