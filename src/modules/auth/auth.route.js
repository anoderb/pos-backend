import { authController } from './auth.controller.js';
import { authenticate } from '../../middleware/auth.js';

export async function authRoutes(fastify, options) {
  const authRateLimitConfig = {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '15 minutes',
      },
    },
  };
  const loginRateLimitConfig = {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '15 minutes',
        keyGenerator: (request) => `${request.ip}:${String(request.body?.email || '').trim().toLowerCase()}`,
      },
    },
  };
  const forgotPasswordRateLimitConfig = {
    config: {
      rateLimit: {
        max: 3,
        timeWindow: '15 minutes',
        keyGenerator: (request) => `${request.ip}:${String(request.body?.email || '').trim().toLowerCase()}`,
      },
    },
  };

  // Public Routes (Rate limited anti-spam)
  fastify.post('/register', authRateLimitConfig, authController.register);
  fastify.post('/verifikasi/email', forgotPasswordRateLimitConfig, authController.verifikasiEmail);
  fastify.post('/login', loginRateLimitConfig, authController.login);
  fastify.post('/oauth-sync', authController.oauthSync);
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
