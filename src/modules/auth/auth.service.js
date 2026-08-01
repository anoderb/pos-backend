import { supabaseAdmin, supabaseAuth } from '../../config/database.js';
import { kirimEmail } from '../../utils/resend.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validatePasswordComplexity(password) {
  if (!password || password.length < 8) {
    throw new Error('Password minimal harus 8 karakter');
  }
  if (!/[A-Z]/.test(password)) {
    throw new Error('Password harus mengandung minimal 1 huruf besar (A-Z)');
  }
  if (!/[a-z]/.test(password)) {
    throw new Error('Password harus mengandung minimal 1 huruf kecil (a-z)');
  }
  if (!/[0-9]/.test(password)) {
    throw new Error('Password harus mengandung minimal 1 angka (0-9)');
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    throw new Error('Password harus mengandung minimal 1 karakter spesial (!@#$%^&*)');
  }
}

export const authService = {
  // 1. Registrasi Owner Baru dengan Security Anti-Spam
  async registerOwner({ nama, email, password, nama_toko, alamat_toko, no_telp_toko }) {
    if (!EMAIL_REGEX.test(email)) {
      throw new Error('Format email tidak valid');
    }

    validatePasswordComplexity(password);

    const { data: existingUser } = await supabaseAdmin
      .from('pengguna')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingUser) {
      throw new Error('Email ini sudah terdaftar di sistem. Silakan login.');
    }

    const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authErr) {
      throw new Error('Gagal membuat akun: ' + authErr.message);
    }

    const userId = authUser.user?.id;

    const { data: tokoBaru, error: tokoErr } = await supabaseAdmin
      .from('toko')
      .insert({
        nama: nama_toko,
        alamat: alamat_toko,
        no_telp: no_telp_toko,
      })
      .select()
      .single();

    if (tokoErr) {
      throw new Error('Gagal membuat data toko: ' + tokoErr.message);
    }

    const { data: penggunaBaru, error: penggunaErr } = await supabaseAdmin
      .from('pengguna')
      .insert({
        id: userId,
        nama,
        email,
        role: 'owner',
        toko_id: tokoBaru.id,
        aktif: true,
      })
      .select()
      .single();

    if (penggunaErr) {
      throw new Error('Gagal membuat profil owner: ' + penggunaErr.message);
    }

    await supabaseAdmin
      .from('toko')
      .update({ owner_id: penggunaBaru.id })
      .eq('id', tokoBaru.id);

    // Seed satuan default "pcs" untuk toko baru
    await supabaseAdmin.from('satuan').insert({ toko_id: tokoBaru.id, nama: 'pcs' });

    // Kirim email sambutan via Resend (Background safe)
    kirimEmail({
      to: email,
      subject: 'Selamat Datang di Tokiva POS!',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #16A34A;">Halo ${nama}, Selamat Datang di Tokiva!</h2>
          <p>Toko Anda <strong>${nama_toko}</strong> telah berhasil didaftarkan.</p>
          <p>Silakan masuk ke aplikasi menggunakan email <strong>${email}</strong> untuk mengelola toko Anda.</p>
          <hr />
          <p style="font-size: 12px; color: #666;">Tokiva POS — Kasir Cerdas untuk UMKM Modern (tokiva.biz.id)</p>
        </div>
      `,
    }).catch(err => console.error('Error sending welcome email:', err.message));

    return {
      pengguna: penggunaBaru,
      toko: tokoBaru,
    };
  },

  // 2. Login Email & Password
  // CRITICAL: Use supabaseAuth (anon key) for signInWithPassword to avoid
  // polluting supabaseAdmin's internal session, which would cause RLS to
  // block subsequent database queries via supabaseAdmin.
  async login({ email, password }) {
    if (!EMAIL_REGEX.test(email)) {
      throw new Error('Format email tidak valid');
    }

    // Step 1: Authenticate via Supabase Auth (using anon client)
    let { data, error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password,
    });

    // Handle user unconfirmed in Supabase (Automatic verification fix)
    if (error && (error.message?.toLowerCase().includes('confirm') || error.message?.toLowerCase().includes('email not confirmed'))) {
      const { data: userProfile } = await supabaseAdmin
        .from('pengguna')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (userProfile?.id) {
        await supabaseAdmin.auth.admin.updateUserById(userProfile.id, { email_confirm: true });
        const retry = await supabaseAuth.auth.signInWithPassword({ email, password });
        data = retry.data;
        error = retry.error;
      }
    }

    if (error) {
      throw new Error('Email atau password salah');
    }

    // Step 2: Get profil pengguna (using admin client - bypasses RLS)
    const { data: profil } = await supabaseAdmin
      .from('pengguna')
      .select('*, toko:toko_id(*)')
      .eq('email', email)
      .maybeSingle();

    if (!profil) {
      throw new Error('Akun Anda belum terdaftar pada toko mana pun. Silakan hubungi Owner toko.');
    }

    // Owner role is always active by default
    if (profil.role === 'owner' && !profil.aktif) {
      await supabaseAdmin
        .from('pengguna')
        .update({ aktif: true })
        .eq('id', profil.id);
      profil.aktif = true;
    }

    if (!profil.aktif) {
      throw new Error('Akun Anda telah dinonaktifkan oleh Owner');
    }

    return {
      session: data.session,
      pengguna: {
        id: profil.id,
        nama: profil.nama,
        email: profil.email,
        role: profil.role,
        toko_id: profil.toko_id,
      },
      toko: profil.toko,
    };
  },

  // 3. Login / Sync OAuth Google
  async handleOAuthCallback({ user }) {
    const { id, email, user_metadata } = user;
    const nama = user_metadata?.full_name || user_metadata?.name || email.split('@')[0];

    const { data: existingProfile } = await supabaseAdmin
      .from('pengguna')
      .select('*, toko:toko_id(*)')
      .eq('email', email)
      .maybeSingle();

    if (existingProfile) {
      return {
        isNewUser: false,
        pengguna: existingProfile,
        toko: existingProfile.toko,
      };
    }

    const namaTokoDefault = `Toko ${nama}`;
    const { data: tokoBaru } = await supabaseAdmin
      .from('toko')
      .insert({ nama: namaTokoDefault })
      .select()
      .single();

    const { data: penggunaBaru } = await supabaseAdmin
      .from('pengguna')
      .insert({
        id,
        nama,
        email,
        role: 'owner',
        toko_id: tokoBaru.id,
        aktif: true,
      })
      .select()
      .single();

    await supabaseAdmin.from('toko').update({ owner_id: id }).eq('id', tokoBaru.id);
    await supabaseAdmin.from('satuan').insert({ toko_id: tokoBaru.id, nama: 'pcs' });

    return {
      isNewUser: true,
      pengguna: penggunaBaru,
      toko: tokoBaru,
    };
  },

  // 4. Lupa Password — Kirim reset via Supabase
  async lupaPassword(email) {
    if (!email || !EMAIL_REGEX.test(email)) throw new Error('Format email tidak valid');

    const { data: user } = await supabaseAdmin
      .from('pengguna')
      .select('nama')
      .eq('email', email)
      .maybeSingle();

    if (!user) {
      return { pesan: 'Jika email terdaftar, link reset akan dikirim.' };
    }

    const { error } = await supabaseAuth.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://tokiva.biz.id/reset-password',
    });

    if (error) {
      throw new Error('Gagal mengirim email reset: ' + error.message);
    }

    return { pesan: 'Link reset password telah dikirim ke email Anda.' };
  },

  // 5. Reset Password (Kirim Email Magic Link Secure)
  async resetPassword({ email }) {
    if (!email || !EMAIL_REGEX.test(email)) {
      throw new Error('Email tidak valid atau wajib diisi');
    }

    const { error } = await supabaseAuth.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://tokiva.biz.id/reset-password',
    });

    if (error) {
      throw new Error('Gagal mengirim email reset: ' + error.message);
    }

    return { pesan: 'Link reset password telah dikirim ke email Anda. Silakan cek kotak masuk email Anda.' };
  },

  // 6. Refresh Token
  async refreshToken(refresh_token) {
    const { data, error } = await supabaseAuth.auth.refreshSession({
      refresh_token,
    });

    if (error) throw new Error('Refresh token tidak valid atau expired');
    return data.session;
  },

  // 7. Get Profil Pengguna
  async getProfil(email) {
    const { data, error } = await supabaseAdmin
      .from('pengguna')
      .select('*, toko:toko_id(*)')
      .eq('email', email)
      .single();

    if (error) throw new Error('Profil tidak ditemukan');
    return data;
  },
};
