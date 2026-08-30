// ============================================================
// QRIS Utilities — port dari github.com/verssache/qris-dinamis (MIT)
// Convert static QRIS → dinamis, parse, validate, CRC16.
// Dipakai modul qris yang terpisah dari pembayaran lain.
// ============================================================

export function calculateCRC16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) crc = ((crc << 1) ^ 0x1021) & 0xffff;
      else crc = (crc << 1) & 0xffff;
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

const NESTED_TAGS = new Set([...Array.from({ length: 26 }, (_, i) => String(i + 26).padStart(2, '0')), '62']);

export function parseTLV(data) {
  const elements = [];
  let pos = 0;
  while (pos < data.length) {
    if (pos + 4 > data.length) break;
    const tag = data.substring(pos, pos + 2);
    const length = parseInt(data.substring(pos + 2, pos + 4), 10);
    if (isNaN(length) || pos + 4 + length > data.length) break;
    const value = data.substring(pos + 4, pos + 4 + length);
    const element = { tag, name: TAG_NAMES[tag] ?? `Unknown (${tag})`, length, value };
    if (NESTED_TAGS.has(tag)) element.children = parseTLV(value);
    elements.push(element);
    pos += 4 + length;
  }
  return elements;
}

export function parseQRIS(qrisString) {
  const raw = parseTLV(qrisString);
  const findTag = (tag) => raw.find((t) => t.tag === tag);
  const methodValue = findTag('01')?.value;
  const method = methodValue === '12' ? 'dynamic' : 'static';
  const tipIndicatorValue = findTag('55')?.value;
  let tipIndicator;
  if (tipIndicatorValue === '01') tipIndicator = 'prompt';
  else if (tipIndicatorValue === '02') tipIndicator = 'fixed';
  else if (tipIndicatorValue === '03') tipIndicator = 'percentage';

  const merchantAccountInfo = raw
    .filter((t) => { const n = parseInt(t.tag, 10); return n >= 26 && n <= 51 && t.children; })
    .map((t) => {
      const children = t.children ?? [];
      const findChild = (ct) => children.find((c) => c.tag === ct);
      return {
        tag: t.tag,
        globallyUniqueId: findChild('00')?.value ?? '',
        merchantId: findChild('01')?.value ?? findChild('02')?.value,
        merchantCriteria: findChild('03')?.value,
        fields: children,
      };
    });

  return {
    version: findTag('00')?.value ?? '01',
    method,
    merchantAccountInfo,
    merchantCategoryCode: findTag('52')?.value ?? '',
    currency: findTag('53')?.value ?? '360',
    amount: findTag('54')?.value,
    tipIndicator,
    tipFixed: findTag('56')?.value,
    tipPercentage: findTag('57')?.value,
    countryCode: findTag('58')?.value ?? 'ID',
    merchantName: findTag('59')?.value ?? '',
    merchantCity: findTag('60')?.value ?? '',
    postalCode: findTag('61')?.value ?? '',
    additionalData: findTag('62')?.children,
    crc: findTag('63')?.value ?? '',
  };
}

export function validateQRIS(qrisString) {
  const errors = [];
  if (!qrisString || qrisString.trim().length === 0) return { valid: false, errors: ['QRIS string is empty'] };
  const str = qrisString.trim();
  if (!str.startsWith('000201')) errors.push('QRIS must start with Payload Format Indicator "000201"');
  if (str.length < 20) {
    if (!errors.length) errors.push('QRIS string is too short');
    return { valid: false, errors };
  }
  const dataWithoutCRC = str.substring(0, str.length - 4);
  const declaredCRC = str.substring(str.length - 4);
  const calculatedCRC = calculateCRC16(dataWithoutCRC);
  if (declaredCRC.toUpperCase() !== calculatedCRC) {
    errors.push(`CRC mismatch: expected ${calculatedCRC}, got ${declaredCRC.toUpperCase()}`);
  }
  return { valid: errors.length === 0, errors };
}

function buildTLVString(elements) {
  return elements
    .map((el) => {
      const value = el.children ? buildTLVString(el.children) : el.value;
      const length = value.length.toString().padStart(2, '0');
      return `${el.tag}${length}${value}`;
    })
    .join('');
}

function makeTLV(tag, value, name = '') {
  return { tag, name, length: value.length, value };
}

/**
 * Convert static QRIS → dynamic dengan menyuntik nominal + (opsional) fee.
 * CATATAN: hasil ini "dinamis semu" untuk demo/purwaruba — QRIS dinamis yang
 * diproses bank riil harus dari penyedia resmi. Untuk skripsi Tokiva: bertujuan
 * menampilkan QR dengan nominal ter-set di UI + approval manual kasir/owner.
 */
export function convertQRIS(qrisString, options) {
  const elements = parseTLV(qrisString);
  const result = [];
  let amountInserted = false;
  const managedTags = new Set(['54', '55', '56', '57', '63']);

  for (const el of elements) {
    if (managedTags.has(el.tag)) continue;
    if (el.tag === '01') {
      result.push(makeTLV('01', '12', 'Point of Initiation Method'));
      continue;
    }
    if (el.tag === '58' && !amountInserted) {
      const amountStr = options.amount.toString();
      result.push(makeTLV('54', amountStr, 'Transaction Amount'));
      if (options.fee) {
        if (options.fee.type === 'fixed') {
          result.push(makeTLV('55', '02', 'Tip or Convenience Indicator'));
          result.push(makeTLV('56', options.fee.value.toString(), 'Value of Convenience Fee (Fixed)'));
        } else {
          result.push(makeTLV('55', '03', 'Tip or Convenience Indicator'));
          result.push(makeTLV('57', options.fee.value.toString(), 'Value of Convenience Fee (%)'));
        }
      }
      amountInserted = true;
    }
    result.push(el);
  }

  const withoutCRC = buildTLVString(result);
  const crcInput = withoutCRC + '6304';
  const crc = calculateCRC16(crcInput);
  return crcInput + crc;
}
