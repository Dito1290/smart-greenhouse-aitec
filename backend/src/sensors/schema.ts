/**
 * Sensor fields published by the ESP32 on `environment/data`.
 * Field names are kept exactly as the firmware sends them.
 *
 * `temperature`/`humidity` are mirrors of `env_temp_c`/`env_humidity` in the
 * firmware (same physical sensor), so they are never shown as separate readings.
 */
export const SENSOR_FIELDS = [
  'TDS',
  'pH',
  'temperature',
  'humidity',
  'env_temp_c',
  'env_humidity',
  'uv_intensity',
  'luminous_intensity',
  'atmosphere_pressure',
] as const;

export type SensorField = (typeof SENSOR_FIELDS)[number];
export type SensorValues = Record<SensorField, number | null>;

export interface FieldMeta {
  label: string;
  unit: string;
  /** false = unit inferred from the sensor family, not verified against firmware/hardware. */
  unitVerified: boolean;
  min: number;
  max: number;
  mirrorOf?: SensorField;
  note?: string;
}

export const FIELD_META: Record<SensorField, FieldMeta> = {
  TDS: {
    label: 'TDS (padatan terlarut)',
    unit: 'ppm',
    unitVerified: false,
    min: 0,
    max: 10000,
    note: 'Dihitung dari sensor analog; akurasi bergantung kalibrasi dan suhu larutan.',
  },
  pH: {
    label: 'pH larutan',
    unit: '',
    unitVerified: true,
    min: 0,
    max: 14,
    note: 'Rumus konversi dan konstanta kalibrasi pH di firmware belum diverifikasi di perangkat keras.',
  },
  env_temp_c: { label: 'Suhu udara', unit: '°C', unitVerified: true, min: -40, max: 85 },
  env_humidity: { label: 'Kelembapan udara (RH)', unit: '%', unitVerified: false, min: 0, max: 100 },
  temperature: { label: 'Suhu (salinan)', unit: '°C', unitVerified: true, min: -40, max: 85, mirrorOf: 'env_temp_c' },
  humidity: { label: 'Kelembapan (salinan)', unit: '%', unitVerified: false, min: 0, max: 100, mirrorOf: 'env_humidity' },
  uv_intensity: { label: 'Intensitas UV', unit: 'mW/cm²', unitVerified: false, min: 0, max: 100 },
  luminous_intensity: { label: 'Intensitas cahaya', unit: 'lx', unitVerified: false, min: 0, max: 200000 },
  atmosphere_pressure: { label: 'Tekanan udara', unit: 'hPa', unitVerified: false, min: 300, max: 1200 },
};

/** Fields that represent independent measurements (mirrors excluded). */
export const PRIMARY_FIELDS: SensorField[] = SENSOR_FIELDS.filter((f) => !FIELD_META[f].mirrorOf);

export type FieldIssue = 'missing' | 'null' | 'not_a_number' | 'out_of_range';

export interface ParseResult {
  ok: boolean;
  values: SensorValues;
  issues: Partial<Record<SensorField, FieldIssue>>;
  /** Mirror fields that disagree with their source (unexpected per firmware). */
  mirrorMismatch: SensorField[];
  error?: string;
}

function emptyValues(): SensorValues {
  return Object.fromEntries(SENSOR_FIELDS.map((f) => [f, null])) as SensorValues;
}

export function parseSensorPayload(raw: string | Buffer): ParseResult {
  const values = emptyValues();
  const issues: ParseResult['issues'] = {};
  let data: unknown;
  try {
    data = JSON.parse(raw.toString());
  } catch {
    return { ok: false, values, issues, mirrorMismatch: [], error: 'invalid_json' };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, values, issues, mirrorMismatch: [], error: 'not_an_object' };
  }
  const obj = data as Record<string, unknown>;

  for (const field of SENSOR_FIELDS) {
    if (!(field in obj)) {
      issues[field] = 'missing';
      continue;
    }
    const v = obj[field];
    if (v === null) {
      issues[field] = 'null';
    } else if (typeof v !== 'number' || !Number.isFinite(v)) {
      issues[field] = 'not_a_number';
    } else if (v < FIELD_META[field].min || v > FIELD_META[field].max) {
      issues[field] = 'out_of_range';
    } else {
      values[field] = v;
    }
  }

  const mirrorMismatch: SensorField[] = [];
  for (const field of SENSOR_FIELDS) {
    const source = FIELD_META[field].mirrorOf;
    if (source && values[field] !== null && values[source] !== null && Math.abs(values[field]! - values[source]!) > 0.05) {
      mirrorMismatch.push(field);
    }
  }

  const hasAnyValue = PRIMARY_FIELDS.some((f) => values[f] !== null);
  return {
    ok: hasAnyValue,
    values,
    issues,
    mirrorMismatch,
    error: hasAnyValue ? undefined : 'no_valid_fields',
  };
}
