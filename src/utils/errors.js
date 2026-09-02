// Util error eksplisit — global setErrorHandler menghormati err.statusCode
// (index.js ~line 158). Pakai ini untuk status non-default (403/409/dst).
export function httpError(statusCode, pesan) {
  const err = new Error(pesan);
  err.statusCode = statusCode;
  return err;
}
