import { supabaseAdmin } from '../../config/database.js';

function summarizeTransactions(txList = []) {
  return txList.reduce((summary, tx) => {
    const total = Number(tx.total) || 0;

    // Pending (QRIS belum dibayar) tidak dihitung ke rekap — masuk setelah approved.
    if (tx.status === 'pending') {
      summary.total_pending += total;
      summary.total_transaksi_pending += 1;
      return summary;
    }
    summary.total_transaksi += 1;
    if (tx.status === 'void') {
      summary.total_void += total;
      return summary;
    }

    summary.total_penjualan += total;
    if (tx.metode_bayar === 'cash') summary.total_cash += total;
    if (tx.metode_bayar === 'qris') summary.total_qris += total;
    if (tx.metode_bayar === 'transfer') summary.total_transfer += total;
    return summary;
  }, {
    total_transaksi: 0,
    total_penjualan: 0,
    total_void: 0,
    total_cash: 0,
    total_qris: 0,
    total_transfer: 0,
    total_pending: 0,
    total_transaksi_pending: 0,
  });
}

export const shiftService = {
  // Buka Shift Baru
  async bukaShift(toko_id, kasir_id, { modal_awal }) {
    // Satu kasir hanya boleh punya satu shift aktif, termasuk saat jeda.
    const { data: shiftAktif } = await supabaseAdmin
      .from('shift')
      .select('id')
      .eq('toko_id', toko_id)
      .eq('kasir_id', kasir_id)
      .in('status', ['buka', 'jeda'])
      .order('waktu_buka', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (shiftAktif) {
      throw new Error('Anda masih memiliki shift yang belum ditutup');
    }

    const { data: shiftBaru, error } = await supabaseAdmin
      .from('shift')
      .insert({
        toko_id,
        kasir_id,
        waktu_buka: new Date().toISOString(),
        modal_awal: modal_awal || 0,
        status: 'buka',
      })
      .select()
      .single();

    if (error) throw new Error('Gagal membuka shift: ' + error.message);
    return shiftBaru;
  },

  // Get Shift yang Sedang Buka/Jeda (utk resume)
  async getShiftAktif(toko_id, kasir_id) {
    const { data, error } = await supabaseAdmin
      .from('shift')
      .select('*, kasir:kasir_id(nama)')
      .eq('toko_id', toko_id)
      .eq('kasir_id', kasir_id)
      .in('status', ['buka', 'jeda'])
      .order('waktu_buka', { ascending: false })
      .limit(1)
      .maybeSingle();

    return data || null;
  },

  // Jeda Shift (status buka -> jeda)
  async jedaShift(toko_id, kasir_id) {
    const { data: shiftAktif } = await supabaseAdmin
      .from('shift')
      .select('id')
      .eq('toko_id', toko_id)
      .eq('kasir_id', kasir_id)
      .eq('status', 'buka')
      .order('waktu_buka', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!shiftAktif) {
      throw new Error('Tidak ada shift aktif untuk dijeda');
    }

    const { data, error } = await supabaseAdmin
      .from('shift')
      .update({ status: 'jeda', waktu_jeda: new Date().toISOString() })
      .eq('toko_id', toko_id)
      .eq('id', shiftAktif.id)
      .select()
      .maybeSingle();

    if (error) throw new Error('Gagal menjeda shift: ' + error.message);
    if (!data) throw new Error('Shift tidak ditemukan');
    return data;
  },

  // Lanjut Shift (status jeda -> buka)
  async lanjutShift(toko_id, kasir_id) {
    const { data: shiftJeda } = await supabaseAdmin
      .from('shift')
      .select('id')
      .eq('toko_id', toko_id)
      .eq('kasir_id', kasir_id)
      .eq('status', 'jeda')
      .order('waktu_buka', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!shiftJeda) {
      throw new Error('Tidak ada shift yang dijeda');
    }

    const { data, error } = await supabaseAdmin
      .from('shift')
      .update({ status: 'buka', waktu_jeda: null })
      .eq('toko_id', toko_id)
      .eq('id', shiftJeda.id)
      .select()
      .maybeSingle();

    if (error) throw new Error('Gagal melanjutkan shift: ' + error.message);
    if (!data) throw new Error('Shift tidak ditemukan');
    return data;
  },

  // Tutup Shift
  async tutupShift(toko_id, kasir_id, { shift_id, kas_aktual, catatan }) {
    // Ambil rekap transaksi penjualan selama shift ini
    const { data: txList, error: txError } = await supabaseAdmin
      .from('transaksi')
      .select('total, diskon_total, metode_bayar, status')
      .eq('toko_id', toko_id)
      .eq('shift_id', shift_id);

    if (txError) throw new Error('Gagal mengambil transaksi shift: ' + txError.message);
    const summary = summarizeTransactions(txList);

    // Ambil shift header
    const { data: shiftCurrent, error: shiftError } = await supabaseAdmin
      .from('shift')
      .select('modal_awal')
      .eq('id', shift_id)
      .eq('toko_id', toko_id)
      .eq('kasir_id', kasir_id)
      .in('status', ['buka', 'jeda'])
      .maybeSingle();

    if (shiftError || !shiftCurrent) throw new Error('Shift aktif tidak ditemukan');

    const expectedKas = Number(shiftCurrent.modal_awal) + summary.total_cash;
    const selisih = Number(kas_aktual) - expectedKas;

    const { data: shiftClosed, error } = await supabaseAdmin
      .from('shift')
      .update({
        waktu_tutup: new Date().toISOString(),
        kas_aktual,
        total_penjualan: summary.total_penjualan,
        total_void: summary.total_void,
        total_cash: summary.total_cash,
        total_qris: summary.total_qris,
        total_transfer: summary.total_transfer,
        selisih,
        catatan,
        status: 'tutup',
      })
      .eq('toko_id', toko_id)
      .eq('id', shift_id)
      .eq('kasir_id', kasir_id)
      .select()
      .maybeSingle();

    if (error) throw new Error('Gagal menutup shift: ' + error.message);
    if (!shiftClosed) throw new Error('Shift tidak ditemukan');
    return shiftClosed;
  },

  // List Semua Shift Toko (Owner)
  async listShift(toko_id, pagination) {
    let query = supabaseAdmin
      .from('shift')
      .select('*, kasir:kasir_id(nama)')
      .eq('toko_id', toko_id)
      .order('waktu_buka', { ascending: false });

    if (pagination) query = query.range(pagination.offset, pagination.end);

    const { data, error } = await query;

    if (error) throw new Error('Gagal mengambil daftar shift');
    return data;
  },

  // Detail Shift + Rekap
  async getShiftById(toko_id, id) {
    const { data: shift, error: shiftError } = await supabaseAdmin
      .from('shift')
      .select('*, kasir:kasir_id(nama)')
      .eq('toko_id', toko_id)
      .eq('id', id)
      .maybeSingle();

    if (shiftError || !shift) throw new Error('Shift tidak ditemukan');

    const { data: txList, error: txError } = await supabaseAdmin
      .from('transaksi')
      .select('*')
      .eq('toko_id', toko_id)
      .eq('shift_id', id)
      .order('created_at', { ascending: false });

    if (txError) throw new Error('Gagal mengambil transaksi shift: ' + txError.message);

    return {
      ...shift,
      transaksi: txList || [],
      ...summarizeTransactions(txList || []),
    };
  },
};
