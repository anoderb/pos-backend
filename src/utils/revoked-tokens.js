import crypto from 'node:crypto';

// Process-local denylist closes the logout gap for the lifetime of this API process.
// Supabase global signOut revokes refresh sessions; access JWTs remain valid until exp.
const revoked = new Map();

function keyFor(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function expiryFromJwt(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return Number(payload.exp) * 1000;
  } catch {
    return Date.now() + 15 * 60 * 1000;
  }
}

export function revokeAccessToken(token) {
  if (!token) return;
  const key = keyFor(token);
  const expiresAt = expiryFromJwt(token);
  if (expiresAt > Date.now()) revoked.set(key, expiresAt);
}

export function isAccessTokenRevoked(token) {
  if (!token) return false;
  const now = Date.now();
  for (const [key, expiresAt] of revoked) {
    if (expiresAt <= now) revoked.delete(key);
  }
  const expiresAt = revoked.get(keyFor(token));
  return Boolean(expiresAt && expiresAt > now);
}

export function clearRevokedTokensForTests() {
  revoked.clear();
}
