import { describe, expect, it } from 'vitest';
import { SYSTEM_INSTRUCTION, buildUserTurn, type SensorSnapshot } from '../src/assistant/prompt.js';
import { SensorStore } from '../src/sensors/store.js';
import { VALID_PAYLOAD } from './helpers.js';

function snapshotAt(ageMs: number, payload: object = VALID_PAYLOAD): SensorSnapshot {
  const clock = { t: Date.UTC(2026, 9, 23, 3, 0, 0) };
  const store = new SensorStore({ staleAfterMs: 20_000, historyMs: 3_600_000, now: () => clock.t });
  store.ingest(JSON.stringify(payload));
  clock.t += ageMs;
  return { latest: store.getLatest(), freshness: store.freshness(), recent: store.getHistory(1_800_000), brokerConnected: true };
}

describe('AI request construction', () => {
  it('includes measured values, units, timestamp, profile and question', () => {
    const turn = buildUserTurn('Bagaimana kondisi greenhouse saya?', snapshotAt(3000), { species: 'Selada', growthStage: 'vegetatif' });
    expect(turn).toContain('Status data: SEGAR');
    expect(turn).toContain('[TDS]: 812.40 ppm');
    expect(turn).toContain('[pH]: 6.21');
    expect(turn).toContain('[env_temp_c]: 29.80 °C');
    expect(turn).toContain('10.00.00 WIB');
    expect(turn).toContain('Jenis tanaman: Selada');
    expect(turn).toContain('Media tanam / sistem nutrisi: belum diisi');
    expect(turn.trim().endsWith('Bagaimana kondisi greenhouse saya?')).toBe(true);
    // Mirror fields are explained, not listed as separate sensors.
    expect(turn).not.toContain('[temperature]');
  });

  it('marks missing sensors as unavailable instead of zero', () => {
    const { pH, ...rest } = VALID_PAYLOAD;
    const turn = buildUserTurn('cek pH', snapshotAt(3000, rest));
    expect(turn).toContain('[pH]: TIDAK TERSEDIA (field tidak dikirim)');
  });

  it('flags stale data and absent data explicitly', () => {
    expect(buildUserTurn('x', snapshotAt(120_000))).toContain('Status data: BASI');
    const empty: SensorSnapshot = {
      latest: null,
      freshness: { state: 'none', ageMs: null, staleAfterMs: 20_000 },
      recent: [],
      brokerConnected: false,
    };
    const turn = buildUserTurn('x', empty);
    expect(turn).toContain('Status data: TIDAK ADA');
    expect(turn).toContain('Broker MQTT: TIDAK terhubung');
  });

  it('system instruction forbids actuation and disease diagnosis from env data', () => {
    expect(SYSTEM_INSTRUCTION).toMatch(/TIDAK dapat dan TIDAK BOLEH mengendalikan relay/);
    expect(SYSTEM_INSTRUCTION).toMatch(/Jangan mendiagnosis penyakit/);
  });
});

describe('context bounding and trends', () => {
  function storeWithReadings(count: number, everyMs: number) {
    const clock = { t: Date.UTC(2026, 9, 25, 0, 0, 0) };
    const store = new SensorStore({ staleAfterMs: 20_000, historyMs: 24 * 3_600_000, now: () => clock.t });
    for (let i = 0; i < count; i++) {
      store.ingest(JSON.stringify({ ...VALID_PAYLOAD, env_temp_c: 25 + i * 0.01, temperature: 25 + i * 0.01 }));
      clock.t += everyMs;
    }
    clock.t -= everyMs - 2000;
    return store;
  }

  it('summarises a long history instead of sending raw readings', () => {
    const store = storeWithReadings(4000, 5000); // ~5.5 hours at the firmware's 5 s interval
    const snap: SensorSnapshot = {
      latest: store.getLatest(), freshness: store.freshness(), recent: store.getHistory(1_800_000),
      longer: store.getHistory(6 * 3_600_000), brokerConnected: true,
    };
    const turn = buildUserTurn('bagaimana tren suhu hari ini?', snap);
    expect(turn).toContain('Ringkasan 30 menit terakhir:');
    expect(turn).toContain('Ringkasan 6 jam terakhir:');
    expect(turn).toContain('Suhu udara: min 25, maks 64.99');
    // Bounded: a few KB regardless of how many readings exist.
    expect(turn.length).toBeLessThan(6000);
  });

  it('omits the long window when it adds nothing over the short one', () => {
    const turn = buildUserTurn('x', { ...snapshotAt(3000), longer: snapshotAt(3000).recent });
    expect(turn).not.toContain('Ringkasan 6 jam terakhir');
    expect(turn).toContain('Riwayat 30 menit terakhir tidak cukup');
  });
});

describe('system instruction', () => {
  it('defines Panion as an operations assistant with honest-data and relay rules', () => {
    expect(SYSTEM_INSTRUCTION).toContain('Panion');
    expect(SYSTEM_INSTRUCTION).toMatch(/Bedakan dengan tegas FAKTA TERUKUR/);
    expect(SYSTEM_INSTRUCTION).toMatch(/BUKAN bukti relay berubah/);
    expect(SYSTEM_INSTRUCTION).toMatch(/Jangan menciptakan topik, perintah, atau field baru/);
    expect(SYSTEM_INSTRUCTION).toMatch(/TIDAK memiliki sensor kelembapan tanah/);
    expect(SYSTEM_INSTRUCTION).toMatch(/Pertanyaan lanjutan/);
    expect(SYSTEM_INSTRUCTION).toMatch(/### Penilaian/);
    expect(SYSTEM_INSTRUCTION).toMatch(/Jangan memakai tabel/);
  });
});
