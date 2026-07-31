import { supabaseAdmin } from '../../../config/database.js';
import { hfConfig } from '../../config/hf.config.js';

// Random 5-character alphanumeric generator
function getRandomString(length = 5) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export const syncService = {
  // Get sync status & metrics
  async getSyncStatus() {
    // 1. Get sync config
    const { data: config } = await supabaseAdmin
      .from('sync_config')
      .select('*')
      .limit(1)
      .maybeSingle();

    // 2. Count supabase (pending sync)
    const { count: supabaseCount } = await supabaseAdmin
      .from('dataset_foto')
      .select('id', { count: 'exact', head: true })
      .eq('lokasi', 'supabase')
      .eq('status', 'disetujui');

    // 3. Count huggingface (synced)
    const { count: hfCount } = await supabaseAdmin
      .from('dataset_foto')
      .select('id', { count: 'exact', head: true })
      .eq('lokasi', 'huggingface');

    // 4. Latest sync log
    const { data: lastLog } = await supabaseAdmin
      .from('sync_log')
      .select('*')
      .order('triggered_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      config: config || {
        auto_sync_enabled: false,
        threshold_count: 500,
        cron_enabled: false,
        cron_expression: '0 2 * * *',
      },
      stats: {
        pending_sync_count: supabaseCount || 0,
        synced_count: hfCount || 0,
        total_count: (supabaseCount || 0) + (hfCount || 0),
        hf_repo: hfConfig.repo,
      },
      last_sync: lastLog || null,
    };
  },

  // Update sync configuration
  async updateConfig(payload, adminId) {
    const { auto_sync_enabled, threshold_count, cron_enabled, cron_expression } = payload;

    const { data: existing } = await supabaseAdmin
      .from('sync_config')
      .select('id')
      .limit(1)
      .maybeSingle();

    let result;
    if (existing?.id) {
      const { data } = await supabaseAdmin
        .from('sync_config')
        .update({
          auto_sync_enabled,
          threshold_count: Number(threshold_count) || 500,
          cron_enabled,
          cron_expression,
          updated_by: adminId,
          updated_at: new Date(),
        })
        .eq('id', existing.id)
        .select()
        .single();
      result = data;
    } else {
      const { data } = await supabaseAdmin
        .from('sync_config')
        .insert([{
          auto_sync_enabled,
          threshold_count: Number(threshold_count) || 500,
          cron_enabled,
          cron_expression,
          updated_by: adminId,
        }])
        .select()
        .single();
      result = data;
    }

    return result;
  },

  // Execute single batch commit sync to HuggingFace
  async executeBatchSync(adminId = null) {
    // Log start of sync
    const { data: logEntry } = await supabaseAdmin
      .from('sync_log')
      .insert([{
        tipe: 'huggingface',
        status: 'berjalan',
        jumlah_foto: 0,
        triggered_by: adminId,
      }])
      .select()
      .single();

    try {
      // 1. Fetch all pending approved photos with class details
      const { data: photos, error: errFetch } = await supabaseAdmin
        .from('dataset_foto')
        .select('*, class_produk(id, nama, slug, thumbnail_url)')
        .eq('lokasi', 'supabase')
        .eq('status', 'disetujui')
        .limit(1000); // Safety limit per batch

      if (errFetch) throw errFetch;

      if (!photos || photos.length === 0) {
        await supabaseAdmin
          .from('sync_log')
          .update({
            status: 'berhasil',
            jumlah_foto: 0,
            pesan_error: 'Tidak ada foto yang perlu di-sync',
            selesai_at: new Date(),
          })
          .eq('id', logEntry.id);

        return { berhasil: true, pesan: 'Tidak ada foto yang perlu di-sync', count: 0 };
      }

      const actions = [];
      const classSeqMap = {};
      const updatedPhotoRecords = [];
      const supabasePathsToDelete = [];

      // 2. Prepare commit actions for HuggingFace Hub
      for (const photo of photos) {
        const slug = photo.class_produk?.slug || 'unclassified';
        if (!classSeqMap[slug]) classSeqMap[slug] = 1;
        const seqNum = String(classSeqMap[slug]++).padStart(3, '0');
        const randStr = getRandomString(5);
        const targetFilename = `${slug}_${randStr}_${seqNum}.jpg`;
        const hfPath = `data/${slug}/${targetFilename}`;

        // Fetch image buffer
        try {
          const imgRes = await fetch(photo.foto_url);
          if (!imgRes.ok) continue;

          const arrayBuffer = await imgRes.arrayBuffer();
          const base64Content = Buffer.from(arrayBuffer).toString('base64');

          actions.push({
            action: 'addOrUpdate',
            path: hfPath,
            encoding: 'base64',
            content: base64Content,
          });

          // Check thumbnail action
          const thumbPath = `data/${slug}/thumbnails/${slug}_thumb.jpg`;
          const thumbAlreadyInBatch = actions.some((a) => a.path === thumbPath);
          if (!thumbAlreadyInBatch) {
            actions.push({
              action: 'addOrUpdate',
              path: thumbPath,
              encoding: 'base64',
              content: base64Content, // Use first image as class thumbnail
            });
          }

          updatedPhotoRecords.push({
            id: photo.id,
            storage_path: hfPath,
            file_name: targetFilename,
            foto_url: `https://huggingface.co/datasets/${hfConfig.repo}/resolve/main/${hfPath}`,
          });

          if (photo.storage_path && photo.foto_url.includes('supabase')) {
            supabasePathsToDelete.push(photo.storage_path);
          }
        } catch (imgErr) {
          console.warn(`Gagal mendownload foto id ${photo.id}:`, imgErr.message);
        }
      }

      if (actions.length === 0) {
        throw new Error('Gagal memproses foto untuk commit HuggingFace');
      }

      // 3. Perform SINGLE BATCH COMMIT to HuggingFace API
      const commitRes = await fetch(`https://huggingface.co/api/datasets/${hfConfig.repo}/commit/main`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${hfConfig.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: `Sync ${updatedPhotoRecords.length} dataset photos via Tokiva POS Admin Engine`,
          actions,
        }),
      });

      const commitData = await commitRes.json();
      if (!commitRes.ok) {
        throw new Error(commitData.error || commitData.message || 'HuggingFace commit failed');
      }

      const commitId = commitData.commitUrl ? commitData.commitUrl.split('/').pop() : 'commit_success';

      // 4. Update database records to lokasi='huggingface'
      for (const rec of updatedPhotoRecords) {
        await supabaseAdmin
          .from('dataset_foto')
          .update({
            lokasi: 'huggingface',
            hf_commit_id: commitId,
            storage_path: rec.storage_path,
            file_name: rec.file_name,
            foto_url: rec.foto_url,
          })
          .eq('id', rec.id);
      }

      // 5. Delete raw files from Supabase Storage to save quota (optional cleanup)
      if (supabasePathsToDelete.length > 0) {
        try {
          await supabaseAdmin.storage.from('dataset-foto-ai').remove(supabasePathsToDelete);
        } catch (delErr) {
          console.warn('Storage cleanup note:', delErr.message);
        }
      }

      // 6. Update sync_log as successful
      await supabaseAdmin
        .from('sync_log')
        .update({
          status: 'berhasil',
          jumlah_foto: updatedPhotoRecords.length,
          commit_id: commitId,
          selesai_at: new Date(),
        })
        .eq('id', logEntry.id);

      return {
        berhasil: true,
        pesan: `Berhasil meng-sync ${updatedPhotoRecords.length} foto ke HuggingFace dalam 1 commit!`,
        count: updatedPhotoRecords.length,
        commit_id: commitId,
      };
    } catch (err) {
      console.error('HuggingFace Batch Sync Error:', err.message);
      await supabaseAdmin
        .from('sync_log')
        .update({
          status: 'gagal',
          pesan_error: err.message,
          selesai_at: new Date(),
        })
        .eq('id', logEntry.id);

      throw err;
    }
  },
};
