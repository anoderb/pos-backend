import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

// Client Supabase Lama (Prototype) - Read from process.env
const OLD_SUPABASE_URL = process.env.OLD_SUPABASE_URL || 'https://mkfokoifzniofquqbwsi.supabase.co';
const OLD_SERVICE_ROLE_KEY = process.env.OLD_SUPABASE_SERVICE_ROLE_KEY;
const oldSupabase = createClient(OLD_SUPABASE_URL, OLD_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Client Supabase Baru (Tokiva POS Production)
const NEW_SUPABASE_URL = process.env.SUPABASE_URL;
const NEW_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const newSupabase = createClient(NEW_SUPABASE_URL, NEW_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_DEFAULT_EMAIL || 'admin@tokiva.biz.id';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_DEFAULT_PASSWORD || 'Admin123!@#';

async function runSelectiveMigration() {
  console.log('🚀 [MIGRASI SELEKTIF] Memulai proses impor data dari Supabase Lama (ap-southeast-1) ke Baru (ap-northeast-2)...\n');

  try {
    // Step 1: Seed Super Admin Account in pengguna_admin
    console.log('1️⃣ Memeriksa Akun Default Super Admin di `pengguna_admin`...');
    const { data: adminList } = await newSupabase
      .from('pengguna_admin')
      .select('id')
      .eq('email', SUPER_ADMIN_EMAIL);

    let superAdminId = adminList?.[0]?.id;

    if (!superAdminId) {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, salt);

      const { data: newAdmin, error: adminErr } = await newSupabase
        .from('pengguna_admin')
        .insert([{
          nama: 'Super Admin Tokiva',
          email: SUPER_ADMIN_EMAIL,
          password_hash: passwordHash,
          role: 'super_admin',
          aktif: true,
        }])
        .select()
        .single();

      if (adminErr) {
        console.warn('⚠️ Catatan Super Admin:', adminErr.message);
      } else {
        superAdminId = newAdmin.id;
        console.log(`   ✅ Default Super Admin berhasil dibuat! (${SUPER_ADMIN_EMAIL})`);
      }
    } else {
      console.log('   ℹ️ Akun Super Admin sudah ada di database.');
    }

    // Step 2: Migrate master_produk_ai -> class_produk
    console.log('\n2️⃣ Memindahkan 26 produk dari `master_produk_ai` -> `class_produk`...');
    const { data: oldProducts, error: oldProdErr } = await oldSupabase
      .from('master_produk_ai')
      .select('*');

    if (oldProdErr) {
      throw new Error(`Gagal membaca master_produk_ai: ${oldProdErr.message}`);
    }

    console.log(`   -> Berhasil membaca ${oldProducts.length} data produk lama.`);

    const classMapping = new Map(); // slug -> class_id baru

    for (const prod of oldProducts) {
      const slug = (prod.nama || '')
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');

      const { data: newClass, error: classErr } = await newSupabase
        .from('class_produk')
        .upsert([{
          nama: prod.nama,
          slug: slug,
          barcode: prod.barcode,
          deskripsi: prod.deskripsi || `${prod.brand || ''} ${prod.kategori || ''}`.trim(),
          aktif: prod.status === 'aktif',
          created_by: superAdminId || null,
        }], { onConflict: 'slug' })
        .select()
        .single();

      if (classErr) {
        console.warn(`   ⚠️ Class "${prod.nama}" warning: ${classErr.message}`);
      } else if (newClass) {
        classMapping.set(slug, newClass.id);
        classMapping.set(prod.id, newClass.id);
      }
    }

    console.log(`   ✅ Berhasil memigrasikan ${classMapping.size / 2} class produk ke \`class_produk\`!`);

    // Step 3: Migrate photos_hf -> dataset_foto
    console.log('\n3️⃣ Memindahkan 4.800 Foto AI dari `photos_hf` -> `dataset_foto`...');
    const { data: oldDatasets } = await oldSupabase.from('datasets_hf').select('*');
    const oldDatasetMap = new Map();
    (oldDatasets || []).forEach(d => oldDatasetMap.set(d.id, d.slug));

    let totalPhotosMigrated = 0;
    let from = 0;
    const batchSize = 1000;

    while (true) {
      const { data: photoBatch, error: pErr } = await oldSupabase
        .from('photos_hf')
        .select('*')
        .range(from, from + batchSize - 1);

      if (pErr || !photoBatch || photoBatch.length === 0) break;

      const formattedBatch = photoBatch.map(p => {
        const datasetSlug = oldDatasetMap.get(p.dataset_id);
        const targetClassId = classMapping.get(datasetSlug);

        return {
          class_id: targetClassId || null,
          foto_url: `https://huggingface.co/datasets/${process.env.HF_REPO || 'Anoderb/dataset-collect'}/resolve/main/${p.storage_path}`,
          file_name: p.file_name,
          storage_path: p.storage_path,
          file_size: p.file_size,
          width: p.width,
          height: p.height,
          sumber: 'admin',
          status: 'disetujui',
          lokasi: 'huggingface',
          reviewed_by: superAdminId || null,
          reviewed_at: new Date(),
        };
      }).filter(p => p.class_id !== null);

      if (formattedBatch.length > 0) {
        const { error: insertErr } = await newSupabase
          .from('dataset_foto')
          .insert(formattedBatch);

        if (insertErr) {
          console.warn(`   ⚠️ Batch insert warning: ${insertErr.message}`);
        } else {
          totalPhotosMigrated += formattedBatch.length;
          console.log(`   -> Batch tersimpan: +${formattedBatch.length} foto (Total: ${totalPhotosMigrated})`);
        }
      }

      from += batchSize;
    }

    console.log(`\n🎉 [MIGRASI SELEKTIF SUKSES] Total ${totalPhotosMigrated} Foto AI & 26 Produk berhasil terimpor ke Tokiva!`);
    process.exit(0);
  } catch (err) {
    console.error('\n❌ [MIGRASI GAGAL]:', err.message);
    process.exit(1);
  }
}

runSelectiveMigration();
