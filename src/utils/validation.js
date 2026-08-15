export const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID_V4_RE.test(value);
}

export function validateUuidParams(request, reply) {
  for (const [key, value] of Object.entries(request.params || {})) {
    if (['id', 'sid', 'pid', 'nota_id'].includes(key) && !isUuid(value)) {
      return reply.code(400).send({ berhasil: false, pesan: `${key} tidak valid` });
    }
  }
}
