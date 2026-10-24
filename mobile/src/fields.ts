import type { FieldInfo, SensorField } from './types';

/** Fallback when the server hasn't answered yet; the server's /api/sensors/latest is authoritative. */
export const PRIMARY_FIELDS: FieldInfo[] = [
  { key: 'TDS', label: 'TDS (padatan terlarut)', unit: 'ppm', unitVerified: false },
  { key: 'pH', label: 'pH larutan', unit: '', unitVerified: true },
  { key: 'env_temp_c', label: 'Suhu udara', unit: '°C', unitVerified: true },
  { key: 'env_humidity', label: 'Kelembapan udara (RH)', unit: '%', unitVerified: false },
  { key: 'uv_intensity', label: 'Intensitas UV', unit: 'mW/cm²', unitVerified: false },
  { key: 'luminous_intensity', label: 'Intensitas cahaya', unit: 'lx', unitVerified: false },
  { key: 'atmosphere_pressure', label: 'Tekanan udara', unit: 'hPa', unitVerified: false },
];

export const ALL_RAW_FIELDS: SensorField[] = [
  'TDS',
  'pH',
  'temperature',
  'humidity',
  'env_temp_c',
  'env_humidity',
  'uv_intensity',
  'luminous_intensity',
  'atmosphere_pressure',
];

/** Firmware fertilizer automation band — a device setting, not an agronomic threshold. */
export const FIRMWARE_TDS_BAND = { low: 750, target: 800, high: 850 };
