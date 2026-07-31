import { supabaseAdmin } from '../../../config/database.js';
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_MODELS_DIR = path.join(__dirname, '../../../../public/models');

// Helper to parse any class.json format (Array OR Object mapping { "0": "label", ... } OR { "label": 0, ... })
function extractOrderedClassLabels(parsedJson) {
  if (!parsedJson) return [];
  if (Array.isArray(parsedJson)) return parsedJson;

  if (typeof parsedJson === 'object') {
    const keys = Object.keys(parsedJson);
    const isNumKey = keys.every(k => !isNaN(Number(k)));

    if (isNumKey) {
      // Format: { "0": "amo-...", "1": "cleo-..." }
      return keys.sort((a, b) => Number(a) - Number(b)).map(k => parsedJson[k]);
    } else {
      // Format: { "amo-...": 0, "cleo-...": 1 }
      return Object.entries(parsedJson)
        .sort((a, b) => Number(a[1]) - Number(b[1]))
        .map(([label]) => label);
    }
  }
  return [];
}

export const adminModelController = {
  // GET /api/admin/model (List all AI models)
  async listModel(request, reply) {
    try {
      const { data: models, error } = await supabaseAdmin
        .from('model_versi')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return reply.send({
        berhasil: true,
        pesan: 'Daftar Versi Model AI',
        data: models || [],
      });
    } catch (err) {
      return reply.code(500).send({
        berhasil: false,
        pesan: 'Gagal mengambil versi model: ' + err.message,
      });
    }
  },

  // POST /api/admin/model/upload-tfjs (Upload ZIP or Direct Files, Auto-Extract & Auto-Sync class.json)
  async uploadTfjsBundle(request, reply) {
    try {
      const parts = request.files();
      let versi = 'v' + Date.now();
      let nama = 'MobileNetV2 + CBAM';
      let akurasi = 0.968;
      let modelJsonPath = null;
      let weightsPath = null;
      let classJsonUrl = null;
      let extractedCount = 0;
      let dynamicClasses = [];

      const fields = {};
      const uploadedFiles = [];

      for await (const part of parts) {
        if (part.file) {
          const buffer = await part.toBuffer();

          // Handle ZIP file upload
          if (part.filename.endsWith('.zip')) {
            try {
              const zip = new AdmZip(buffer);
              const versiClean = (fields.versi || versi).replace(/[^\w-]/g, '');
              const extractTargetDir = path.join(PUBLIC_MODELS_DIR, versiClean);

              if (!fs.existsSync(extractTargetDir)) {
                fs.mkdirSync(extractTargetDir, { recursive: true });
              }

              zip.extractAllTo(extractTargetDir, true);
              const zipEntries = zip.getEntries();
              extractedCount = zipEntries.length;

              // Check if class.json or labels.json exists inside ZIP
              const classEntry = zipEntries.find(e => e.entryName.toLowerCase().endsWith('class.json') || e.entryName.toLowerCase().endsWith('labels.json'));

              if (classEntry) {
                try {
                  const classContent = zip.readAsText(classEntry);
                  const parsedJson = JSON.parse(classContent);
                  const parsedLabels = extractOrderedClassLabels(parsedJson);

                  if (parsedLabels.length > 0) {
                    dynamicClasses = parsedLabels;
                    classJsonUrl = `http://localhost:5000/public/models/${versiClean}/${classEntry.entryName}`;

                    // Auto-sync new classes to DB class_produk
                    for (const label of parsedLabels) {
                      const slug = String(label).toLowerCase().replace(/[^\w-]/g, '-');
                      const uppercaseName = String(label).toUpperCase();
                      await supabaseAdmin.from('class_produk').upsert({
                        nama_class: uppercaseName,
                        slug,
                        status: 'aktif',
                      }, { onConflict: 'slug' }).catch(() => {});
                    }
                  }
                } catch (e) {
                  console.warn('Gagal parse class.json dari ZIP:', e.message);
                }
              }

              modelJsonPath = `http://localhost:5000/public/models/${versiClean}/model.json`;
              weightsPath = `http://localhost:5000/public/models/${versiClean}/group1-shard1of1.bin`;
            } catch (zipErr) {
              console.error('Error extracting ZIP model:', zipErr.message);
            }
          } else {
            // Direct .json or .bin or class.json file
            const versiClean = (fields.versi || versi).replace(/[^\w-]/g, '');
            const targetDir = path.join(PUBLIC_MODELS_DIR, versiClean);
            if (!fs.existsSync(targetDir)) {
              fs.mkdirSync(targetDir, { recursive: true });
            }
            const filePath = path.join(targetDir, part.filename);
            fs.writeFileSync(filePath, buffer);
            uploadedFiles.push(part.filename);

            if (part.filename === 'model.json') {
              modelJsonPath = `http://localhost:5000/public/models/${versiClean}/model.json`;
            } else if (part.filename.endsWith('.bin')) {
              weightsPath = `http://localhost:5000/public/models/${versiClean}/${part.filename}`;
            } else if (part.filename.endsWith('class.json') || part.filename.endsWith('labels.json')) {
              classJsonUrl = `http://localhost:5000/public/models/${versiClean}/${part.filename}`;
              try {
                const parsedJson = JSON.parse(buffer.toString());
                dynamicClasses = extractOrderedClassLabels(parsedJson);
              } catch (e) {}
            }
          }
        } else {
          fields[part.fieldname] = part.value;
        }
      }

      versi = fields.versi || versi;
      nama = fields.nama || nama;
      akurasi = fields.akurasi ? parseFloat(fields.akurasi) / 100 : akurasi;

      const finalJsonUrl = modelJsonPath || `http://localhost:5000/public/models/${versi}/model.json`;
      const finalWeightsUrl = weightsPath || `http://localhost:5000/public/models/${versi}/group1-shard1of1.bin`;
      const totalClassCount = dynamicClasses.length > 0 ? dynamicClasses.length : 24;

      // Save to Supabase DB model_versi
      const { data: newModel, error } = await supabaseAdmin
        .from('model_versi')
        .insert([{
          versi,
          nama,
          deskripsi: `Model TFJS Auto-Extracted (${totalClassCount} classes, ${extractedCount || uploadedFiles.length} files)`,
          akurasi,
          jumlah_class: totalClassCount,
          jumlah_data_training: 4800,
          ukuran_mb: 14.2,
          model_json_url: finalJsonUrl,
          weights_url: finalWeightsUrl,
          confidence_threshold: 0.65,
          status: 'nonaktif',
        }])
        .select()
        .single();

      if (error) throw error;

      return reply.send({
        berhasil: true,
        pesan: `Model TFJS ${versi} dengan ${totalClassCount} class produk berhasil diekstrak & disinkronkan ke database!`,
        data: newModel,
        dynamic_classes: dynamicClasses,
      });
    } catch (err) {
      return reply.code(500).send({
        berhasil: false,
        pesan: 'Gagal ekstrak & simpan model TFJS: ' + err.message,
      });
    }
  },

  // POST /api/admin/model (Upload & register new TFJS AI model version)
  async uploadModel(request, reply) {
    try {
      const { versi, nama, deskripsi, akurasi, jumlah_class, jumlah_data_training, ukuran_mb, model_json_url, weights_url, confidence_threshold, notes } = request.body || {};

      if (!versi) {
        return reply.code(400).send({
          berhasil: false,
          pesan: 'Versi model (misal v2.0-mobilenetv2-cbam) wajib diisi',
        });
      }

      const versiClean = versi.replace(/[^\w-]/g, '');
      const defaultJson = `http://localhost:5000/public/models/${versiClean}/model.json`;
      const defaultWeights = `http://localhost:5000/public/models/${versiClean}/group1-shard1of1.bin`;

      const { data: newModel, error } = await supabaseAdmin
        .from('model_versi')
        .insert([{
          versi,
          nama: nama || `MobileNetV2 + CBAM (${versi})`,
          deskripsi: deskripsi || 'TFJS Model Exported from Kaggle Notebook',
          akurasi: akurasi || 0.9680,
          jumlah_class: jumlah_class || 24,
          jumlah_data_training: jumlah_data_training || 4800,
          ukuran_mb: ukuran_mb || 14.20,
          model_json_url: model_json_url || defaultJson,
          weights_url: weights_url || defaultWeights,
          confidence_threshold: confidence_threshold || 0.6500,
          status: 'nonaktif',
          notes: notes || 'Model TFJS MobileNetV2 + CBAM Siap Diuji Sandbox',
          uploaded_by: request.admin?.id || null,
        }])
        .select()
        .single();

      if (error) throw error;

      return reply.send({
        berhasil: true,
        pesan: `Versi model ${versi} berhasil didaftarkan!`,
        data: newModel,
      });
    } catch (err) {
      return reply.code(500).send({
        berhasil: false,
        pesan: 'Gagal mengunggah model: ' + err.message,
      });
    }
  },

  // PUT /api/admin/model/:id/aktifkan (Set Active Production Deployment Model)
  async aktifkanModel(request, reply) {
    try {
      const { id } = request.params;
      const adminId = request.admin?.id;

      // 1. Set all other models to nonaktif
      await supabaseAdmin.from('model_versi').update({ status: 'nonaktif' }).neq('id', id);

      // 2. Activate target model
      const { data: activeModel, error } = await supabaseAdmin
        .from('model_versi')
        .update({
          status: 'aktif',
          activated_by: adminId,
          activated_at: new Date(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      await supabaseAdmin.from('admin_log').insert([{
        admin_id: adminId,
        aksi: 'AKTIFKAN_MODEL_AI',
        referensi_id: id,
        referensi_tipe: 'model_versi',
        detail: { versi: activeModel?.versi },
      }]).catch(() => {});

      return reply.send({
        berhasil: true,
        pesan: `Model AI ${activeModel?.versi} sekarang AKTIFF dan diterapkan ke seluruh POS Kasir!`,
        data: activeModel,
      });
    } catch (err) {
      return reply.code(500).send({
        berhasil: false,
        pesan: 'Gagal mengaktifkan model AI: ' + err.message,
      });
    }
  },

  // PUT /api/admin/model/:id/threshold (Update Confidence Threshold)
  async updateThreshold(request, reply) {
    try {
      const { id } = request.params;
      const { confidence_threshold } = request.body || {};

      if (confidence_threshold === undefined) {
        return reply.code(400).send({ berhasil: false, pesan: 'confidence_threshold wajib diisi' });
      }

      const { data: updatedModel, error } = await supabaseAdmin
        .from('model_versi')
        .update({ confidence_threshold: Number(confidence_threshold) })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return reply.send({
        berhasil: true,
        pesan: `Confidence threshold berhasil diperbarui ke ${(Number(confidence_threshold) * 100).toFixed(0)}%`,
        data: updatedModel,
      });
    } catch (err) {
      return reply.code(500).send({ berhasil: false, pesan: 'Gagal update threshold: ' + err.message });
    }
  },

  // DELETE /api/admin/model/:id (Delete non-active AI model version)
  async deleteModel(request, reply) {
    try {
      const { id } = request.params;

      const { data: targetModel, error: findErr } = await supabaseAdmin
        .from('model_versi')
        .select('*')
        .eq('id', id)
        .single();

      if (findErr || !targetModel) {
        return reply.code(404).send({ berhasil: false, pesan: 'Model tidak ditemukan' });
      }

      if (targetModel.status === 'aktif') {
        return reply.code(400).send({
          berhasil: false,
          pesan: 'Model yang sedang LIVE AKTIF di sistem POS tidak dapat dihapus. Aktifkan versi model lain terlebih dahulu.',
        });
      }

      const { error: delErr } = await supabaseAdmin
        .from('model_versi')
        .delete()
        .eq('id', id);

      if (delErr) throw delErr;

      return reply.send({
        berhasil: true,
        pesan: `Versi model ${targetModel.versi} berhasil dihapus dari registri!`,
      });
    } catch (err) {
      return reply.code(500).send({
        berhasil: false,
        pesan: 'Gagal menghapus model: ' + err.message,
      });
    }
  },
};
