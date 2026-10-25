import { ApiError, GoogleGenAI, ThinkingLevel, type GenerateContentParameters, type GenerateContentResponse } from '@google/genai';
import { logger, redact } from '../logger.js';
import { SYSTEM_INSTRUCTION } from './prompt.js';

export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

export interface AssistantReply {
  text: string;
  /** Model that actually produced the text (may be the fallback model). */
  model: string;
  attempts: number;
  /** Generation stopped at the output-token limit; the answer may be cut off. */
  truncated: boolean;
}

export interface Assistant {
  readonly model: string;
  isConfigured(): boolean;
  answer(userTurn: string, history: ChatTurn[]): Promise<AssistantReply>;
  transcribe(audioBase64: string, mimeType: string): Promise<string>;
}

export type AssistantErrorCode =
  | 'not_configured'
  | 'unavailable'
  | 'rate_limited'
  | 'quota_exhausted'
  | 'timeout'
  | 'network'
  | 'auth'
  | 'model_config'
  | 'bad_request'
  | 'blocked'
  | 'empty'
  | 'upstream';

export class AssistantError extends Error {
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;
  constructor(
    readonly code: AssistantErrorCode,
    readonly httpStatus: number,
    message: string,
    extra: { retryable?: boolean; retryAfterMs?: number | null } = {},
  ) {
    super(message);
    this.retryable = extra.retryable ?? false;
    this.retryAfterMs = extra.retryAfterMs ?? null;
  }
}

export const NO_SPEECH = '[TIDAK_TERDENGAR]';

// ---------------------------------------------------------------------------
// Failure classification
// ---------------------------------------------------------------------------

export type FailureKind = 'unavailable' | 'rate_limited' | 'quota_exhausted' | 'timeout' | 'network' | 'auth' | 'model_config' | 'bad_request' | 'upstream';

export interface FailureInfo {
  kind: FailureKind;
  /** Worth retrying: the same request may succeed later. */
  transient: boolean;
  /** Upstream HTTP status, when the API answered. */
  status?: number;
  /** Google RPC status string, e.g. UNAVAILABLE, RESOURCE_EXHAUSTED. */
  reason?: string;
  retryAfterMs?: number;
  /** Short, redacted upstream message for logs only. */
  detail?: string;
}

interface GoogleErrorBody {
  error?: { code?: number; message?: string; status?: string; details?: Record<string, unknown>[] };
}

function parseBody(message: string): GoogleErrorBody['error'] {
  try {
    return (JSON.parse(message) as GoogleErrorBody).error;
  } catch {
    return undefined;
  }
}

/** google.rpc.RetryInfo.retryDelay is a protobuf Duration string such as "12s" or "0.5s". */
function retryDelayFrom(details: Record<string, unknown>[] | undefined): number | undefined {
  const info = details?.find((d) => String(d['@type'] ?? '').endsWith('RetryInfo'));
  const m = typeof info?.retryDelay === 'string' ? /^(\d+(?:\.\d+)?)s$/.exec(info.retryDelay) : null;
  return m ? Math.round(Number(m[1]) * 1000) : undefined;
}

function isDailyQuota(details: Record<string, unknown>[] | undefined): boolean {
  return !!details?.some((d) =>
    String(d['@type'] ?? '').endsWith('QuotaFailure') &&
    Array.isArray(d.violations) &&
    (d.violations as { quotaId?: string }[]).some((v) => /PerDay/i.test(v.quotaId ?? '')),
  );
}

/** Parses an HTTP Retry-After value (delta-seconds or HTTP-date). */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value.trim())) return Number(value.trim()) * 1000;
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

const NETWORK_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'ENETUNREACH', 'EHOSTUNREACH']);

