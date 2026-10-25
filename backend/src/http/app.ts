import express, { type NextFunction, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { AssistantError, NO_SPEECH, type Assistant } from '../assistant/gemini.js';
import { normalizeHistory, type HistoryLimits } from '../assistant/history.js';
import { buildUserTurn, type SensorSnapshot } from '../assistant/prompt.js';
import { logger } from '../logger.js';
import type { BrokerStatus } from '../mqtt/gateway.js';
import { RelayError, RelayService, RELAY_COMMANDS, isRelayAction, isRelayId } from '../relays/relays.js';
import { FIELD_META, PRIMARY_FIELDS } from '../sensors/schema.js';
import type { SensorStore } from '../sensors/store.js';

export interface AppDeps {
  accessToken: string;
  store: SensorStore;
  relays: RelayService;
  assistant: Assistant;
  brokerStatus: () => BrokerStatus;
  topics: { sensor: string; relay: string };
  history?: HistoryLimits;
  now?: () => number;
}

const MAX_HISTORY_POINTS = 500;
const RECENT_CONTEXT_MS = 30 * 60 * 1000;
const LONG_CONTEXT_MS = 6 * 60 * 60 * 1000;
const MAX_MESSAGE_CHARS = 2000;
const DEFAULT_HISTORY: HistoryLimits = { maxTurns: 12, maxChars: 16000 };
const AUDIO_MIME = ['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/3gpp', 'audio/ogg'];

const chatSchema = z.object({
  message: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
  // Entries are validated and trimmed by normalizeHistory; bad entries are dropped, not fatal.
  history: z.array(z.unknown()).max(100).default([]),
  profile: z
    .object({
      species: z.string().max(120).optional(),
      growthStage: z.string().max(120).optional(),
      medium: z.string().max(200).optional(),
      notes: z.string().max(500).optional(),
    })
    .optional(),
});

const transcribeSchema = z.object({
  audioBase64: z.string().min(100).max(6_000_000),
  mimeType: z.enum(AUDIO_MIME as [string, ...string[]]),
});

function tokenMatches(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function assistantFailure(res: Response, err: AssistantError) {
  res.status(err.httpStatus).json({
    error: err.code,
    message: err.message,
    retryable: err.retryable,
    retryAfterSec: err.retryAfterMs ? Math.ceil(err.retryAfterMs / 1000) : null,
  });
}

function limiter(limit: number, windowMs = 60_000) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'rate_limited', message: 'Terlalu banyak permintaan. Coba lagi sebentar lagi.' },
  });
}

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  // Requests may arrive through a local tunnel agent (ngrok / cloudflared).
  app.set('trust proxy', 'loopback');

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const header = req.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token || !tokenMatches(token, deps.accessToken)) {
      res.status(401).json({ error: 'unauthorized', message: 'Token akses tidak valid.' });
      return;
    }
    next();
  });
  app.use('/api', limiter(300));

  const historyLimits = deps.history ?? DEFAULT_HISTORY;

  // Built per request from live state; nothing conversation-specific is stored server-side.
  const snapshot = (): SensorSnapshot => {
    const broker = deps.brokerStatus();
    return {
      latest: deps.store.getLatest(),
      freshness: deps.store.freshness(),
      recent: deps.store.getHistory(RECENT_CONTEXT_MS),
      longer: deps.store.getHistory(LONG_CONTEXT_MS),
      brokerConnected: broker.connected,
      broker,
      relays: deps.relays.snapshot(),
      ingest: { counters: deps.store.counters, lastRejection: deps.store.lastRejection },
      topics: deps.topics,
    };
  };

  app.get('/api/status', (_req, res) => {
    const latest = deps.store.getLatest();
    const freshness = deps.store.freshness();
    res.json({
      serverTime: Date.now(),
      broker: deps.brokerStatus(),
      data: {
        ...freshness,
        lastReceivedAt: latest?.receivedAt ?? null,
        counters: deps.store.counters,
        lastRejection: deps.store.lastRejection,
      },
      relays: deps.relays.snapshot(),
      relayStateReporting: false,
      assistant: { configured: deps.assistant.isConfigured(), model: deps.assistant.model },
      topics: deps.topics,
    });
  });

  app.get('/api/sensors/latest', (_req, res) => {
    res.json({
      serverTime: Date.now(),
      reading: deps.store.getLatest(),
      freshness: deps.store.freshness(),
      fields: PRIMARY_FIELDS.map((key) => ({ key, ...FIELD_META[key] })),
    });
  });

  app.get('/api/sensors/history', (req, res) => {
    const minutes = Math.min(Math.max(Number(req.query.minutes) || 60, 1), 24 * 60);
    let readings = deps.store.getHistory(minutes * 60_000);
    if (readings.length > MAX_HISTORY_POINTS) {
      const step = Math.ceil(readings.length / MAX_HISTORY_POINTS);
      readings = readings.filter((_, i) => i % step === 0 || i === readings.length - 1);
    }
    res.json({
      serverTime: Date.now(),
      minutes,
      readings: readings.map((r) => ({ t: r.receivedAt, v: r.values })),
    });
  });

  app.post('/api/relays/:relay', limiter(20), express.json({ limit: '1kb' }), async (req, res) => {
    const relay = req.params.relay;
    const action = req.body?.action;
    if (!isRelayId(relay)) {
      res.status(400).json({ error: 'invalid_relay', message: `Relay tidak dikenal. Pilihan: ${Object.keys(RELAY_COMMANDS).join(', ')}.` });
      return;
    }
    if (!isRelayAction(action)) {
      res.status(400).json({ error: 'invalid_action', message: 'Aksi harus "on" atau "off".' });
      return;
    }
    try {
      const record = await deps.relays.send(relay, action);
      res.json({ record });
    } catch (err) {
      if (err instanceof RelayError) {
        res.status(err.httpStatus).json({ error: err.code, message: err.message, record: (err as RelayError & { record?: unknown }).record ?? null });
        return;
      }
      throw err;
    }
  });

  app.post('/api/assistant/chat', limiter(15), express.json({ limit: '128kb' }), async (req, res) => {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      const tooLong = typeof req.body?.message === 'string' && req.body.message.trim().length > MAX_MESSAGE_CHARS;
      res.status(400).json({
        error: 'invalid_request',
        message: tooLong ? `Pertanyaan terlalu panjang (maks ${MAX_MESSAGE_CHARS} karakter).` : 'Pertanyaan kosong atau format permintaan tidak valid.',
      });
      return;
    }
    const { message, profile } = parsed.data;
    const history = normalizeHistory(parsed.data.history, historyLimits);
    const snap = snapshot();
    try {
      const reply = await deps.assistant.answer(buildUserTurn(message, snap, profile, deps.now?.()), history);
      res.json({
        reply: reply.text,
        model: reply.model,
        truncated: reply.truncated,
        context: {
          attached: true,
          dataState: snap.freshness.state,
          readingAt: snap.latest?.receivedAt ?? null,
          recentCount: snap.recent.length,
          historyUsed: history.length,
        },
      });
    } catch (err) {
      if (err instanceof AssistantError) {
        assistantFailure(res, err);
        return;
      }
      throw err;
    }
  });

  app.post('/api/assistant/transcribe', limiter(15), express.json({ limit: '8mb' }), async (req, res) => {
    const parsed = transcribeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_audio', message: 'Rekaman tidak valid atau terlalu besar (maks ~4 MB).' });
      return;
    }
    try {
      const text = await deps.assistant.transcribe(parsed.data.audioBase64, parsed.data.mimeType);
      if (!text || text.includes(NO_SPEECH)) {
        res.status(422).json({ error: 'no_speech', message: 'Suara tidak terdengar jelas. Coba bicara lebih dekat ke mikrofon.' });
        return;
      }
      res.json({ text });
    } catch (err) {
      if (err instanceof AssistantError) {
        assistantFailure(res, err);
        return;
      }
      throw err;
    }
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  app.use((err: Error & { type?: string; status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    if (err.type === 'entity.too.large') {
      res.status(413).json({ error: 'too_large', message: 'Permintaan terlalu besar. Persingkat pertanyaan atau mulai percakapan baru.' });
      return;
    }
    if (err.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'bad_body', message: 'Isi permintaan tidak valid.' });
      return;
    }
    logger.error('unhandled request error', { error: err.message });
    res.status(500).json({ error: 'internal', message: 'Terjadi galat di server.' });
  });

  return app;
}
