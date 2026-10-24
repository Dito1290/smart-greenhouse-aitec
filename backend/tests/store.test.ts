import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SensorStore } from '../src/sensors/store.js';
import { VALID_PAYLOAD } from './helpers.js';

function makeStore() {
  const clock = { t: 1_000_000 };
  const store = new SensorStore({ staleAfterMs: 20_000, historyMs: 3_600_000, now: () => clock.t });
  return { store, clock };
}

describe('SensorStore', () => {
  it('reports none, fresh, then stale', () => {
    const { store, clock } = makeStore();
    expect(store.freshness().state).toBe('none');
    store.ingest(JSON.stringify(VALID_PAYLOAD));
    expect(store.freshness().state).toBe('fresh');
    clock.t += 21_000;
    expect(store.freshness()).toMatchObject({ state: 'stale', ageMs: 21_000 });
  });

  it('drops back-to-back duplicates but accepts the same values later', () => {
    const { store, clock } = makeStore();
    const raw = JSON.stringify(VALID_PAYLOAD);
    expect(store.ingest(raw).accepted).toBe(true);
    clock.t += 200;
    expect(store.ingest(raw)).toEqual({ accepted: false, reason: 'duplicate' });
    clock.t += 5000;
    expect(store.ingest(raw).accepted).toBe(true);
    expect(store.counters).toMatchObject({ accepted: 2, duplicates: 1 });
  });

  it('keeps the last valid reading when a malformed message arrives', () => {
    const { store, clock } = makeStore();
    store.ingest(JSON.stringify(VALID_PAYLOAD));
    clock.t += 5000;
    expect(store.ingest('garbage').accepted).toBe(false);
    expect(store.getLatest()?.values.TDS).toBe(812.4);
    expect(store.lastRejection?.reason).toBe('invalid_json');
  });

  it('prunes history beyond the window and round-trips to disk', async () => {
    const { store, clock } = makeStore();
    store.ingest(JSON.stringify(VALID_PAYLOAD));
    clock.t += 3_000_000;
    store.ingest(JSON.stringify({ ...VALID_PAYLOAD, TDS: 790 }));
    clock.t += 1_000_000;
    store.ingest(JSON.stringify({ ...VALID_PAYLOAD, TDS: 760 }));
    expect(store.getHistory(3_600_000).map((r) => r.values.TDS)).toEqual([790, 760]);

    const file = join(await mkdtemp(join(tmpdir(), 'gh-')), 'history.json');
    await store.save(file);
    const copy = new SensorStore({ staleAfterMs: 20_000, historyMs: 3_600_000, now: () => clock.t });
    await copy.load(file);
    expect(copy.getLatest()?.values.TDS).toBe(760);
    expect(copy.getHistory(3_600_000)).toHaveLength(2);
  });
});