export function classifyFailure(err: unknown, retryAfterHeaderMs?: number): FailureInfo {
  if (err instanceof ApiError) {
    const body = parseBody(err.message);
    const status = err.status;
    const reason = body?.status;
    const retryAfterMs = retryAfterHeaderMs ?? retryDelayFrom(body?.details);
    const text = body?.message ?? '';
    const base = { status, reason, retryAfterMs, detail: redact(text).slice(0, 200) };
    // Gemini answers an invalid key with 400 INVALID_ARGUMENT, not 401.
    if (status === 401 || status === 403 || /api key/i.test(text)) return { ...base, kind: 'auth', transient: false };
    if (status === 402) return { ...base, kind: 'quota_exhausted', transient: false };
    if (status === 404) return { ...base, kind: 'model_config', transient: false };
    if (status === 408) return { ...base, kind: 'timeout', transient: true };
    if (status === 429) {
      return isDailyQuota(body?.details) ? { ...base, kind: 'quota_exhausted', transient: false } : { ...base, kind: 'rate_limited', transient: true };
    }
    if (status === 504) return { ...base, kind: 'timeout', transient: true };
    if (status >= 500) return { ...base, kind: 'unavailable', transient: true };
    if (status === 400 && /model|thinking/i.test(text)) return { ...base, kind: 'model_config', transient: false };
    return { ...base, kind: 'bad_request', transient: false };
  }
  const e = err as (Error & { code?: string; cause?: { code?: string } }) | undefined;
  const msg = e?.message ?? '';
  if (e?.name === 'AbortError' || e?.name === 'TimeoutError' || /timeout|timed out|aborted/i.test(msg)) {
    return { kind: 'timeout', transient: true, detail: msg.slice(0, 120) };
  }
  const code = e?.code ?? e?.cause?.code;
  if ((code && (NETWORK_CODES.has(code) || code.startsWith('UND_ERR'))) || /fetch failed|network|socket/i.test(msg)) {
    return { kind: 'network', transient: true, detail: redact(`${code ?? ''} ${msg}`.trim()).slice(0, 120) };
  }
  return { kind: 'upstream', transient: false, detail: redact(msg).slice(0, 200) };
}

function humanWait(ms: number): string {
  const s = Math.max(1, Math.ceil(ms / 1000));
  if (s < 120) return `±${s} detik`;
  if (s < 7200) return `±${Math.round(s / 60)} menit`;
  return `±${Math.round(s / 3600)} jam`;
}

