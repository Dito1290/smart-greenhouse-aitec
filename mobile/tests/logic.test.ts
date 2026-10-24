import { describe, expect, it } from 'vitest';
import { formatAge, formatValue } from '../src/format';
import { summarize } from '../src/summary';
import type { Reading } from '../src/types';
import { chunkForSpeech, cleanForSpeech } from '../src/voice';

const reading = (over: Partial<Reading['values']> = {}): Reading => ({
  receivedAt: 1,
  values: {
    TDS: 800, pH: 6.2, temperature: 29, humidity: 70, env_temp_c: 29, env_humidity: 70,
    uv_intensity: 0.4, luminous_intensity: 15000, atmosphere_pressure: 1008, ...over,
  },
  issues: {},
  mirrorMismatch: [],
});

describe('dashboard summary', () => {
  it('does not claim a healthy state without data', () => {
    const s = summarize({ backendReachable: true, brokerConnected: true, dataState: 'none', dataAgeMs: null, reading: null });
    expect(s.tone).toBe('neutral');
    expect(s.headline).toBe('Belum ada data sensor');
  });

  it('marks stale data and does not judge TDS from it', () => {
    const s = summarize({ backendReachable: true, brokerConnected: true, dataState: 'stale', dataAgeMs: 120000, reading: reading({ TDS: 500 }) });
    expect(s.headline).toBe('Data sensor basi');
    expect(s.tone).toBe('warn');
    expect(s.items.some((i) => i.text.includes('TDS'))).toBe(false);
  });

  it('lists unavailable sensors instead of treating them as zero', () => {
    const s = summarize({ backendReachable: true, brokerConnected: true, dataState: 'fresh', dataAgeMs: 2000, reading: reading({ pH: null }) });
    expect(s.headline).toBe('6 dari 7 sensor terbaca');
    expect(s.items[0].text).toContain('pH larutan');
  });

  it('reports server and broker outages as danger', () => {
    const s = summarize({ backendReachable: false, brokerConnected: false, dataState: 'stale', dataAgeMs: 90000, reading: reading() });
    expect(s.tone).toBe('danger');
  });

  it('describes TDS relative to the firmware band, not an agronomic threshold', () => {
    const s = summarize({ backendReachable: true, brokerConnected: true, dataState: 'fresh', dataAgeMs: 1000, reading: reading({ TDS: 700 }) });
    expect(s.items.find((i) => i.text.includes('TDS'))?.text).toMatch(/pita otomasi firmware/);
  });
});

describe('formatting', () => {
  it('renders missing values as a dash, not zero', () => {
    expect(formatValue('TDS', null)).toBe('—');
    expect(formatAge(null)).toBe('belum ada');
    expect(formatAge(42_000)).toBe('42 dtk lalu');
  });
});

describe('speech helpers', () => {
  it('strips markdown before speaking', () => {
    expect(cleanForSpeech('**1. Penilaian umum:** Normal\n- Suhu 29 °C')).toBe('1. Penilaian umum: Normal\nSuhu 29  derajat Celsius'.replace('  ', ' '));
  });

  it('splits long answers into chunks under the platform limit', () => {
    const text = Array.from({ length: 200 }, (_, i) => `Kalimat nomor ${i} cukup panjang.`).join(' ');
    const chunks = chunkForSpeech(text, 500);
    expect(chunks.every((c) => c.length <= 500)).toBe(true);
    expect(chunks.join(' ')).toBe(text);
  });
});
