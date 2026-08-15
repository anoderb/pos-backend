export function parsePagination(query = {}) {
  const rawLimit = Number.parseInt(String(query.limit ?? 20), 10);
  const rawOffset = Number.parseInt(String(query.offset ?? 0), 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 20;
  const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;
  return { limit, offset, end: offset + limit - 1 };
}

export function paginationMeta({ limit, offset }, count) {
  return { limit, offset, total: count ?? null, has_next: count === null ? null : offset + limit < count };
}
