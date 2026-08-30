// QRIS Utilities — port core dari github.com/verssache/qris-dinamis (MIT)
// Dipakai khusus modul QRIS Tokiva. Core ini tidak bergantung pada React/Vite.

export function calculateCRC16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i += 1) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j += 1) {
      crc = crc & 0x8000
        ? ((crc << 1) ^ 0x1021) & 0xffff
        : (crc << 1) & 0xffff;
    }
  }
  return (crc & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

const TAG_NAMES = {
  '00': 'Payload Format Indicator', '01': 'Point of Initiation Method',
  '02': 'Visa', '03': 'Mastercard', '04': 'Mastercard', '15': 'Visa',
  '26': 'Merchant Account Information', '27': 'Merchant Account Information',
  '28': 'Merchant Account Information', '29': 'Merchant Account Information',
  '30': 'Merchant Account Information', '31': 'Merchant Account Information',
  '32': 'Merchant Account Information', '33': 'Merchant Account Information',
  '34': 'Merchant Account Information', '35': 'Merchant Account Information',
  '36': 'Merchant Account Information', '37': 'Merchant Account Information',
  '38': 'Merchant Account Information', '39': 'Merchant Account Information',
  '40': 'Merchant Account Information', '41': 'Merchant Account Information',
  '42': 'Merchant Account Information', '43': 'Merchant Account Information',
  '44': 'Merchant Account Information', '45': 'Merchant Account Information',
  '46': 'Merchant Account Information', '47': 'Merchant Account Information',
  '48': 'Merchant Account Information', '49': 'Merchant Account Information',
  '50': 'Merchant Account Information', '51': 'Merchant Account Information',
  '52': 'Merchant Category Code', '53': 'Transaction Currency',
  '54': 'Transaction Amount', '55': 'Tip or Convenience Indicator',
  '56': 'Value of Convenience Fee (Fixed)', '57': 'Value of Convenience Fee (%)',
  '58': 'Country Code', '59': 'Merchant Name', '60': 'Merchant City',
  '61': 'Postal Code', '62': 'Additional Data Field', '63': 'CRC',
};

const NESTED_TAGS = new Set([
  ...Array.from({ length: 26 }, (_, i) => String(i + 26).padStart(2, '0')),
  '62',
]);

/**
 * Parse EMVCo TLV. In strict mode, malformed/truncated data throws instead
 * of silently returning a partial payload.
 */
export function parseTLV(data, { strict = false } = {}) {
  if (typeof data !== 'string') {
    throw new Error('QRIS harus berupa teks');
  }

  const elements = [];
  let pos = 0;
  while (pos < data.length) {
    if (pos + 4 > data.length) {
      if (strict) throw new Error('Struktur QRIS tidak lengkap');
      break;
    }

    const tag = data.substring(pos, pos + 2);
    const lengthText = data.substring(pos + 2, pos + 4);
    const length = Number.parseInt(lengthText, 10);
    if (!/^\d{2}$/.test(lengthText) || Number.isNaN(length)) {
      if (strict) throw new Error('Format panjang data QRIS tidak valid');
      break;
    }
    if (pos + 4 + length > data.length) {
      if (strict) throw new Error('Data QRIS terpotong atau tidak lengkap');
      break;
    }

    const value = data.substring(pos + 4, pos + 4 + length);
    const element = {
      tag,
      name: TAG_NAMES[tag] ?? `Unknown (${tag})`,
      length,
      value,
    };

    if (NESTED_TAGS.has(tag)) {
      element.children = parseTLV(value, { strict });
    }
    elements.push(element);
    pos += 4 + length;
  }

  if (strict && pos !== data.length) {
    throw new Error('Masih ada data QRIS yang tidak terbaca');
  }
  return elements;
}

export function parseQRIS(qrisString) {
  const raw = parseTLV(String(qrisString || '').trim(), { strict: true });
  const findTag = (tag) => raw.find((t) => t.tag === tag);
  const methodValue = findTag('01')?.value;
  const method = methodValue === '12' ? 'dynamic' : 'static';
  const tipIndicatorValue = findTag('55')?.value;
  let tipIndicator;
  if (tipIndicatorValue === '01') tipIndicator = 'prompt';
  else if (tipIndicatorValue === '02') tipIndicator = 'fixed';
  else if (tipIndicatorValue === '03') tipIndicator = 'percentage';

  const merchantAccountInfo = raw
    .filter((t) => {
      const tagNum = Number.parseInt(t.tag, 10);
      return tagNum >= 26 && tagNum <= 51 && t.children;
    })
    .map((t) => {
      const children = t.children || [];
      const findChild = (tag) => children.find((child) => child.tag === tag);
      return {
        tag: t.tag,
        globallyUniqueId: findChild('00')?.value || '',
        merchantId: findChild('01')?.value || findChild('02')?.value,
        merchantCriteria: findChild('03')?.value,
        fields: children,
      };
    });

  return {
    version: findTag('00')?.value || '01',
    method,
    merchantAccountInfo,
    merchantCategoryCode: findTag('52')?.value || '',
    currency: findTag('53')?.value || '360',
    amount: findTag('54')?.value,
    tipIndicator,
    tipFixed: findTag('56')?.value,
    tipPercentage: findTag('57')?.value,
    countryCode: findTag('58')?.value || 'ID',
    merchantName: findTag('59')?.value || '',
    merchantCity: findTag('60')?.value || '',
    postalCode: findTag('61')?.value || '',
    additionalData: findTag('62')?.children,
    crc: findTag('63')?.value || '',
    raw,
  };
}

/**
 * Validate full QRIS structure, required tags, POI, merchant account, and CRC.
 * Options are used by Tokiva when accepting an owner QRIS static image.
 */
export function validateQRIS(qrisString, {
  requireStatic = false,
  requireIdr = false,
  requireMerchantDetails = false,
} = {}) {
  const errors = [];
  if (typeof qrisString !== 'string' || qrisString.trim().length === 0) {
    return { valid: false, errors: ['QRIS kosong'] };
  }

  const str = qrisString.trim();
  if (!str.startsWith('000201')) {
    errors.push('Format QRIS tidak dikenali');
  }
  if (str.length < 20) {
    errors.push('Data QRIS terlalu pendek');
    return { valid: false, errors };
  }
  if (!/^[\x20-\x7E]+$/.test(str)) {
    errors.push('Data QRIS mengandung karakter yang tidak valid');
  }

  // CRC field must be the final EMVCo element: 6304 + 4 hex chars.
  const crcHeader = str.substring(str.length - 8, str.length - 4);
  const declaredCRC = str.substring(str.length - 4);
  if (crcHeader !== '6304' || !/^[0-9A-Fa-f]{4}$/.test(declaredCRC)) {
    errors.push('Kode keamanan QRIS tidak lengkap');
  } else {
    const calculatedCRC = calculateCRC16(str.substring(0, str.length - 4));
    if (declaredCRC.toUpperCase() !== calculatedCRC) {
      errors.push('Kode keamanan QRIS tidak cocok');
    }
  }

  let elements = [];
  try {
    elements = parseTLV(str, { strict: true });
  } catch (error) {
    errors.push(error.message || 'Struktur QRIS tidak valid');
  }

  const tags = new Set(elements.map((element) => element.tag));
  const requiredTags = [
    ['00', 'format QRIS'], ['01', 'jenis QRIS'], ['52', 'kategori merchant'],
    ['53', 'mata uang'], ['58', 'negara'], ['59', 'nama merchant'],
    ['60', 'kota merchant'], ['63', 'kode keamanan'],
  ];
  for (const [tag, label] of requiredTags) {
    if (!tags.has(tag)) errors.push(`Informasi ${label} belum lengkap`);
  }

  const method = elements.find((element) => element.tag === '01')?.value;
  if (method && method !== '11' && method !== '12') {
    errors.push('Jenis QRIS tidak dikenali');
  }
  if (requireStatic && method && method !== '11') {
    errors.push('Gunakan QRIS statis milik toko, bukan QRIS dinamis');
  }

  const hasMerchant = elements.some((element) => {
    const number = Number.parseInt(element.tag, 10);
    return number >= 26 && number <= 51 && element.children?.length;
  });
  if (!hasMerchant) errors.push('Informasi merchant QRIS belum lengkap');

  const parsedCurrency = elements.find((element) => element.tag === '53')?.value;
  if (requireIdr && parsedCurrency && parsedCurrency !== '360') {
    errors.push('QRIS harus menggunakan mata uang Rupiah');
  }

  const merchantName = elements.find((element) => element.tag === '59')?.value?.trim();
  const merchantCity = elements.find((element) => element.tag === '60')?.value?.trim();
  if (requireMerchantDetails && !merchantName) errors.push('Nama merchant QRIS belum tersedia');
  if (requireMerchantDetails && !merchantCity) errors.push('Kota merchant QRIS belum tersedia');

  return { valid: errors.length === 0, errors };
}

function buildTLVString(elements) {
  return elements.map((element) => {
    const value = element.children ? buildTLVString(element.children) : element.value;
    return `${element.tag}${value.length.toString().padStart(2, '0')}${value}`;
  }).join('');
}

function makeTLV(tag, value, name = '') {
  return { tag, name, length: value.length, value };
}

/** Convert a valid static QRIS into a dynamic QRIS payload. */
export function convertQRIS(qrisString, options = {}) {
  const validation = validateQRIS(qrisString, { requireStatic: true, requireIdr: true, requireMerchantDetails: true });
  if (!validation.valid) {
    throw new Error('QRIS sumber tidak valid atau tidak lengkap');
  }

  const amount = Number(options.amount);
  if (!Number.isSafeInteger(amount) || amount <= 0 || String(amount).length > 13) {
    throw new Error('Nominal QRIS tidak valid');
  }

  const elements = parseTLV(qrisString.trim(), { strict: true });
  const result = [];
  let amountInserted = false;
  const managedTags = new Set(['54', '55', '56', '57', '63']);

  for (const element of elements) {
    if (managedTags.has(element.tag)) continue;

    if (element.tag === '01') {
      result.push(makeTLV('01', '12', 'Point of Initiation Method'));
      continue;
    }

    // EMVCo QRIS places amount/fee before country code (tag 58).
    if (element.tag === '58' && !amountInserted) {
      result.push(makeTLV('54', String(amount), 'Transaction Amount'));
      if (options.fee) {
        const feeValue = Number(options.fee.value);
        if (!Number.isFinite(feeValue) || feeValue < 0) throw new Error('Biaya QRIS tidak valid');
        if (options.fee.type === 'fixed') {
          result.push(makeTLV('55', '02', 'Tip or Convenience Indicator'));
          result.push(makeTLV('56', String(options.fee.value), 'Value of Convenience Fee (Fixed)'));
        } else if (options.fee.type === 'percentage') {
          result.push(makeTLV('55', '03', 'Tip or Convenience Indicator'));
          result.push(makeTLV('57', String(options.fee.value), 'Value of Convenience Fee (%)'));
        }
      }
      amountInserted = true;
    }
    result.push(element);
  }

  if (!amountInserted) throw new Error('Struktur QRIS tidak memiliki lokasi nominal yang valid');

  const crcInput = `${buildTLVString(result)}6304`;
  const converted = crcInput + calculateCRC16(crcInput);
  const convertedValidation = validateQRIS(converted, { requireIdr: true, requireMerchantDetails: true });
  if (!convertedValidation.valid) throw new Error('QRIS dinamis gagal diverifikasi');

  const parsed = parseQRIS(converted);
  if (parsed.method !== 'dynamic' || parsed.amount !== String(amount)) {
    throw new Error('Nominal QRIS dinamis tidak sesuai transaksi');
  }
  return converted;
}
