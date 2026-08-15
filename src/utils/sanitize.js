export function sanitizePlainText(value, { max = 255, field = 'Nilai' } = {}) {
  if (typeof value !== 'string') {
    throw Object.assign(new Error(`${field} harus berupa teks`), { statusCode: 400 });
  }

  const clean = value
    .normalize('NFKC')
    .replace(/<[^>]*>/g, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/on[a-z]+\s*=/gi, '')
    .replace(/[{}<>]/g, '')
    .trim()
    .slice(0, max);

  if (!clean) {
    throw Object.assign(new Error(`${field} wajib diisi`), { statusCode: 400 });
  }
  return clean;
}

export function sanitizeOptionalText(value, { max = 255 } = {}) {
  if (value === undefined || value === null) return value;
  return sanitizePlainText(value, { max });
}
