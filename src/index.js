import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Route Imports
import { authRoutes } from './modules/auth/auth.route.js';
import { kasirRoutes } from './routes/kasir/kasir.routes.js';
import { ownerRoutes } from './routes/owner/owner.routes.js';
import { adminRoutes } from './admin/routes/admin.routes.js';

// Legacy Module Imports
import { tokoRoutes } from './modules/toko/toko.route.js';
import { penggunaRoutes } from './modules/pengguna/pengguna.route.js';
import { kategoriRoutes } from './modules/kategori/kategori.route.js';
import { satuanRoutes } from './modules/satuan/satuan.route.js';
import { produkRoutes } from './modules/produk/produk.route.js';
import { supplierRoutes } from './modules/supplier/supplier.route.js';
import { pelangganRoutes } from './modules/pelanggan/pelanggan.route.js';
import { shiftRoutes } from './modules/shift/shift.route.js';
import { transaksiRoutes } from './modules/transaksi/transaksi.route.js';
import { notaMasukRoutes } from './modules/nota-masuk/nota-masuk.route.js';
import { hutangRoutes } from './modules/hutang/hutang.route.js';
import { returnSupplierRoutes } from './modules/return-supplier/return-supplier.route.js';
import { konsinyasiRoutes } from './modules/konsinyasi/konsinyasi.route.js';
import { stockAdjustmentRoutes } from './modules/stock-adjustment/stock-adjustment.route.js';
import { opnameRoutes } from './modules/opname/opname.route.js';
import { laporanRoutes } from './modules/laporan/laporan.route.js';
import { aiRoutes } from './modules/ai/ai.route.js';

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

// Register CORS with explicit HTTP methods including DELETE & OPTIONS
await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
});

// Register Static File Serving for Public Assets & AI Model Checkpoints (/public/models/...)
await fastify.register(fastifyStatic, {
  root: path.join(__dirname, '../public'),
  prefix: '/public/',
});

// Register Multipart File Upload for ZIP / Model Weights (Max 100MB)
await fastify.register(fastifyMultipart, {
  limits: { fileSize: 100 * 1024 * 1024 },
});

// Register Swagger OpenAPI Documentation Generator
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

// Register Global Rate Limiter
await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({
    berhasil: false,
    pesan: 'Terlalu banyak permintaan. Silakan tunggu beberapa saat lagi.',
  }),
});

// Register JWT Secret
await fastify.register(jwt, {
  secret: process.env.JWT_SECRET,
});

// Centralized Error Handler
fastify.setErrorHandler((error, request, reply) => {
  const statusCode = error.statusCode || 500;
  const message = statusCode === 500 && process.env.NODE_ENV === 'production'
    ? 'Terjadi kesalahan internal pada server'
    : error.message;

  reply.status(statusCode).send({
    berhasil: false,
    pesan: message,
  });
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
  pesan: 'Selamat datang di REST API Tokiva POS Backend Engine (tokiva.biz.id)',
  versi: '1.0.0',
  total_modul: 18,
  namespaces: ['/api/kasir/*', '/api/owner/*', '/api/admin/*', '/api/auth/*'],
  docs_url: 'http://localhost:5000/docs',
}));

// --- Public Auth Routes ---
fastify.register(authRoutes, { prefix: '/api/auth' });

// --- Clean Role Namespaces ---
fastify.register(kasirRoutes, { prefix: '/api/kasir' });
fastify.register(ownerRoutes, { prefix: '/api/owner' });
fastify.register(adminRoutes, { prefix: '/api/admin' });

// --- Legacy Routes (Preserved for compatibility) ---
fastify.register(tokoRoutes, { prefix: '/api/toko' });
fastify.register(penggunaRoutes, { prefix: '/api/pengguna' });
fastify.register(kategoriRoutes, { prefix: '/api/kategori' });
fastify.register(satuanRoutes, { prefix: '/api/satuan' });
fastify.register(produkRoutes, { prefix: '/api/produk' });
fastify.register(supplierRoutes, { prefix: '/api/supplier' });
fastify.register(pelangganRoutes, { prefix: '/api/pelanggan' });
fastify.register(shiftRoutes, { prefix: '/api/shift' });
fastify.register(transaksiRoutes, { prefix: '/api/transaksi' });
fastify.register(notaMasukRoutes, { prefix: '/api/nota-masuk' });
fastify.register(hutangRoutes, { prefix: '/api/hutang' });
fastify.register(returnSupplierRoutes, { prefix: '/api/return-supplier' });
fastify.register(konsinyasiRoutes, { prefix: '/api/konsinyasi' });
fastify.register(stockAdjustmentRoutes, { prefix: '/api/stock-adjustment' });
fastify.register(opnameRoutes, { prefix: '/api/opname' });
fastify.register(laporanRoutes, { prefix: '/api/laporan' });
fastify.register(aiRoutes, { prefix: '/api/ai' });

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
