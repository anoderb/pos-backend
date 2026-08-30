// Self-check untuk modul brute-lock.js — jalankan: node src/utils/brute-lock.test.js
import { isLocked, recordAttempt, resetKey, LOGIN_TIERS } from './brute-lock.js';

function assert(cond, msg) {
  if (!cond) {
    console.error('❌ FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('✅', msg);
  }
}

// Reset isolasi
resetKey('test:a@x.com');
resetKey('test:b@x.com');

// 1-2 percobaan: tidak ter-lock
recordAttempt('test:a@x.com', LOGIN_TIERS);
recordAttempt('test:a@x.com', LOGIN_TIERS);
assert(isLocked('test:a@x.com') === 0, '2x gagal belum di-lock');

// Ke-3: lock 5 menit (300000 ms)
const r3 = recordAttempt('test:a@x.com', LOGIN_TIERS);
assert(isLocked('test:a@x.com') > 0, 'ke-3 ter-lock');
assert(r3.lockedForMs === 5 * 60 * 1000, 'ke-3 lock 5 menit');
assert(r3.count === 3, 'counter = 3');

// Ke-5 (2x lagi): naik ke 10 menit
recordAttempt('test:a@x.com', LOGIN_TIERS);
const r5 = recordAttempt('test:a@x.com', LOGIN_TIERS);
assert(r5.lockedForMs === 10 * 60 * 1000, 'ke-5 lock 10 menit');

// Reset sukses: bersih
resetKey('test:a@x.com');
assert(isLocked('test:a@x.com') === 0 && recordAttempt('test:a@x.com', LOGIN_TIERS).count === 1, 'reset mengembalikan counter ke 1');

// Isolasi antar-email: email lain tidak kena
assert(isLocked('test:b@x.com') === 0, 'email berbeda tidak ter-lock');

console.log(process.exitCode ? '\nADA GAGAL' : '\nSEMUA PASS');
