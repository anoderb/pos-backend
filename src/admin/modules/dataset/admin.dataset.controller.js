import { supabaseAdmin } from '../../../config/database.js';
import { hfConfig } from '../../config/hf.config.js';
import { syncService } from './sync.service.js';

export const adminDatasetController = {
  // GET /api/admin/dataset/class (List all AI classes with EXACT SQL COUNT & COVER IMAGE)
  async listClass(request, reply) {
    try {
      const { search } = request.query || {};

      // 1. Fetch master class produk
      let query = supabaseAdmin
        .from('class_produk')
        .select('*')
        .order('nama', { ascending: true });

      if (search) {
        query = query.ilike('nama', `%${search}%`);
      }

      const { data: classes, error } = await query;
      if (error) throw error;

      // 2. Fetch EXACT SQL photo count & cover photo for each class in parallel
      const formattedClasses = await Promise.all(
        (classes || []).map(async (c) => {
          // Fetch exact SQL count in dataset_foto table for this class_id
          const { count } = await supabaseAdmin
            .from('dataset_foto')
            .select('id', { count: 'exact', head: true })
            .eq('class_id', c.id);

          // Fetch first cover photo record for thumbnail
          const { data: coverSample } = await supabaseAdmin
            .from('dataset_foto')
            .select('storage_path, foto_url')
            .eq('class_id', c.id)
            .limit(1)
            .maybeSingle();

          const proxyUrl = coverSample?.storage_path
            ? `${getPublicBaseUrl(request)}/api/admin/dataset/image-proxy?path=${encodeURIComponent(coverSample.storage_path)}`
            : coverSample?.foto_url || c.thumbnail_url || null;

          return {
            ...c,
            total_foto: count !== null && count !== undefined ? count : 0,
            thumbnail_url: proxyUrl,
          };
        })
      );

      return reply.send({
        berhasil: true,
        pesan: 'Daftar Class Produk AI',
        data: formattedClasses,
      });
    } catch (err) {
      return reply.code(500).send({
        berhasil: false,
        pesan: 'Gagal mengambil class produk: ' + err.message,
      });
    }
  },

  // POST /api/admin/dataset/class (Create new AI class)
  async tambahClass(request, reply) {
    try {
      const { nama, barcode, deskripsi, thumbnail_url } = request.body || {};

      if (!nama) {
        return reply.code(400).send({ berhasil: false, pesan: 'Nama class produk wajib diisi' });
      }

      const slug = nama
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');

      const { data: newClass, error } = await supabaseAdmin
        .from('class_produk')
        .insert([{
          nama,
          slug,
          barcode,
          deskripsi,
          thumbnail_url,
          created_by: request.admin?.id || null,
        }])
        .select()
        .single();

      if (error) throw error;

      return reply.send({
        berhasil: true,
        pesan: 'Class produk berhasil ditambahkan',
        data: newClass,
      });
    } catch (err) {
      return reply.code(500).send({
        berhasil: false,
        pesan: 'Gagal menambah class produk: ' + err.message,
      });
    }
  },

  // GET /api/admin/dataset/foto (List AI Dataset Photos with Proxied URLs)
  async listFoto(request, reply) {
    try {
      const { class_id, status, limit = 200, offset = 0 } = request.query || {};

      let query = supabaseAdmin
        .from('dataset_foto')
        .select('*, class_produk(nama, slug)')
        .order('created_at', { ascending: false });

      if (class_id) query = query.eq('class_id', class_id);
      if (status) query = query.eq('status', status);

      if (limit) {
        query = query.range(Number(offset), Number(offset) + Number(limit) - 1);
      }

      const { data: photos, error } = await query;
      if (error) throw error;

      const formatted = (photos || []).map((p) => {
        const proxyUrl = p.storage_path
          ? `${getPublicBaseUrl(request)}/api/admin/dataset/image-proxy?path=${encodeURIComponent(p.storage_path)}`
          : p.foto_url;
        return {
          ...p,
          foto_url: proxyUrl,
        };
      });

      return reply.send({
        berhasil: true,
        pesan: 'Daftar Foto Dataset AI',
        data: formatted,
        meta: { limit: Number(limit), offset: Number(offset), hf_repo: hfConfig.repo },
      });
    } catch (err) {
      return reply.code(500).send({
        berhasil: false,
        pesan: 'Gagal mengambil foto dataset: ' + err.message,
      });
    }
  },

  // GET /api/admin/dataset/image-proxy (Stream private HuggingFace image with HF_TOKEN)
  async proxyImage(request, reply) {
    try {
      const { path: storagePath, url: fullUrl } = request.query || {};

      let targetUrl = fullUrl;
      if (!targetUrl && storagePath) {
        targetUrl = `https://huggingface.co/datasets/${hfConfig.repo}/resolve/main/${storagePath}`;
      }

      if (!targetUrl) {
        return reply.code(400).send({ berhasil: false, pesan: 'Path atau URL gambar required' });
      }

      // Fetch from private HuggingFace repo using HF_TOKEN
      const res = await fetch(targetUrl, {
        headers: {
          'Authorization': `Bearer ${hfConfig.token}`,
        },
      });

      if (!res.ok) {
        return reply.code(res.status).send({ berhasil: false, pesan: 'HuggingFace image fetch failed' });
      }

      // Handle redirect to AWS S3 / CloudFront CDN
      const finalUrl = res.url;
      const imageRes = await fetch(finalUrl);

      const contentType = imageRes.headers.get('content-type') || 'image/jpeg';
      const arrayBuffer = await imageRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      reply.header('Content-Type', contentType);
      reply.header('Cache-Control', 'public, max-age=86400');
      return reply.send(buffer);
    } catch (err) {
      return reply.code(500).send({ berhasil: false, pesan: 'Proxy image error: ' + err.message });
    }
  },

  // GET /api/admin/dataset/unmapped (List all unmapped store products)
  async listUnmapped(request, reply) {
    try {
      const { search } = request.query || {};
      let query = supabaseAdmin
        .from('produk')
        .select('*, toko:toko_id(nama), kategori:kategori_id(nama)')
        .or('class_status.eq.unmapped,class_status.is.null')
        .eq('aktif', true)
        .order('created_at', { ascending: false });

      if (search) {
        query = query.or(`nama.ilike.%${search}%,barcode.ilike.%${search}%`);
      }

      const { data: unmapped, error } = await query;
      if (error) throw error;

      return reply.send({
        berhasil: true,
        pesan: 'Daftar Produk Belum Ter-mapping',
        data: unmapped || [],
      });
    } catch (err) {
      return reply.code(500).send({ berhasil: false, pesan: 'Gagal mengambil data unmapped: ' + err.message });
    }
  },

  // DELETE /api/admin/dataset/unmapped/:id (Soft-delete produk unmapped)
  async deleteUnmapped(request, reply) {
    try {
      const { id } = request.params || {};
      const { data, error } = await supabaseAdmin
        .from('produk')
        .update({ aktif: false })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return reply.send({ berhasil: true, pesan: 'Produk berhasil dihapus', data });
    } catch (err) {
      return reply.code(500).send({ berhasil: false, pesan: 'Gagal menghapus produk: ' + err.message });
    }
  },

  // POST /api/admin/dataset/map-class (Assign product(s) to existing AI class)
  async mapClass(request, reply) {
    try {
      const { produk_ids, class_id, barcode, nama_varian } = request.body || {};
      if (!Array.isArray(produk_ids) || produk_ids.length === 0 || !class_id) {
        return reply.code(400).send({ berhasil: false, pesan: 'produk_ids (array) & class_id wajib diisi' });
      }

      // If barcode provided, add to class_barcode_map
      if (barcode && String(barcode).trim()) {
        await supabaseAdmin
          .from('class_barcode_map')
          .upsert([{
            class_id,
            barcode: String(barcode).trim(),
            nama_varian: nama_varian || null,
          }], { onConflict: 'barcode' });
      }

      // Update produk table for all selected produk_ids
      const { data: updated, error } = await supabaseAdmin
        .from('produk')
        .update({
          class_produk_id: class_id,
          class_status: 'mapped',
        })
        .in('id', produk_ids)
        .select();

      if (error) throw error;

      return reply.send({
        berhasil: true,
        pesan: `Berhasil memetakan ${updated?.length || 0} produk ke class`,
        data: updated,
      });
    } catch (err) {
      return reply.code(500).send({ berhasil: false, pesan: 'Gagal memetakan produk: ' + err.message });
    }
  },

  // POST /api/admin/dataset/create-class-and-map (Create new class and assign product(s))
  async createClassAndMap(request, reply) {
    try {
      const { nama_class, barcode, deskripsi, thumbnail_url, produk_ids } = request.body || {};
      if (!nama_class || !Array.isArray(produk_ids) || produk_ids.length === 0) {
        return reply.code(400).send({ berhasil: false, pesan: 'nama_class & produk_ids wajib diisi' });
      }

      const slug = nama_class
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');

      // Create new class_produk
      const { data: newClass, error: errClass } = await supabaseAdmin
        .from('class_produk')
        .insert([{
          nama: nama_class,
          slug,
          barcode: barcode || null,
          deskripsi: deskripsi || null,
          thumbnail_url: thumbnail_url || null,
          created_by: request.admin?.id || null,
        }])
        .select()
        .single();

      if (errClass) throw errClass;

      // Insert into class_barcode_map if barcode given
      if (barcode && String(barcode).trim()) {
        await supabaseAdmin
          .from('class_barcode_map')
          .upsert([{
            class_id: newClass.id,
            barcode: String(barcode).trim(),
            nama_varian: nama_class,
          }], { onConflict: 'barcode' });
      }

      // Update produk records
      const { data: updated, error: errUpdate } = await supabaseAdmin
        .from('produk')
        .update({
          class_produk_id: newClass.id,
          class_status: 'mapped',
        })
        .in('id', produk_ids)
        .select();

      if (errUpdate) throw errUpdate;

      return reply.send({
        berhasil: true,
        pesan: `Class ${nama_class} berhasil dibuat & memetakan ${updated?.length || 0} produk`,
        data: { class: newClass, produk: updated },
      });
    } catch (err) {
      return reply.code(500).send({ berhasil: false, pesan: 'Gagal membuat class & mapping: ' + err.message });
    }
  },

  // POST /api/admin/dataset/sync-huggingface
  async triggerSync(request, reply) {
    try {
      const adminId = request.admin?.id;
      const { class_ids } = request.body || {};
      const result = await syncService.executeBatchSync(adminId, class_ids);
      return reply.send(result);
    } catch (err) {
      return reply.code(500).send({ berhasil: false, pesan: 'Sync ke HuggingFace gagal: ' + err.message });
    }
  },

  // GET /api/admin/dataset/sync-status
  async getSyncStatus(request, reply) {
    try {
      const status = await syncService.getSyncStatus();
      return reply.send({ berhasil: true, data: status });
    } catch (err) {
      return reply.code(500).send({ berhasil: false, pesan: 'Gagal mengambil status sync: ' + err.message });
    }
  },

  // PUT /api/admin/dataset/sync-config
  async updateSyncConfig(request, reply) {
    try {
      const adminId = request.admin?.id;
      const config = await syncService.updateConfig(request.body || {}, adminId);
      return reply.send({ berhasil: true, pesan: 'Pengaturan auto-sync berhasil diperbarui', data: config });
    } catch (err) {
      return reply.code(500).send({ berhasil: false, pesan: 'Gagal mengupdate config sync: ' + err.message });
    }
  },

  // PUT /api/admin/dataset/class/:id/toggle-aktif
  async toggleClassAktif(request, reply) {
    try {
      const { id } = request.params;
      const { data: cls } = await supabaseAdmin.from('class_produk').select('aktif, nama').eq('id', id).maybeSingle();
      if (!cls) return reply.code(404).send({ berhasil: false, pesan: 'Class tidak ditemukan' });

      const newStatus = !cls.aktif;
      await supabaseAdmin.from('class_produk').update({ aktif: newStatus, updated_at: new Date().toISOString() }).eq('id', id);

      await supabaseAdmin.from('admin_log').insert([{
        admin_id: request.admin?.id,
        aksi: newStatus ? 'AKTIFKAN_CLASS' : 'NONAKTIFKAN_CLASS',
        referensi_id: id, referensi_tipe: 'class_produk',
      }]).catch(() => {});

      return reply.send({ berhasil: true, pesan: `Class "${cls.nama}" berhasil ${newStatus ? 'diaktifkan' : 'dinonaktifkan'}`, data: { aktif: newStatus } });
    } catch (err) {
      return reply.code(500).send({ berhasil: false, pesan: 'Gagal toggle status class: ' + err.message });
    }
  },

  // PUT /api/admin/dataset/class/:id
  async editClass(request, reply) {
    try {
      const { id } = request.params;
      const { nama, barcode, deskripsi } = request.body || {};

      const updateData = {};
      if (nama) {
        updateData.nama = nama;
        updateData.slug = nama.toLowerCase().replace(/[^\w-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      }
      if (barcode !== undefined) updateData.barcode = barcode;
      if (deskripsi !== undefined) updateData.deskripsi = deskripsi;
      updateData.updated_at = new Date().toISOString();

      const { data, error } = await supabaseAdmin.from('class_produk').update(updateData).eq('id', id).select().single();
      if (error) return reply.code(500).send({ berhasil: false, pesan: 'Gagal edit class: ' + error.message });

      // Sync barcode ke class_barcode_map
      if (barcode !== undefined) {
        await supabaseAdmin.from('class_barcode_map').update({ barcode }).eq('class_id', id).catch(() => {});
      }

      await supabaseAdmin.from('admin_log').insert([{
        admin_id: request.admin?.id, aksi: 'EDIT_CLASS',
        referensi_id: id, referensi_tipe: 'class_produk',
      }]).catch(() => {});

      return reply.send({ berhasil: true, pesan: 'Class berhasil diperbarui', data });
    } catch (err) {
      return reply.code(500).send({ berhasil: false, pesan: 'Gagal edit class: ' + err.message });
    }
  },

  // DELETE /api/admin/dataset/class/:id
  async deleteClass(request, reply) {
    try {
      const { id } = request.params;

      // Cek apakah class punya foto dataset
      const { count } = await supabaseAdmin.from('dataset_foto').select('id', { count: 'exact', head: true }).eq('class_id', id);
      if (count > 0) {
        return reply.code(400).send({ berhasil: false, pesan: `Tidak bisa hapus class dengan ${count} foto dataset. Hapus atau pindahkan foto terlebih dahulu.` });
      }

      const { error } = await supabaseAdmin.from('class_produk').delete().eq('id', id);
      if (error) return reply.code(500).send({ berhasil: false, pesan: 'Gagal hapus class: ' + error.message });

      await supabaseAdmin.from('admin_log').insert([{
        admin_id: request.admin?.id, aksi: 'HAPUS_CLASS',
        referensi_id: id, referensi_tipe: 'class_produk',
      }]).catch(() => {});

      return reply.send({ berhasil: true, pesan: 'Class berhasil dihapus' });
    } catch (err) {
      return reply.code(500).send({ berhasil: false, pesan: 'Gagal hapus class: ' + err.message });
    }
  },
};
