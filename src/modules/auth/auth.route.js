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

  // Public Routes (Rate limited anti-spam)
  fastify.post('/register', authRateLimitConfig, authController.register);
  fastify.post('/login', authRateLimitConfig, authController.login);
  fastify.post('/oauth-sync', authController.oauthSync);
  fastify.post('/lupa-password', authRateLimitConfig, authController.lupaPassword);
  fastify.post('/reset-password', authRateLimitConfig, authController.resetPassword);
  fastify.post('/refresh', authController.refresh);

  // Authenticated Routes
  fastify.register(async (protectedRoutes) => {
    protectedRoutes.addHook('preHandler', authenticate);
    protectedRoutes.get('/profil', authController.profil);
    protectedRoutes.post('/logout', authController.logout);
    protectedRoutes.post('/ganti-password', authController.gantiPassword);
  });
}