function toAssistantError(info: FailureInfo, model: string, attempts: number): AssistantError {
  const later = info.retryAfterMs ? `Coba lagi dalam ${humanWait(info.retryAfterMs)}.` : 'Coba lagi sebentar lagi.';
  const tried = attempts > 1 ? ` Server sudah mencoba ${attempts} kali.` : '';
  const extra = { retryable: info.transient, retryAfterMs: info.retryAfterMs ?? null };
  switch (info.kind) {
    case 'unavailable':
      return new AssistantError('unavailable', 503, `Layanan Gemini sedang sibuk atau tidak tersedia sementara (HTTP ${info.status ?? '5xx'}).${tried} ${later}`, extra);
    case 'rate_limited':
      return new AssistantError('rate_limited', 429, `Batas permintaan Gemini sedang tercapai.${tried} ${later}`, extra);
    case 'quota_exhausted':
      return new AssistantError(
        'quota_exhausted',
        429,
        `Kuota Gemini untuk kunci API server sudah habis${info.retryAfterMs ? ` (perkiraan reset dalam ${humanWait(info.retryAfterMs)})` : ''}. Asisten tidak dapat menjawab sampai kuota direset atau ditambah oleh admin server.`,
        extra,
      );
    case 'timeout':
      return new AssistantError('timeout', 504, `Gemini tidak merespons dalam batas waktu.${tried} ${later}`, extra);
    case 'network':
      return new AssistantError('network', 502, `Server tidak dapat terhubung ke layanan Gemini (gangguan jaringan).${tried} ${later}`, extra);
    case 'auth':
      return new AssistantError('auth', 502, 'Kunci API Gemini di server ditolak atau tidak memiliki izin. Admin server perlu memeriksa GEMINI_API_KEY.', extra);
    case 'model_config':
      return new AssistantError('model_config', 502, `Model Gemini "${model}" tidak tersedia atau pengaturannya tidak didukung. Admin server perlu memeriksa GEMINI_MODEL dan GEMINI_THINKING_LEVEL.`, extra);
    case 'bad_request':
      return new AssistantError('bad_request', 502, 'Permintaan ke Gemini ditolak karena formatnya tidak valid. Ini masalah di server, bukan di pertanyaan Anda.', extra);
    default:
      return new AssistantError('upstream', 502, 'Terjadi galat tak terduga saat menghubungi Gemini.', extra);
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface GeminiOptions {
  apiKey: string | undefined;
  model: string;
  fallbackModel?: string;
  /** Per-attempt deadline. */
  timeoutMs: number;
  /** Deadline for every attempt and backoff together. */
  totalTimeoutMs: number;
  /** Retries per model after the first attempt. */
  maxRetries: number;
  thinkingLevel?: ThinkingLevel;
  /** Test seams. */
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
}

const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 8000;
/** Not worth starting an attempt with less time than this left. */
const MIN_ATTEMPT_MS = 3000;
const CHAT_MAX_OUTPUT_TOKENS = 4096; // includes thinking tokens on Gemini 3.x

const BLOCK_REASONS = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION', 'IMAGE_SAFETY']);

export class GeminiAssistant implements Assistant {
  private ai: GoogleGenAI | null;
  readonly model: string;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly now: () => number;

  constructor(private readonly opts: GeminiOptions) {
    this.model = opts.model;
    // Retries are done here, not by the SDK (retryOptions unset), so Retry-After and the overall deadline are honoured.
    this.ai = opts.apiKey ? new GoogleGenAI({ apiKey: opts.apiKey, httpOptions: { timeout: opts.timeoutMs } }) : null;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.random = opts.random ?? Math.random;
    this.now = opts.now ?? Date.now;
  }

  isConfigured() {
    return this.ai !== null;
  }

  private client(): GoogleGenAI {
    if (!this.ai) throw new AssistantError('not_configured', 503, 'Asisten AI belum dikonfigurasi di server (GEMINI_API_KEY kosong).');
    return this.ai;
  }

  /** Exponential backoff with equal jitter; never shorter than the server-requested delay. */
  private backoff(retry: number, retryAfterMs?: number) {
    const exp = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** retry);
    const jittered = exp / 2 + this.random() * (exp / 2);
    return Math.round(Math.max(jittered, retryAfterMs ?? 0));
  }

  private async generate(op: 'chat' | 'transcribe', request: (model: string) => GenerateContentParameters) {
    const ai = this.client();
    const started = this.now();
    const deadline = started + this.opts.totalTimeoutMs;
    const models = [this.model, this.opts.fallbackModel].filter((m, i, all): m is string => !!m && all.indexOf(m) === i);
    const baseFetch = this.opts.fetch ?? globalThis.fetch;
    let attempts = 0;
    let last: { info: FailureInfo; model: string } | null = null;

    for (const model of models) {
      for (let retry = 0; retry <= this.opts.maxRetries; retry++) {
        const remaining = deadline - this.now();
        if (remaining < MIN_ATTEMPT_MS) break;
        attempts++;
        // Per-attempt fetch wrapper: captures Retry-After without sharing state between concurrent requests.
        let retryAfterHeaderMs: number | undefined;
        const fetchImpl: typeof fetch = async (input, init) => {
          const res = await baseFetch(input, init);
          if (!res.ok) retryAfterHeaderMs = parseRetryAfter(res.headers.get('retry-after'));
          return res;
        };
        const req = request(model);
        try {
          const res = await ai.models.generateContent({
            ...req,
            config: { ...req.config, httpOptions: { timeout: Math.min(this.opts.timeoutMs, remaining), fetch: fetchImpl } },
          });
          if (attempts > 1 || model !== this.model) {
            logger.info('gemini recovered', { op, model, attempts, elapsedMs: this.now() - started });
          }
          return { res, model, attempts, elapsedMs: this.now() - started };
        } catch (err) {
          if (err instanceof AssistantError) throw err;
          const info = classifyFailure(err, retryAfterHeaderMs);
          last = { info, model };
          const canRetry = info.transient && retry < this.opts.maxRetries;
          const delay = canRetry ? this.backoff(retry, info.retryAfterMs) : 0;
          const fits = canRetry && this.now() + delay + MIN_ATTEMPT_MS <= deadline;
          logger.warn('gemini attempt failed', {
            op, model, attempt: attempts, status: info.status, reason: info.reason, kind: info.kind,
            transient: info.transient, retryInMs: fits ? delay : null, elapsedMs: this.now() - started,
            ...(info.transient ? {} : { detail: info.detail }),
          });
          // Free-tier daily quotas are per model, so an exhausted quota still lets the fallback model answer.
          if (info.kind === 'quota_exhausted' && model !== models.at(-1)) break;
          if (!info.transient) throw toAssistantError(info, model, attempts);
          if (!fits) break; // move on to the fallback model, if any
          await this.sleep(delay);
        }
      }
    }

    const info = last?.info ?? { kind: 'timeout' as const, transient: true };
    logger.error('gemini request failed', { op, model: last?.model ?? this.model, attempts, kind: info.kind, status: info.status, reason: info.reason, elapsedMs: this.now() - started });
    throw toAssistantError(info, last?.model ?? this.model, attempts);
  }

  async answer(userTurn: string, history: ChatTurn[]): Promise<AssistantReply> {
    const { res, model, attempts, elapsedMs } = await this.generate('chat', (m) => ({
      model: m,
      contents: [
        ...history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
        { role: 'user', parts: [{ text: userTurn }] },
      ],
      // No tools/function declarations: the model has no path to actuators.
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.3,
        maxOutputTokens: CHAT_MAX_OUTPUT_TOKENS,
        // Gemini 3.x thinks at medium/high by default, which made answers slow.
        thinkingConfig: { thinkingLevel: this.opts.thinkingLevel ?? ThinkingLevel.LOW },
      },
    }));
    const finishReason = res.candidates?.[0]?.finishReason;
    const usage = res.usageMetadata;
    logger.info('gemini answered', {
      model, attempts, elapsedMs, finishReason,
      promptTokens: usage?.promptTokenCount, outputTokens: usage?.candidatesTokenCount, thoughtTokens: usage?.thoughtsTokenCount,
    });
    const text = extractText(res);
    if (!text) throw emptyError(res);
    return { text, model, attempts, truncated: finishReason === 'MAX_TOKENS' };
  }

  async transcribe(audioBase64: string, mimeType: string): Promise<string> {
    const { res } = await this.generate('transcribe', (m) => ({
      model: m,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: audioBase64 } },
            {
              text: `Transkripsikan ucapan dalam rekaman ini secara verbatim. Bahasa utama: Indonesia. Tulis hanya teks transkripsinya tanpa komentar, tanda kutip, atau terjemahan. Jika tidak ada ucapan yang jelas, balas persis: ${NO_SPEECH}`,
            },
          ],
        },
      ],
      config: { temperature: 0, maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: this.opts.thinkingLevel ?? ThinkingLevel.LOW } },
    }));
    return extractText(res);
  }
}

function extractText(res: GenerateContentResponse): string {
  try {
    return res.text?.trim() ?? '';
  } catch {
    return '';
  }
}

function emptyError(res: GenerateContentResponse): AssistantError {
  const finish = res.candidates?.[0]?.finishReason;
  if (res.promptFeedback?.blockReason || (finish && BLOCK_REASONS.has(finish))) {
    return new AssistantError('blocked', 422, 'Gemini menolak menjawab pertanyaan ini karena filter keamanannya. Coba ubah kalimat pertanyaan.');
  }
  if (finish === 'MAX_TOKENS') {
    return new AssistantError('empty', 502, 'Gemini kehabisan batas panjang jawaban sebelum selesai. Coba pertanyaan yang lebih spesifik.', { retryable: true });
  }
  return new AssistantError('empty', 502, 'Gemini tidak memberikan jawaban. Coba ulangi pertanyaan.', { retryable: true });
}
