import { authController } from './auth.controller.js';
import { authenticate } from '../../middleware/auth.js';

const berhasilFalse = (_req, ctx) => ({
  statusCode: ctx.statusCode,
  berhasil: false,
  pesan: `Terlalu banyak permintaan. Coba lagi dalam ${ctx.after}.`,
  retry_after_seconds: Math.ceil((ctx.ttl || 0) / 1000),
});

export async function authRoutes(fastify, options) {
  // Login & Register: anti-brute dipegang brute-lock custom (src/utils/brute-lock.js)
  // yang pesannya konsisten {berhasil:false, pesan}. Global rate limit (100/menit/IP)
  // di index.js tetap jadi hard-cap anti-DOS.
  const forgotPasswordRateLimitConfig = {
    config: {
      rateLimit: {
        max: 3,
        timeWindow: '15 minutes',
        keyGenerator: (request) => `${request.ip}:${String(request.body?.email || '').trim().toLowerCase()}`,
        errorResponseBuilder: berhasilFalse,
      },
    },
  };

  // Public Routes (Rate limited anti-spam)
  fastify.get('/status', authController.status);
  fastify.post('/register', authController.register);
  fastify.post('/verifikasi/email', forgotPasswordRateLimitConfig, authController.verifikasiEmail);
  fastify.get('/verif', authController.verif);
  fastify.post('/verif', forgotPasswordRateLimitConfig, authController.verif);
  fastify.post('/login', authController.login);
  fastify.post('/lupa-password', forgotPasswordRateLimitConfig, authController.lupaPassword);
  fastify.post('/reset-password', forgotPasswordRateLimitConfig, authController.resetPassword);
  fastify.post('/refresh', authController.refresh);

  // Authenticated Routes
  fastify.register(async (protectedRoutes) => {
    protectedRoutes.addHook('preHandler', authenticate);
    protectedRoutes.get('/profil', authController.profil);
    protectedRoutes.post('/logout', authController.logout);
    protectedRoutes.post('/ganti-password', authController.gantiPassword);
  });
}
