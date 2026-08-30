import { supabaseAdmin } from '../../config/database.js';

export const penggunaService = {
  // List semua kasir di toko ini
  async listKasir(toko_id, pagination) {
    let query = supabaseAdmin
      .from('pengguna')
      .select('*')
      .eq('toko_id', toko_id)
      .order('created_at', { ascending: false });

    if (pagination) query = query.range(pagination.offset, pagination.end);

    const { data, error } = await query;

    if (error) throw new Error('Gagal mengambil daftar pengguna');
    return data;
  },

  // Tambah akun Kasir baru oleh Owner
  async tambahKasir(toko_id, { nama, email, password }) {
    let userId;

    // 1. Cek apakah email sudah terdaftar sebagai kasir/owner lain
    const { data: existingProfile } = await supabaseAdmin
      .from('pengguna')
      .select('id, email')
      .eq('email', email)
      .maybeSingle();

    if (existingProfile) {
      // Jika profil sudah ada di DB, pastikan terverifikasi
      userId = existingProfile.id;
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: { nama, role: 'kasir', toko_id },
      }).catch(() => {});
    } else {
      // 2. Buat akun Auth via Supabase Admin (Auto-Confirm instant!)
      const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nama, role: 'kasir', toko_id },
      });

      if (authErr) {
        // Jika user auth sudah ada di Supabase Auth tapi belum ada di tabel pengguna
        if (authErr.message?.toLowerCase().includes('already') || authErr.status === 422) {
          const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
          const existingAuthUser = usersData?.users?.find(u => u.email.toLowerCase() === email.toLowerCase());
          if (existingAuthUser) {
            userId = existingAuthUser.id;
            await supabaseAdmin.auth.admin.updateUserById(userId, {
              password,
              email_confirm: true,
              user_metadata: { nama, role: 'kasir', toko_id },
            });
          } else {
            throw new Error('Gagal membuat akun kasir: ' + authErr.message);
          }
        } else {
          throw new Error('Gagal membuat akun kasir: ' + authErr.message);
        }
      } else {
        userId = authUser.user?.id;
      }
    }

    // 3. Upsert data ke tabel `pengguna`
    const { data: kasirBaru, error: kasirErr } = await supabaseAdmin
      .from('pengguna')
      .upsert({
        id: userId,
        nama,
        email,
        role: 'kasir',
        toko_id,
        aktif: true,
      })
      .select()
      .single();

    if (kasirErr) {
      throw new Error('Gagal menambahkan kasir ke database: ' + kasirErr.message);
    }

    return kasirBaru;
  },

  // Detail Kasir
  async getKasirById(toko_id, id) {
    const { data, error } = await supabaseAdmin
      .from('pengguna')
      .select('*')
      .eq('toko_id', toko_id)
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error('Gagal mengambil kasir');
    if (!data) throw new Error('Kasir tidak ditemukan');
    return data;
  },

  // Edit Kasir / Reset Password Kasir
  async updateKasir(toko_id, id, { nama, aktif, password }) {
    // 1. Ambil data kasir eksisting
    const { data: kasir } = await supabaseAdmin
      .from('pengguna')
      .select('*')
      .eq('toko_id', toko_id)
      .eq('id', id)
      .maybeSingle();

    const updateData = {};
    if (nama !== undefined) updateData.nama = nama;
    if (aktif !== undefined) updateData.aktif = aktif;

    let data = kasir;
    if (Object.keys(updateData).length > 0) {
      const { data: updated, error } = await supabaseAdmin
        .from('pengguna')
        .update(updateData)
        .eq('toko_id', toko_id)
        .eq('id', id)
        .select()
        .maybeSingle();

      if (!error && updated) {
        data = updated;
      }
    }

    // 2. Reset password akun kasir di Supabase Auth jika password dikirim
    if (password && password.trim().length >= 6) {
      const newPass = password.trim();
      let updatedAuth = false;

      // Coba update by ID terlebih dahulu
      try {
        const { error: errId } = await supabaseAdmin.auth.admin.updateUserById(id, { password: newPass });
        if (!errId) updatedAuth = true;
      } catch {}

      // Jika by ID gagal, coba cari user Supabase Auth via email
      if (!updatedAuth && kasir?.email) {
        try {
          const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
          const authUser = authUsers?.users?.find(u => u.email?.toLowerCase() === kasir.email.toLowerCase());
          if (authUser) {
            await supabaseAdmin.auth.admin.updateUserById(authUser.id, { password: newPass });
            updatedAuth = true;
          }
        } catch {}
      }

      if (!updatedAuth) {
        throw new Error('Gagal mereset password kasir — akun auth tidak ditemukan');
      }
    }

    return data || { id };
  },

  // Nonaktifkan Kasir (Soft Delete)
  async deleteKasir(toko_id, id) {
    const { data, error } = await supabaseAdmin
      .from('pengguna')
      .update({ aktif: false })
      .eq('toko_id', toko_id)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error('Gagal menonaktifkan kasir');
    return data;
  },

  // Hapus Permanen Kasir (Hard Delete dari DB & Supabase Auth, Fallback ke Soft-Delete jika ada riwayat transaksi/shift)
  async hapusKasirPermanen(toko_id, id) {
    // 1. Hapus akses auth dari Supabase Auth
    try {
      await supabaseAdmin.auth.admin.deleteUser(id);
    } catch {
      // Sembunyikan error jika user auth tidak ada
    }

    // 2. Coba hapus data row dari tabel pengguna
    const { data, error } = await supabaseAdmin
      .from('pengguna')
      .delete()
      .eq('toko_id', toko_id)
      .eq('id', id)
      .select()
      .maybeSingle();

    // 3. Jika gagal karena relasi foreign key (kasir pernah ada transaksi/shift)
    if (error) {
      const { data: updated } = await supabaseAdmin
        .from('pengguna')
        .update({ aktif: false })
        .eq('toko_id', toko_id)
        .eq('id', id)
        .select()
        .maybeSingle();

      return updated || { id };
    }

    return data || { id };
  },

  // Histori Shift Kasir Ini
  async getHistoriShiftKasir(toko_id, kasir_id) {
    const { data, error } = await supabaseAdmin
      .from('shift')
      .select('*')
      .eq('toko_id', toko_id)
      .eq('kasir_id', kasir_id)
      .order('waktu_buka', { ascending: false });

    if (error) throw new Error('Gagal mengambil histori shift kasir');
    return data;
  },
};
