/**
 * Training Controller — Endpoints untuk trigger Kaggle training, poll status, get history.
 */
import { kaggleService } from './kaggle.service.js';
import { supabaseAdmin } from '../../../config/database.js';

export const adminTrainingController = {
  /**
   * POST /api/admin/model/train
   * Trigger Kaggle notebook training run.
   */
  async triggerTraining(request, reply) {
    const adminId = request.admin?.id;
    const result = await kaggleService.triggerTraining(adminId);

    if (!result.berhasil) {
      return reply.code(500).send(result);
    }
    return reply.send(result);
  },

  /**
   * GET /api/admin/model/train/status
   * Poll Kaggle kernel status. Auto-download + register model jika complete.
   */
  async getStatus(request, reply) {
    const { id } = request.query; // optional training_id
    const result = await kaggleService.getStatus(id);

    if (!result.berhasil) {
      return reply.code(500).send(result);
    }
    return reply.send(result);
  },

  /**
   * GET /api/admin/model/train/history
   * Get training history.
   */
  async getHistory(request, reply) {
    const result = await kaggleService.getHistory();
    return reply.send(result);
  },

  /**
   * GET /api/admin/model/:id/training-summary
   * Get training summary JSON untuk display di frontend.
   */
  async getTrainingSummary(request, reply) {
    const { id } = request.params;

    // Get model info from DB
    const { data: model, error } = await supabaseAdmin
      .from('model_versi')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !model) {
      return reply.code(404).send({ berhasil: false, pesan: 'Model tidak ditemukan' });
    }

    // Parse notes (training summary metadata)
    let summary = null;
    try {
      summary = model.notes ? JSON.parse(model.notes) : null;
    } catch (e) {
      summary = null;
    }

    return reply.send({
      berhasil: true,
      data: {
        model_id: model.id,
        versi: model.versi,
        nama: model.nama,
        akurasi: model.akurasi,
        jumlah_class: model.jumlah_class,
        model_json_url: model.model_json_url,
        class_json_url: model.class_json_url,
        confidence_threshold: model.confidence_threshold,
        status: model.status,
        created_at: model.created_at,
        training_info: summary,
      },
    });
  },
};
