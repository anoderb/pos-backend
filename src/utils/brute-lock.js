// Brute-force lockout dengan durasi bertingkat (escalating backoff), in-memory.
// Asumsi: backend single-process (satu instance node). Tidak ada persist antar-restart.
// ponytail: kalau backend nanti multi-instance, pindah store ke Redis/shared DB —
//          ganti isLocked/recordAttempt/resetKey jadi client kunci bersama.
const locks = new Map(); // key -> { count, lockedUntil }

// Tiers default: [ {after: N, minutes: M} ] → setelah N percobaan, lock M menit.
// Lock memakai tier TERBESAR yang terpenuhi (tidak pernah menurun).
export const LOGIN_TIERS = [
  { after: 3, minutes: 5 },
  { after: 5, minutes: 10 },
  { after: 7, minutes: 30 },
  { after: 10, minutes: 60 },
];

export const REGISTER_TIERS = [
  { after: 3, minutes: 10 },
  { after: 5, minutes: 30 },
  { after: 8, minutes: 60 },
];

// Sisa waktu lock (ms). 0 = tidak ter-lock.
export function isLocked(key) {
  const rec = locks.get(key);
  if (!rec || !rec.lockedUntil) return 0;
  const remain = rec.lockedUntil - Date.now();
  if (remain > 0) return remain;
  locks.delete(key); // expired
  return 0;
}

// Catat satu percobaan, kembalikan { count, lockedForMs }.
export function recordAttempt(key, tiers = LOGIN_TIERS) {
  const now = Date.now();
  const rec = locks.get(key) || { count: 0, lockedUntil: now + 60 * 60 * 1000 }; // cleanup default 1 jam
  rec.count += 1;

  let lockedForMs = 0;
  for (const t of tiers) {
    if (rec.count >= t.after) lockedForMs = Math.max(lockedForMs, t.minutes * 60 * 1000);
  }
  rec.lockedUntil = lockedForMs ? now + lockedForMs : 0;
  locks.set(key, rec);
  return { count: rec.count, lockedForMs };
}

// Reset counter (mis. setelah login sukses).
export function resetKey(key) {
  locks.delete(key);
}

// Bersihkan entri lama supaya map tidak membesar tanpa batas.
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [k, rec] of locks) {
    if (rec.lockedUntil && now >= rec.lockedUntil + 24 * 60 * 60 * 1000) locks.delete(k);
  }
}, 60 * 60 * 1000);
cleanup.unref?.();
