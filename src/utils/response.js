// Format response JSON standar Tokiva POS
export function responseSukses(data = {}, pesan = 'Berhasil') {
  return {
    berhasil: true,
    data,
    pesan,
  };
}

export function responseGagal(pesan = 'Terjadi kesalahan', status = 400) {
  const error = new Error(pesan);
  error.statusCode = status;
  throw error;
}
