import { FIRMWARE_TDS_BAND, PRIMARY_FIELDS } from './fields';
import { formatAge } from './format';
import type { Tone } from './theme';
import type { Freshness, Reading } from './types';

export interface SummaryItem {
  tone: Tone;
  text: string;
}

export interface Summary {
  headline: string;
  tone: Tone;
  items: SummaryItem[];
}

/**
 * Data-quality summary only. Agronomic judgement is left to the assistant, which
 * gets crop profile context; here we report facts the system can stand behind.
 */
export function summarize(input: {
  backendReachable: boolean | null;
  brokerConnected: boolean | null;
  dataState: Freshness;
  dataAgeMs: number | null;
  reading: Reading | null;
}): Summary {
  const { backendReachable, brokerConnected, dataState, dataAgeMs, reading } = input;
  const items: SummaryItem[] = [];

  if (backendReachable === false) {
    items.push({ tone: 'danger', text: 'Server aplikasi tidak terjangkau. Angka yang tampil adalah data terakhir yang diterima.' });
  }
  if (brokerConnected === false) {
    items.push({ tone: 'danger', text: 'Server terputus dari broker MQTT; data baru tidak masuk dan kontrol relay tidak tersedia.' });
  }

  if (dataState === 'none' || !reading) {
    return {
      headline: backendReachable === null ? 'Memuat data greenhouse…' : 'Belum ada data sensor',
      tone: 'neutral',
      items: [...items, { tone: 'neutral', text: 'Kondisi greenhouse belum dapat dinilai sampai perangkat mengirim data.' }],
    };
  }

  if (dataState === 'stale') {
    items.push({ tone: 'warn', text: `Data terakhir ${formatAge(dataAgeMs)}. Kondisi saat ini tidak diketahui.` });
  }

  const available = PRIMARY_FIELDS.filter((f) => reading.values[f.key] !== null);
  const missing = PRIMARY_FIELDS.filter((f) => reading.values[f.key] === null);
  if (missing.length) {
    items.push({ tone: 'warn', text: `${missing.length} sensor tidak terbaca: ${missing.map((f) => f.label).join(', ')}.` });
  }
  if (reading.mirrorMismatch.length) {
    items.push({ tone: 'warn', text: 'Nilai suhu/kelembapan salinan tidak sama dengan sumbernya — firmware mungkin berubah.' });
  }

  const tds = reading.values.TDS;
  if (tds !== null && dataState === 'fresh') {
    const { low, high } = FIRMWARE_TDS_BAND;
    if (tds < low) {
      items.push({ tone: 'info', text: `TDS ${Math.round(tds)} ppm di bawah pita otomasi firmware (${low}–${high}). Otomasi pupuk ESP32 seharusnya bekerja; pantau apakah TDS naik.` });
    } else if (tds > high) {
      items.push({ tone: 'info', text: `TDS ${Math.round(tds)} ppm di atas pita otomasi firmware (${low}–${high}). Firmware tidak menurunkan TDS secara otomatis.` });
    } else {
      items.push({ tone: 'good', text: `TDS dalam pita otomasi firmware (${low}–${high} ppm).` });
    }
  }

  const tone: Tone = items.some((i) => i.tone === 'danger') ? 'danger' : items.some((i) => i.tone === 'warn') ? 'warn' : 'good';
  const headline =
    dataState === 'stale'
      ? 'Data sensor basi'
      : `${available.length} dari ${PRIMARY_FIELDS.length} sensor terbaca`;
  return { headline, tone, items };
}
