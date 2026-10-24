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
