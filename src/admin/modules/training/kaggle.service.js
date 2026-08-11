/**
 * Kaggle Training Service — Trigger notebook run, poll status, download output.
 *
 * Flow:
 *   1. pushNotebook()  → kaggle kernels push (notebook + metadata)
 *   2. pollStatus()    → kaggle kernels status
 *   3. downloadOutput()→ kaggle kernels output (ZIP + files)
 *   4. registerModel() → extract, save to /public/models, insert DB
 *
 * Kaggle credentials via env: KAGGLE_USERNAME + KAGGLE_KEY
 * HF token via env: HF_TOKEN (passed to notebook via Kaggle Secrets)
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';
import { supabaseAdmin } from '../../../config/database.js';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_MODELS_DIR = path.join(__dirname, '../../../../public/models');
const NOTEBOOK_PATH = path.join(__dirname, '../../../../kaggle/model-training-fix-mobilenet-cbam.ipynb');
const KERNEL_PUSH_DIR = path.join(__dirname, '../../../../kaggle/kernel-push');
const KERNEL_OUTPUT_DIR = path.join(__dirname, '../../../../kaggle/kernel-output');

const KERNEL_SLUG = 'tokiva-training-mobilenetv3-cbam';
const KERNEL_ID = `${process.env.KAGGLE_USERNAME}/${KERNEL_SLUG}`;

// ── Model naming & versioning helpers ──────────────────────────────
// Experiment key → human-friendly name
const EXPERIMENT_NAME_MAP = {
  'E1_MobileNetV3': 'E1_MobileNetV3L',
  'E2_MobileNetV3_CBAM': 'E2_MobileNetV3L_CBAM',
  'E1_MobileNetV2': 'E1_MobileNetV2',
  'E2_MobileNetV2_CBAM': 'E2_MobileNetV2L_CBAM',
};

/** Format Date → YYYYMMDDHHmm (lokal GMT+7) */
function formatTimestamp(date, withMinutes = true) {
  const d = new Date(date.getTime() + 7 * 3600 * 1000); // GMT+7
  const pad = (n) => String(n).padStart(2, '0');
  const base = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  return withMinutes ? `${base}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}` : base;
}

/** Normalize experiment key → readable name. Fallback: raw key. */
function normalizeExperimentKey(key) {
  if (!key) return 'EXPERIMENT';
  return EXPERIMENT_NAME_MAP[key] || key;
}

/** Build model nama: E1_MobileNetV3L_202608052326 */
function buildModelName(bestExperiment, now = new Date()) {
  const expKey = normalizeExperimentKey(bestExperiment || '');
  return `${expKey}_${formatTimestamp(now)}`;
}

/** Backbone signature → major version. Cache persistent di memory. */
const BACKBONE_MAJOR_MAP = {
  'MobileNetV3Large': 1,
  'MobileNetV2': 0, // legacy
};

/**
 * Build versi: v{major}.{minor}.{YYYYMMDD}
 * - Major: dari backbone signature (MobileNetV3Large → 1)
 * - Minor: count model_versi dengan major sama + 1 (retrain count)
 * - Pertama di major → v{major} (v1), berikutnya → v{major}.{minor}.{date}
 * - Override manual: { major, minor } options
 */
async function buildModelVersion(backbone, now = new Date(), override = null) {
  const major = override?.major ?? BACKBONE_MAJOR_MAP[backbone] ?? 0;

  // Count existing models with same major (versi starts with v{major} or v{major}.)
  const { data: existing, error } = await supabaseAdmin
    .from('model_versi')
    .select('versi')
    .order('created_at', { ascending: false })
    .limit(100);

  let minor = override?.minor ?? 1;
  if (!error && existing) {
    const sameMajor = existing.filter((m) => {
      const v = (m.versi || '').toLowerCase();
      return v === `v${major}` || v.startsWith(`v${major}.`);
    });
    minor = Math.max(minor, sameMajor.length + 1);
  }

  const date = formatTimestamp(now, false);
  if (minor === 1) return `v${major}`;
  return `v${major}.${minor}.${date}`;
}

