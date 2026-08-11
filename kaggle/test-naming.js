// Unit test: model naming + versioning helpers
// Jalankan: node test-naming.js

const EXPERIMENT_NAME_MAP = {
  'E1_MobileNetV3': 'E1_MobileNetV3L',
  'E2_MobileNetV3_CBAM': 'E2_MobileNetV3L_CBAM',
  'E1_MobileNetV2': 'E1_MobileNetV2',
  'E2_MobileNetV2_CBAM': 'E2_MobileNetV2L_CBAM',
};

function formatTimestamp(date, withMinutes = true) {
  const d = new Date(date.getTime() + 7 * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const base = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  return withMinutes ? `${base}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}` : base;
}

function normalizeExperimentKey(key) {
  if (!key) return 'EXPERIMENT';
  return EXPERIMENT_NAME_MAP[key] || key;
}

function buildModelName(bestExperiment, now = new Date()) {
  const expKey = normalizeExperimentKey(bestExperiment || '');
  return `${expKey}_${formatTimestamp(now)}`;
}

function backboneFromExperiment(expKey) {
  if (!expKey) return 'MobileNetV3Large';
  if (expKey.includes('V2')) return 'MobileNetV2';
  if (expKey.includes('V3')) return 'MobileNetV3Large';
  return 'MobileNetV3Large';
}

// Fixed date 2026-08-05 23:26 GMT+7
const d = new Date('2026-08-05T16:26:00Z');
console.log('E1 name:', buildModelName('E1_MobileNetV3', d));
console.log('E2 name:', buildModelName('E2_MobileNetV3_CBAM', d));
console.log('Date only:', formatTimestamp(d, false));
console.log('Backbone E1:', backboneFromExperiment('E1_MobileNetV3'));
console.log('Backbone E2:', backboneFromExperiment('E2_MobileNetV3_CBAM'));

// Assertions
const e1 = buildModelName('E1_MobileNetV3', d);
const e2 = buildModelName('E2_MobileNetV3_CBAM', d);
if (e1 !== 'E1_MobileNetV3L_202608052326') {
  console.error('FAIL E1:', e1, 'expected E1_MobileNetV3L_202608052326');
  process.exit(1);
}
if (e2 !== 'E2_MobileNetV3L_CBAM_202608052326') {
  console.error('FAIL E2:', e2, 'expected E2_MobileNetV3L_CBAM_202608052326');
  process.exit(1);
}
console.log('✅ All naming tests PASS');
