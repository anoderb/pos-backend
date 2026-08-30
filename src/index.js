import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import fastifyCookie from '@fastify/cookie';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Route Imports
import { authRoutes } from './modules/auth/auth.route.js';
import { kasirRoutes } from './routes/kasir/kasir.routes.js';
import { ownerRoutes } from './routes/owner/owner.routes.js';
import { adminRoutes } from './admin/routes/admin.routes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.env.JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET wajib dikonfigurasi di file .env');
  process.exit(1);
}

const fastify = Fastify({
  logger: process.env.NODE_ENV === 'development',
});

// Register CORS with explicit credentials & HTTP methods (FIX-CORS)
await fastify.register(cors, {
  origin: (origin, cb) => {
    // Tanpa origin (server-to-server / non-browser) atau dev → izinkan.
    if (!origin || process.env.NODE_ENV !== 'production') {
      return cb(null, true);
    }
    if (typeof origin !== 'string') return cb(null, false);
    const allowed = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
      : ['http://localhost:3000', 'http://localhost:5000', 'http://127.0.0.1:3000', 'http://127.0.0.1:5000', 'http://localhost:3001', 'http://localhost:3002', 'https://tokiva.biz.id', 'https://www.tokiva.biz.id', 'https://app.tokiva.biz.id'];
    if (allowed.includes(origin)) {
      return cb(null, true);
    }
    // Origin asing → jangan lempar Error (yang bikin Fastify render 500).
    // Return false agar @fastify/cors menolak dengan 403/blank proper.
    return cb(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Idempotency-Key'],
});

// Register Static File Serving for Public Assets & AI Model Checkpoints (/public/models/...)
await fastify.register(fastifyStatic, {
  root: path.join(__dirname, '../public'),
  prefix: '/public/',
});

// Register Multipart File Upload (Max 5MB)
await fastify.register(fastifyMultipart, {
  limits: { 
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
});

// HttpOnly cookie for refresh-token rotation.
await fastify.register(fastifyCookie);

// Register Swagger OpenAPI Documentation Generator (Development Only)
if (process.env.NODE_ENV !== 'production') {
  await fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Tokiva POS REST API Engine Documentation',
        description: 'Dokumentasi Interaktif REST API Ekosistem SaaS Tokiva POS (tokiva.biz.id)',
        version: '1.0.0',
      },
      servers: [
        { url: 'http://localhost:5000', description: 'Local Development Server' },
        { url: 'https://api.tokiva.biz.id', description: 'Production Server' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  // Register Interactive Swagger UI Web Docs Page at /docs
  await fastify.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });
}

// Register Global Rate Limiter
await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  errorResponseBuilder: (_request, context) => ({
    statusCode: context.statusCode,
    berhasil: false,
    pesan: `Terlalu banyak permintaan. Coba lagi dalam ${context.after}.`,
    retry_after_seconds: Math.ceil((context.ttl || 0) / 1000),
  }),
});

// Register JWT Secret
await fastify.register(jwt, {
  secret: process.env.JWT_SECRET,
});

// Security Headers Hook (SEC-04)
fastify.addHook('onSend', (request, reply, payload, done) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('X-XSS-Protection', '1; mode=block');
  reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  done();
});

// Centralized Error Handler (SEC-10) — jangan bocor detail error ke client
fastify.setErrorHandler((error, request, reply) => {
  const rawMessage = String(error.message || '');
  const isValidationError = Boolean(error.validation)
    || /wajib|tidak valid|tidak boleh|maksimal|minimal|harus berupa|sudah terdaftar|tidak mencukupi|stok tidak|diskon tidak/i.test(rawMessage);
  const isNotFoundError = /tidak ditemukan|not found/i.test(rawMessage);
  const isAuthError = /tidak login|sesi|tidak punya akses|hanya dapat membatalkan|ditolak/i.test(rawMessage);
  const isServerError = !isValidationError && !isNotFoundError && !isAuthError;
  const statusCode = error.statusCode || (isValidationError ? 400 : isNotFoundError ? 404 : isAuthError ? 403 : 500);

  // Pesan sistem yang dibocorkan db (Supabase/Postgres) → ganti jadi user-friendly
  const SYSTEM_ERROR_MARKERS = /cannot|coerce|json object|does not exist|syntax error|duplicate key|violates|relation .* does not|column .* does not|PGRST|postgrest|ECONNREFUSED|ENOTFOUND|fetch failed/i;
  const isSystemMessage = SYSTEM_ERROR_MARKERS.test(rawMessage);

  // 500 / pesan sistem → jangan bocor detail; kasih pesan user-friendly
  if (isServerError || isSystemMessage) {
    request.log.error({ err: error }, 'Internal server error');
    return reply.status(statusCode).send({
      berhasil: false,
      pesan: 'Oops, terjadi kendala pada server. Silakan coba lagi — kalau masih error, hubungi admin.',
    });
  }

  // Dev: kirim pesan asli supaya dev gampang debug; Prod: tetap user-friendly utk non-4xx
  const isDev = process.env.NODE_ENV !== 'production';
  const message = isDev ? error.message : (statusCode === 500 ? 'Terjadi kendala pada server. Coba lagi.' : error.message);

  reply.status(statusCode).send({
    berhasil: false,
    pesan: message,
  });
});

fastify.setNotFoundHandler((request, reply) => {
  reply.code(404).send({ berhasil: false, pesan: 'Endpoint tidak ditemukan' });
});

// Health check endpoint
fastify.get('/health', async () => ({
  berhasil: true,
  pesan: 'Tokiva POS Backend Service running smoothly',
  domain: 'tokiva.biz.id',
  timestamp: new Date().toISOString(),
}));

// API Index route
fastify.get('/api', async () => ({
  berhasil: true,
  pesan: process.env.NODE_ENV === 'production' ? 'API aktif' : 'Selamat datang di REST API Backend Engine',
  ...(process.env.NODE_ENV === 'production' ? {} : {
    versi: '1.0.0',
    total_modul: 18,
    namespaces: ['/api/kasir/*', '/api/owner/*', '/api/admin/*', '/api/auth/*'],
    docs_url: '/docs',
  }),
}));

// Public Auth Routes
fastify.register(authRoutes, { prefix: '/api/auth' });

// Clean Role Namespaces
fastify.register(kasirRoutes, { prefix: '/api/kasir' });
fastify.register(ownerRoutes, { prefix: '/api/owner' });
fastify.register(adminRoutes, { prefix: '/api/admin' });

// Start Server
const PORT = process.env.PORT || 5000;

const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`\n🚀 Tokiva POS Backend Server berjalan di http://0.0.0.0:${PORT}`);
    console.log(`📚 Dokumentasi Interaktif Swagger UI: http://localhost:${PORT}/docs`);
    console.log(`📁 Static Assets Serving: http://localhost:${PORT}/public/models/\n`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
