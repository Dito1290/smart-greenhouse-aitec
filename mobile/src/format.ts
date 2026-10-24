import type { SensorField } from './types';

const DECIMALS: Record<SensorField, number> = {
  TDS: 0,
  pH: 2,
  temperature: 1,
  humidity: 1,
  env_temp_c: 1,
  env_humidity: 1,
  uv_intensity: 2,
  luminous_intensity: 0,
  atmosphere_pressure: 1,
};

export function formatValue(field: SensorField, v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('id-ID', {
    minimumFractionDigits: DECIMALS[field],
    maximumFractionDigits: DECIMALS[field],
  });
}

export function formatAge(ms: number | null): string {
  if (ms === null) return 'belum ada';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return 'baru saja';
  if (s < 60) return `${s} dtk lalu`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} jam lalu`;
  return `${Math.round(h / 24)} hari lalu`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Device-local clock time; HH.mm.ss as written in Indonesian. */
export function formatClock(ms: number, withSeconds = true): string {
  const d = new Date(ms);
  const base = `${pad(d.getHours())}.${pad(d.getMinutes())}`;
  return withSeconds ? `${base}.${pad(d.getSeconds())}` : base;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${formatClock(ms)}`;
}

export const ISSUE_TEXT: Record<string, string> = {
  missing: 'Tidak dikirim perangkat',
  null: 'Nilai kosong dari perangkat',
  not_a_number: 'Nilai bukan angka',
  out_of_range: 'Di luar rentang wajar, dibuang',
};
