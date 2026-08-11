# 🚀 WebPOS Backend REST API Engine

REST API Server berbasis Fastify Node.js + Supabase PostgreSQL.

---

## 🌐 Quick Links & Interactive Docs

- **Web Documentation (Interactive Swagger UI):** 👉 [http://localhost:5000/docs](http://localhost:5000/docs)
- **Health Check Endpoint:** 👉 [http://localhost:5000/health](http://localhost:5000/health)
- **API Base URL Local:** `http://localhost:5000/api`
- **API Base URL Production:** configured via env

---

## 🛠️ Tech Stack & Modul

- **Framework:** Fastify v5 (Node.js)
- **Database:** Supabase PostgreSQL (26 Tabel POS + RLS + Triggers + Indexes)
- **Auth:** Supabase JWT + Google OAuth Callback + Resend Email API
- **Storage:** Supabase Storage (`toko-logos`, `toko-qris`, `nota-masuk-foto`, `bukti-pembayaran-hutang`, `dataset-foto-ai`)
- **Security:** `@fastify/rate-limit` (Anti-Spam & Anti-DDoS)

---

## 📊 Daftar 97 REST API Endpoints (19 Modul)

### 🔑 1. Auth & Keamanan (`/api/auth`)
| Method | Endpoint | Deskripsi | Rate Limit |
|--------|----------|-----------|:----------:|
| `POST` | `/api/auth/register` | Register Owner 3 Langkah + Email Welcome | 5x / 15 min |
| `POST` | `/api/auth/login` | Login Email + Password | 5x / 15 min |
| `POST` | `/api/auth/oauth-sync` | Sync User Callback Google OAuth | Normal |
| `POST` | `/api/auth/lupa-password` | Kirim link reset via Resend Email | 5x / 15 min |
| `POST` | `/api/auth/reset-password` | Reset password dengan token | 5x / 15 min |
| `POST` | `/api/auth/refresh` | Refresh JWT Token Session | Normal |
| `GET` | `/api/auth/profil` | Detail profil pengguna & toko aktif | Auth Bearer |
| `POST` | `/api/auth/logout` | Invalidate Session Logout | Auth Bearer |

### 🏪 2. Toko & Setting (`/api/toko`)
| Method | Endpoint | Deskripsi | Role |
|--------|----------|-----------|------|
| `GET` | `/api/toko` | Detail data toko sendiri | Owner, Kasir |
| `PUT` | `/api/toko` | Edit info, warna tema, rekening | Owner |
| `POST` | `/api/toko/logo` | Upload logo toko | Owner |
| `POST` | `/api/toko/qris` | Upload gambar QRIS toko | Owner |

### 👥 3. Pengguna / Kasir (`/api/pengguna`)
| Method | Endpoint | Deskripsi | Role |
|--------|----------|-----------|------|
| `GET` | `/api/pengguna` | List semua akun kasir toko ini | Owner |
| `POST` | `/api/pengguna` | Tambah akun kasir baru | Owner |
| `GET` | `/api/pengguna/:id` | Detail data kasir | Owner |
| `PUT` | `/api/pengguna/:id` | Edit data kasir | Owner |
| `DELETE` | `/api/pengguna/:id` | Nonaktifkan akun kasir | Owner |
| `GET` | `/api/pengguna/:id/shift` | Histori shift kerja kasir | Owner |

### 🏷️ 4. Kategori & Satuan (`/api/kategori`, `/api/satuan`)
- **Kategori:** `GET /api/kategori`, `POST /api/kategori`, `PUT /:id`, `DELETE /:id`
- **Satuan:** `GET /api/satuan`, `POST /api/satuan`, `PUT /:id`, `DELETE /:id`

### 📦 5. Master Produk & Multi-Satuan (`/api/produk`)
- `GET /api/produk` — List produk (Filter: `kategori_id`, `stok_kritis`, `aktif_ai`, `search`)
- `POST /api/produk` — Tambah produk baru + satuan ecer default
- `GET /api/produk/:id` — Detail produk + satuan jual/beli + supplier
- `PUT /api/produk/:id` — Edit produk
- `DELETE /api/produk/:id` — Soft delete produk
- `GET /api/produk/barcode/:kode` — Cari produk by barcode
- `GET /api/produk/:id/movement` — Audit log pergerakan stok
- `GET / POST / PUT / DELETE` `/api/produk/:id/satuan-jual` — Satuan jual ecer/grosir
- `GET / POST / PUT / DELETE` `/api/produk/:id/satuan-beli` — Satuan beli supplier

### 🚚 6. Supplier & Pelanggan (`/api/supplier`, `/api/pelanggan`)
- **Supplier:** `GET /api/supplier`, `POST /api/supplier`, `GET /:id`, `GET /:id/hutang`, `PUT /:id`, `DELETE /:id`
- **Pelanggan:** `GET /api/pelanggan`, `POST /api/pelanggan`, `GET /:id`, `PUT /:id`, `DELETE /:id`

### ⏱️ 7. Shift Kasir (`/api/shift`)
- `POST /api/shift/buka` — Buka shift (modal awal)
- `GET /api/shift/aktif` — Get status shift buka
- `POST /api/shift/tutup` — Tutup shift (rekap cash/qris/transfer & selisih)
- `GET /api/shift` — List semua shift toko
- `GET /api/shift/:id` — Detail rekap shift

### 🛒 8. Transaksi Kasir & Offline Sync (`/api/transaksi`)
- `POST /api/transaksi` — Transaksi Penjualan Baru (Online)
- `POST /api/transaksi/sync-offline` — **Batch Sync Offline dari Dexie.js**
- `GET /api/transaksi` — List transaksi
- `GET /api/transaksi/:id` — Detail transaksi + items
- `POST /api/transaksi/:id/void` — Void transaksi (Restorasi stok)

### 📥 9. Purchase Order & Hutang (`/api/nota-masuk`, `/api/hutang`)
- **Nota Masuk:** `POST /api/nota-masuk` (**Auto Average Costing HPP**), `GET /`, `GET /:id`
- **Hutang:** `GET /api/hutang`, `POST /:nota_id/bayar`, `GET /:nota_id/histori`

### 🔄 10. Return Supplier & Konsinyasi (`/api/return-supplier`, `/api/konsinyasi`)
- **Return Supplier:** `POST /api/return-supplier`, `GET /`, `GET /:id`
- **Konsinyasi:** `POST /api/konsinyasi`, `POST /:id/kembali`, `POST /:id/bayar`, `GET /`, `GET /:id`

### 📋 11. Adjustment & Stock Opname (`/api/stock-adjustment`, `/api/opname`)
- **Adjustment:** `POST /api/stock-adjustment` (+/- stok wajib alasan), `GET /`
- **Opname 3 Tahap:** `POST /api/opname` (Draft), `PUT /:id/item/:pid` (Fisik), `POST /:id/review`, `POST /:id/final` (Mass update stok)

### 📈 12. Laporan & Export (`/api/laporan`)
- `GET /api/laporan/dashboard` — Widget omzet, stok kritis, shift
- `GET /api/laporan/penjualan` & `/export` — Laporan & Export Penjualan
- `GET /api/laporan/stok` & `/export` — Laporan & Export Stok
- `GET /api/laporan/pembelian` & `/export` — Laporan & Export Pembelian
- `GET /api/laporan/shift` & `/export` — Laporan & Export Shift
- `GET /api/laporan/laba-rugi` — Estimasi Laba Kotor

### 🤖 13. AI Visual Scanner (`/api/ai`)
- `POST /api/ai/koreksi` — Simpan koreksi kasir saat AI confidence rendah
- `GET /api/ai/koreksi` — List koreksi AI
- `PUT /api/ai/koreksi/:id` — Approve/Reject koreksi AI

---

## ⚡ Cara Menjalankan Backend Server

```bash
# 1. Masuk ke direktori pos-backend
cd pos-backend

# 2. Install dependencies
npm install

# 3. Jalankan server (mode watch)
npm run dev
```

Server akan aktif di `http://localhost:5000` dan Dokumentasi Interaktif Swagger UI dapat dibuka di browser via **`http://localhost:5000/docs`**.
