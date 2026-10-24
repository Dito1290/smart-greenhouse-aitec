import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { logger } from '../logger.js';
import { parseSensorPayload, type ParseResult, type SensorValues } from './schema.js';

export interface Reading {
  receivedAt: number;
  values: SensorValues;
  issues: ParseResult['issues'];
  mirrorMismatch: ParseResult['mirrorMismatch'];
}

export type Freshness = 'none' | 'fresh' | 'stale';

export interface IngestOutcome {
  accepted: boolean;
  reason?: 'duplicate' | 'invalid_json' | 'not_an_object' | 'no_valid_fields';
}

const DUPLICATE_WINDOW_MS = 1500;

export class SensorStore {
  private latest: Reading | null = null;
  private history: Reading[] = [];
  private lastRaw = '';
  private lastRawAt = 0;
  readonly counters = { accepted: 0, duplicates: 0, rejected: 0 };
  lastRejection: { at: number; reason: string } | null = null;

  constructor(
    private readonly opts: { staleAfterMs: number; historyMs: number; now?: () => number },
  ) {}

  private now() {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  ingest(raw: string | Buffer): IngestOutcome {
    const text = raw.toString();
    const now = this.now();
    // QoS1 redeliveries / double publishes arrive as identical payloads back to back.
    if (text === this.lastRaw && now - this.lastRawAt < DUPLICATE_WINDOW_MS) {
      this.counters.duplicates++;
      return { accepted: false, reason: 'duplicate' };
    }
    this.lastRaw = text;
    this.lastRawAt = now;

    const parsed = parseSensorPayload(text);
    if (!parsed.ok) {
      this.counters.rejected++;
      this.lastRejection = { at: now, reason: parsed.error ?? 'unknown' };
      return { accepted: false, reason: parsed.error as IngestOutcome['reason'] };
    }

    const reading: Reading = {
      receivedAt: now,
      values: parsed.values,
      issues: parsed.issues,
      mirrorMismatch: parsed.mirrorMismatch,
    };
    // Timestamps are assigned on arrival (firmware sends none), so arrival order is the
    // only ordering we have; never let an older timestamp replace the latest one.
    if (!this.latest || reading.receivedAt >= this.latest.receivedAt) this.latest = reading;
    this.history.push(reading);
    this.prune(now);
    this.counters.accepted++;
    return { accepted: true };
  }

  private prune(now: number) {
    const cutoff = now - this.opts.historyMs;
    let i = 0;
    while (i < this.history.length && this.history[i].receivedAt < cutoff) i++;
    if (i > 0) this.history.splice(0, i);
  }

  getLatest(): Reading | null {
    return this.latest;
  }

  freshness(): { state: Freshness; ageMs: number | null; staleAfterMs: number } {
    if (!this.latest) return { state: 'none', ageMs: null, staleAfterMs: this.opts.staleAfterMs };
    const ageMs = Math.max(0, this.now() - this.latest.receivedAt);
    return {
      state: ageMs > this.opts.staleAfterMs ? 'stale' : 'fresh',
      ageMs,
      staleAfterMs: this.opts.staleAfterMs,
    };
  }

  getHistory(sinceMs: number): Reading[] {
    const cutoff = this.now() - sinceMs;
    return this.history.filter((r) => r.receivedAt >= cutoff);
  }

  async save(file: string) {
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify({ version: 1, history: this.history }));
    await rename(tmp, file);
  }

  async load(file: string) {
    try {
      const data = JSON.parse(await readFile(file, 'utf8'));
      if (data?.version !== 1 || !Array.isArray(data.history)) return;
      const now = this.now();
      this.history = (data.history as Reading[]).filter(
        (r) => typeof r?.receivedAt === 'number' && r.receivedAt <= now && r.values && typeof r.values === 'object',
      );
      this.prune(now);
      this.latest = this.history.at(-1) ?? null;
      logger.info('history loaded', { readings: this.history.length });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn('history file unreadable, starting empty', { error: (err as Error).message });
      }
    }
  }
}