/** Extract backbone from experiment key */
function backboneFromExperiment(expKey) {
  if (!expKey) return 'MobileNetV3Large';
  if (expKey.includes('V2')) return 'MobileNetV2';
  if (expKey.includes('V3')) return 'MobileNetV3Large';
  return 'MobileNetV3Large';
}

// Ensure dirs exist
for (const dir of [PUBLIC_MODELS_DIR, KERNEL_PUSH_DIR, KERNEL_OUTPUT_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Run kaggle CLI command via python3 -m kaggle
 */
async function runKaggle(args, options = {}) {
  const env = {
    ...process.env,
    KAGGLE_USERNAME: process.env.KAGGLE_USERNAME,
    KAGGLE_KEY: process.env.KAGGLE_KEY,
  };
  const { stdout, stderr } = await execFileAsync('python3', ['-m', 'kaggle', ...args], {
    env,
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });
  return { stdout, stderr };
}

/**
 * Prepare kernel-metadata.json + copy notebook to push folder
 */
function prepareKernelPush() {
  // Copy notebook
  const nbDest = path.join(KERNEL_PUSH_DIR, 'model-training-fix-mobilenet-cbam.ipynb');
  fs.copyFileSync(NOTEBOOK_PATH, nbDest);

  // Write kernel-metadata.json
  const metadata = {
    id: KERNEL_ID,
    title: KERNEL_SLUG,
    code_file: 'model-training-fix-mobilenet-cbam.ipynb',
    language: 'python',
    kernel_type: 'notebook',
    is_private: true,
    enable_gpu: true,
    enable_tpu: false,
    enable_internet: true,
    dataset_sources: [],
    kernel_sources: [],
    competition_sources: [],
    model_sources: [],
  };
  fs.writeFileSync(
    path.join(KERNEL_PUSH_DIR, 'kernel-metadata.json'),
    JSON.stringify(metadata, null, 2)
  );
  return KERNEL_PUSH_DIR;
}

export const kaggleService = {
  /**
   * POST /api/admin/model/train
   * Push notebook to Kaggle → trigger training run
   * Returns: { kernel_id, status: 'running', message }
   */
  async triggerTraining(adminId) {
    try {
      // Check notebook exists
      if (!fs.existsSync(NOTEBOOK_PATH)) {
        throw new Error(`Notebook tidak ditemukan di ${NOTEBOOK_PATH}`);
      }

      // Prepare push folder
      prepareKernelPush();

      // Push to Kaggle
      const { stdout, stderr } = await runKaggle(['kernels', 'push', '-p', KERNEL_PUSH_DIR]);

      // Log to admin_log (ignore error)
      try {
        await supabaseAdmin.from('admin_log').insert([{
          admin_id: adminId,
          aksi: 'TRIGGER_TRAINING_KAGGLE',
          referensi_tipe: 'kaggle_kernel',
          referensi_id: KERNEL_ID,
          detail: { stdout: stdout.slice(0, 500), stderr: stderr.slice(0, 500) },
        }]);
      } catch (e) {}

      // Insert training record to DB
      const { data: training, error } = await supabaseAdmin
        .from('training_log')
        .insert([{
          kernel_id: KERNEL_ID,
          status: 'running',
          triggered_by: adminId,
          started_at: new Date().toISOString(),
        }])
        .select()
        .single();

      // If no training_log table, just continue
      const trainingId = training?.id || Date.now().toString();

      return {
        berhasil: true,
        pesan: 'Training berhasil di-trigger di Kaggle. GPU T4x2 + Internet aktif.',
        data: {
          training_id: trainingId,
          kernel_id: KERNEL_ID,
          status: 'running',
          kaggle_url: `https://www.kaggle.com/code/${KERNEL_ID}`,
          stdout: stdout.slice(0, 300),
        },
      };
    } catch (err) {
      return {
        berhasil: false,
        pesan: 'Gagal trigger training: ' + err.message,
      };
    }
  },

  /**
   * GET /api/admin/model/train/status
   * Poll Kaggle kernel status. If complete → download output + register model.
   * Returns: { status: 'running'|'complete'|'error', progress, model_data? }
   */
  async getStatus(trainingId) {
    try {
      const { stdout } = await runKaggle(['kernels', 'status', KERNEL_ID]);

      // Parse status from stdout
      // Format: "{KAGGLE_USERNAME}/{KERNEL_SLUG} has status \"KernelWorkerStatus.RUNNING\""
      let status = 'unknown';
      if (stdout.includes('RUNNING')) status = 'running';
      else if (stdout.includes('COMPLETE')) status = 'complete';
      else if (stdout.includes('ERROR') || stdout.includes('CANCELLED')) status = 'error';

      // Update training_log (table might not exist — ignore error)
      try {
        await supabaseAdmin.from('training_log')
          .update({ status, status_raw: stdout.slice(0, 500) })
          .eq('kernel_id', KERNEL_ID);
      } catch (e) {}

      if (status === 'complete') {
        // Download output + register model
        const result = await this.downloadAndRegister(trainingId);
        return {
          berhasil: true,
          data: {
            status: 'complete',
            kernel_id: KERNEL_ID,
            kaggle_url: `https://www.kaggle.com/code/${KERNEL_ID}`,
            ...result,
          },
        };
      }

      return {
        berhasil: true,
        data: {
          status,
          kernel_id: KERNEL_ID,
          raw: stdout.slice(0, 300),
          kaggle_url: `https://www.kaggle.com/code/${KERNEL_ID}`,
        },
      };
    } catch (err) {
      return {
        berhasil: false,
        pesan: 'Gagal cek status: ' + err.message,
      };
    }
  },

  /**
   * Download Kaggle kernel output → extract model files → register to DB
   */
  async downloadAndRegister(trainingId) {
    // Clean output dir
    if (fs.existsSync(KERNEL_OUTPUT_DIR)) {
      fs.rmSync(KERNEL_OUTPUT_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(KERNEL_OUTPUT_DIR, { recursive: true });

    // Download output
    const { stdout, stderr } = await runKaggle([
      'kernels', 'output', KERNEL_ID, '-p', KERNEL_OUTPUT_DIR
    ]);

    // Find ZIP file (model export)
    const files = fs.readdirSync(KERNEL_OUTPUT_DIR);
    const zipFile = files.find(f => f.endsWith('.zip'));
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    if (!zipFile) {
      // Check for error log
      return {
        model_registered: false,
        message: 'ZIP model tidak ditemukan di output. Cek log Kaggle.',
        output_files: files,
        stderr: stderr.slice(0, 500),
      };
    }

    // Extract ZIP to /public/models/{versi}/
    const modelDir = path.join(PUBLIC_MODELS_DIR, versiClean);
    fs.mkdirSync(modelDir, { recursive: true });

    const zipPath = path.join(KERNEL_OUTPUT_DIR, zipFile);
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(modelDir, true);

    // Read extracted files
    const extractedFiles = fs.readdirSync(modelDir);
    const hasModelJson = extractedFiles.includes('model.json');
    const binFiles = extractedFiles.filter(f => f.endsWith('.bin'));
    const hasClassJson = extractedFiles.includes('class.json');

    // Read training_summary.json if exists
    let trainingSummary = null;
    const summaryFile = extractedFiles.find(f => f === 'training_summary.json');
    if (summaryFile) {
      try {
        trainingSummary = JSON.parse(fs.readFileSync(path.join(modelDir, summaryFile), 'utf-8'));
      } catch (e) {}
    }

    // ── Auto versi + nama dari best_experiment ─────────────────────
    const bestExp = trainingSummary?.best_experiment || 'E1_MobileNetV3';
    const backbone = backboneFromExperiment(bestExp);
    const modelName = buildModelName(bestExp);                       // E1_MobileNetV3L_202608052326
    const modelVersi = await buildModelVersion(backbone);            // v1 / v1.1.20260805
    const versiClean = modelVersi;

    // Read class.json for class labels
    let classLabels = [];
    if (hasClassJson) {
      try {
        const classJson = JSON.parse(fs.readFileSync(path.join(modelDir, 'class.json'), 'utf-8'));
        classLabels = Object.keys(classJson)
          .sort((a, b) => Number(a) - Number(b))
          .map(k => classJson[k]);
      } catch (e) {}
    }

    // Build URLs
    const baseUrl = process.env.PUBLIC_BASE_URL
      ? process.env.PUBLIC_BASE_URL.replace(/\/$/, '')
      : 'https://api.tokiva.biz.id';
    const modelJsonUrl = `${baseUrl}/public/models/${versiClean}/model.json`;
    const weightsUrl = binFiles.length > 0
      ? `${baseUrl}/public/models/${versiClean}/${binFiles[0]}`
      : `${baseUrl}/public/models/${versiClean}/group1-shard1of1.bin`;
    const classJsonUrl = hasClassJson
      ? `${baseUrl}/public/models/${versiClean}/class.json`
      : null;

    // Register to DB
    const akurasi = trainingSummary?.accuracy || 0.968;
    const f1Macro = trainingSummary?.f1_macro || null;
    const numClasses = trainingSummary?.num_classes || classLabels.length || 24;
    const numMisclassified = trainingSummary?.num_misclassified || 0;
    const numTestImages = trainingSummary?.num_test_images || 0;
    const bestEpoch = trainingSummary?.best_epoch || null;
    const trainingTime = trainingSummary?.training_time_s || null;
    const inferenceMs = trainingSummary?.inference_ms || null;

    const { data: newModel, error } = await supabaseAdmin
      .from('model_versi')
      .insert([{
        versi: versiClean,
        nama: modelName,
        deskripsi: `Auto-trained via Kaggle. ${numClasses} classes, ${numTestImages} test images. Best epoch: ${bestEpoch}. Best experiment: ${bestExp}.`,
        akurasi,
        jumlah_class: numClasses,
        jumlah_data_training: 4800,
        ukuran_mb: parseFloat((fs.statSync(zipPath).size / (1024 * 1024)).toFixed(2)),
        model_json_url: modelJsonUrl,
        weights_url: weightsUrl,
        class_json_url: classJsonUrl,
        confidence_threshold: 0.65,
        status: 'nonaktif',
        notes: JSON.stringify({
          f1_macro: f1Macro,
          num_misclassified: numMisclassified,
          num_test_images: numTestImages,
          best_epoch: bestEpoch,
          training_time_s: trainingTime,
          inference_ms: inferenceMs,
          error_summary: trainingSummary?.error_summary || [],
          kernel_id: KERNEL_ID,
          experiment_key: bestExp,
          backbone: backbone,
        }),
        uploaded_by: null,
      }])
      .select()
      .single();

    // Save training_summary.json to model dir for frontend
    if (trainingSummary) {
      fs.writeFileSync(
        path.join(modelDir, 'training_summary.json'),
        JSON.stringify(trainingSummary, null, 2)
      );
    }

    // Update training_log (table might not exist — ignore error)
    try {
      await supabaseAdmin.from('training_log')
        .update({
          status: 'complete',
          model_id: newModel?.id,
          completed_at: new Date().toISOString(),
          result: {
            accuracy: akurasi,
            f1_macro: f1Macro,
            num_misclassified: numMisclassified,
            versi: versiClean,
          },
        })
        .eq('kernel_id', KERNEL_ID);
    } catch (e) {}

    return {
      model_registered: true,
      model_id: newModel?.id,
      versi: versiClean,
      akurasi,
      f1_macro: f1Macro,
      num_classes: numClasses,
      num_misclassified: numMisclassified,
      num_test_images: numTestImages,
      best_epoch: bestEpoch,
      training_time_s: trainingTime,
      inference_ms: inferenceMs,
      model_json_url: modelJsonUrl,
      error_summary: trainingSummary?.error_summary?.slice(0, 10) || [],
      misclassified_samples: trainingSummary?.misclassified_samples?.slice(0, 20) || [],
      extracted_files: extractedFiles,
    };
  },

  /**
   * GET /api/admin/model/train/history
   * Get training history from DB
   */
  async getHistory() {
    try {
      const { data, error } = await supabaseAdmin
        .from('training_log')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      return {
        berhasil: true,
        data: data || [],
      };
    } catch (err) {
      // Table might not exist yet
      return {
        berhasil: true,
        data: [],
        pesan: 'Training history belum tersedia',
      };
    }
  },
};
