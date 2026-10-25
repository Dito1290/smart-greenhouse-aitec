import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantError, GeminiAssistant, classifyFailure, parseRetryAfter, type GeminiOptions } from '../src/assistant/gemini.js';

// The real @google/genai SDK runs against this fake fetch, so error parsing is exercised end to end.
const FAKE_KEY = 'AIzaFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE123';

type Step =
  | { status: number; body?: unknown; headers?: Record<string, string> }
  | { throws: Error }
  | { hang: true };

const ok = (text: string | null, finishReason = 'STOP') => ({
  status: 200,
  body: {
    candidates: [{ content: { role: 'model', parts: text === null ? [] : [{ text }] }, finishReason }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 3 },
  },
});
const apiErr = (status: number, rpc: string, message: string, details?: unknown[]) => ({
  status,
  body: { error: { code: status, message, status: rpc, ...(details ? { details } : {}) } },
});

function fakeFetch(steps: Step[]) {
  const calls: { url: string; body: any }[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if ('throws' in step) throw step.throws;
    if ('hang' in step) {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })));
      });
    }
    return new Response(JSON.stringify(step.body ?? {}), {
      status: step.status,
      headers: { 'content-type': 'application/json', ...step.headers },
    });
  }) as typeof fetch;
  return { fn, calls };
}

function make(steps: Step[], over: Partial<GeminiOptions> = {}) {
  const f = fakeFetch(steps);
  const sleeps: number[] = [];
  const assistant = new GeminiAssistant({
    apiKey: FAKE_KEY,
    model: 'gemini-3.6-flash',
    timeoutMs: 10_000,
    totalTimeoutMs: 45_000,
    maxRetries: 2,
    fetch: f.fn,
    sleep: async (ms) => void sleeps.push(ms),
    random: () => 0.5,
    ...over,
  });
  return { assistant, calls: f.calls, sleeps };
}

async function failure(p: Promise<unknown>): Promise<AssistantError> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(AssistantError);
    return err as AssistantError;
  }
  throw new Error('expected a failure');
}

let logs: string[];
beforeEach(() => {
  logs = [];
  vi.spyOn(console, 'log').mockImplementation((l: string) => void logs.push(l));
  vi.spyOn(console, 'error').mockImplementation((l: string) => void logs.push(l));
});
afterEach(() => vi.restoreAllMocks());

describe('Gemini success path', () => {
  it('returns the text with model and attempt metadata, sending history and system prompt without tools', async () => {
    const { assistant, calls } = make([ok('Kondisi normal.')]);
    const reply = await assistant.answer('KONTEKS...\nPERTANYAAN OPERATOR:\nhalo', [
      { role: 'user', text: 'tadi' },
      { role: 'model', text: 'jawaban tadi' },
    ]);
    expect(reply).toEqual({ text: 'Kondisi normal.', model: 'gemini-3.6-flash', attempts: 1, truncated: false });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('models/gemini-3.6-flash:generateContent');
    const body = calls[0].body;
    expect(body.contents.map((c: any) => c.role)).toEqual(['user', 'model', 'user']);
    expect(body.systemInstruction.parts[0].text).toContain('Panion');
    expect(body.generationConfig.thinkingConfig.thinkingLevel).toBe('LOW');
    expect(body.tools).toBeUndefined();
  });

  it('flags answers cut off at the token limit', async () => {
    const { assistant } = make([ok('Jawaban terpotong', 'MAX_TOKENS')]);
    expect((await assistant.answer('x', [])).truncated).toBe(true);
  });

  it('reports empty and blocked responses as errors instead of inventing text', async () => {
    let e = await failure(make([ok(null, 'MAX_TOKENS')]).assistant.answer('x', []));
    expect(e.code).toBe('empty');
    e = await failure(make([ok(null, 'SAFETY')]).assistant.answer('x', []));
    expect(e.code).toBe('blocked');
    expect(e.httpStatus).toBe(422);
  });

  it('refuses cleanly when no API key is configured', async () => {
    const e = await failure(make([ok('x')], { apiKey: undefined }).assistant.answer('x', []));
    expect(e).toMatchObject({ code: 'not_configured', httpStatus: 503, retryable: false });
  });
});

describe('Gemini transient failures', () => {
  it('retries HTTP 503 with exponential backoff and jitter, then recovers', async () => {
    const { assistant, calls, sleeps } = make([
      apiErr(503, 'UNAVAILABLE', 'The model is overloaded. Please try again later.'),
      apiErr(503, 'UNAVAILABLE', 'The model is overloaded. Please try again later.'),
      ok('Pulih'),
    ]);
    const reply = await assistant.answer('x', []);
    expect(reply).toMatchObject({ text: 'Pulih', attempts: 3 });
    expect(calls).toHaveLength(3);
    // random()=0.5 → equal jitter gives 75% of 1s, then of 2s.
    expect(sleeps).toEqual([750, 1500]);
  });

  it('jitter stays within [exp/2, exp]', async () => {
    const low = make([apiErr(503, 'UNAVAILABLE', 'x'), ok('a')], { random: () => 0 });
    await low.assistant.answer('x', []);
    const high = make([apiErr(503, 'UNAVAILABLE', 'x'), ok('a')], { random: () => 0.999 });
    await high.assistant.answer('x', []);
    expect(low.sleeps[0]).toBe(500);
    expect(high.sleeps[0]).toBeLessThanOrEqual(1000);
    expect(high.sleeps[0]).toBeGreaterThan(990);
  });

  it('gives up after the bounded number of retries with a structured, retryable 503', async () => {
    const { assistant, calls } = make([apiErr(503, 'UNAVAILABLE', 'overloaded')]);
    const e = await failure(assistant.answer('x', []));
    expect(calls).toHaveLength(3); // 1 + maxRetries
    expect(e).toMatchObject({ code: 'unavailable', httpStatus: 503, retryable: true });
    expect(e.message).toContain('HTTP 503');
    expect(e.message).toContain('3 kali');
  });

  it('honours google.rpc.RetryInfo on HTTP 429', async () => {
    const { assistant, sleeps } = make([
      apiErr(429, 'RESOURCE_EXHAUSTED', 'Rate limit', [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '7s' }]),
      ok('ok'),
    ]);
    await assistant.answer('x', []);
    expect(sleeps).toEqual([7000]);
  });

  it('honours the Retry-After header', async () => {
    const { assistant, sleeps } = make([{ ...apiErr(429, 'RESOURCE_EXHAUSTED', 'slow down'), headers: { 'retry-after': '4' } }, ok('ok')]);
    await assistant.answer('x', []);
    expect(sleeps).toEqual([4000]);
  });

  it('does not wait past the overall deadline when Retry-After is too long', async () => {
    const { assistant, calls, sleeps } = make([{ ...apiErr(429, 'RESOURCE_EXHAUSTED', 'slow down'), headers: { 'retry-after': '120' } }]);
    const e = await failure(assistant.answer('x', []));
    expect(calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
    expect(e).toMatchObject({ code: 'rate_limited', httpStatus: 429, retryable: true, retryAfterMs: 120_000 });
  });

  it('does not retry an exhausted daily quota', async () => {
    const { assistant, calls } = make([
      apiErr(429, 'RESOURCE_EXHAUSTED', 'Quota exceeded', [
        { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] },
      ]),
    ]);
    const e = await failure(assistant.answer('x', []));
    expect(calls).toHaveLength(1);
    expect(e).toMatchObject({ code: 'quota_exhausted', retryable: false });
  });

  it('times out each attempt and reports a timeout after bounded retries', async () => {
    const { assistant, calls } = make([{ hang: true }], { timeoutMs: 30, maxRetries: 1 });
    const e = await failure(assistant.answer('x', []));
    expect(calls).toHaveLength(2);
    expect(e).toMatchObject({ code: 'timeout', httpStatus: 504, retryable: true });
  });

  it('retries network failures and recovers', async () => {
    const netErr = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
    const { assistant, calls } = make([{ throws: netErr }, ok('tersambung')]);
    expect((await assistant.answer('x', [])).text).toBe('tersambung');
    expect(calls).toHaveLength(2);
  });

  it('reports persistent network failure as a retryable network error', async () => {
    const netErr = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    const e = await failure(make([{ throws: netErr }], { maxRetries: 1 }).assistant.answer('x', []));
    expect(e).toMatchObject({ code: 'network', httpStatus: 502, retryable: true });
  });

  it('falls back to the configured second model only after transient failures, and says which model answered', async () => {
    const urls: string[] = [];
    const routed = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      const step = String(input).includes('gemini-3.6-flash') ? apiErr(503, 'UNAVAILABLE', 'busy') : ok('dari cadangan');
      return new Response(JSON.stringify(step.body), { status: step.status, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const assistant = new GeminiAssistant({
      apiKey: FAKE_KEY, model: 'gemini-3.6-flash', fallbackModel: 'gemini-3.5-flash-lite',
      timeoutMs: 10_000, totalTimeoutMs: 45_000, maxRetries: 1, fetch: routed, sleep: async () => {}, random: () => 0.5,
    });
    const reply = await assistant.answer('x', []);
    expect(reply).toMatchObject({ text: 'dari cadangan', model: 'gemini-3.5-flash-lite', attempts: 3 });
    expect(urls.filter((u) => u.includes('gemini-3.6-flash'))).toHaveLength(2);
  });
});

describe('Gemini quota exhaustion', () => {
  const daily = (status = 429) => apiErr(status, 'RESOURCE_EXHAUSTED', 'You exceeded your current quota', [
    { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] },
    { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '9543s' },
  ]);

  it('states the reset estimate from RetryInfo', async () => {
    const e = await failure(make([daily()]).assistant.answer('x', []));
    expect(e).toMatchObject({ code: 'quota_exhausted', retryable: false, retryAfterMs: 9_543_000 });
    expect(e.message).toContain('perkiraan reset dalam ±3 jam');
  });

  it('moves straight to the fallback model, whose quota is separate', async () => {
    const urls: string[] = [];
    const routed = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      const step = String(input).includes('gemini-3.6-flash') ? daily() : ok('cadangan menjawab');
      return new Response(JSON.stringify(step.body), { status: step.status, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const { assistant, sleeps } = make([], { fetch: routed, fallbackModel: 'gemini-3.5-flash-lite' });
    const reply = await assistant.answer('x', []);
    expect(reply).toMatchObject({ model: 'gemini-3.5-flash-lite', attempts: 2 });
    expect(sleeps).toEqual([]);
  });
});

describe('Gemini permanent failures', () => {
  it.each([
    ['401', apiErr(401, 'UNAUTHENTICATED', 'Request had invalid authentication credentials.'), 'auth'],
    ['403', apiErr(403, 'PERMISSION_DENIED', 'Permission denied'), 'auth'],
    ['400 invalid key', apiErr(400, 'INVALID_ARGUMENT', 'API key not valid. Please pass a valid API key.'), 'auth'],
    ['404 model', apiErr(404, 'NOT_FOUND', 'models/gemini-9-flash is not found for API version v1beta'), 'model_config'],
    ['400 thinking level', apiErr(400, 'INVALID_ARGUMENT', 'Thinking level MINIMAL is not supported for this model.'), 'model_config'],
    ['400 other', apiErr(400, 'INVALID_ARGUMENT', 'Invalid JSON payload received.'), 'bad_request'],
  ])('%s is not retried', async (_label, step, code) => {
    const { assistant, calls, sleeps } = make([step, ok('never')], { fallbackModel: 'gemini-3.5-flash-lite' });
    const e = await failure(assistant.answer('x', []));
    expect(calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
    expect(e.code).toBe(code);
    expect(e.retryable).toBe(false);
    // Upstream credential problems must not look like the app's own token being rejected.
    expect(e.httpStatus).not.toBe(401);
  });

  it('names the configured model in model errors', async () => {
    const e = await failure(make([apiErr(404, 'NOT_FOUND', 'not found')]).assistant.answer('x', []));
    expect(e.message).toContain('gemini-3.6-flash');
  });
});

describe('diagnostic logging', () => {
  it('logs status and attempt metadata without the API key or prompt contents', async () => {
    const { assistant } = make([
      apiErr(503, 'UNAVAILABLE', 'overloaded'),
      apiErr(400, 'INVALID_ARGUMENT', `API key not valid: ${FAKE_KEY}`),
    ]);
    await failure(assistant.answer('RAHASIA-PERTANYAAN-OPERATOR', []));
    const all = logs.join('\n');
    expect(all).toContain('"status":503');
    expect(all).toContain('"reason":"UNAVAILABLE"');
    expect(all).toContain('"attempt":2');
    expect(all).not.toContain(FAKE_KEY);
    expect(all).not.toContain('RAHASIA-PERTANYAAN-OPERATOR');
  });
});

describe('classification helpers', () => {
  it('parses Retry-After seconds and HTTP dates', () => {
    expect(parseRetryAfter('5')).toBe(5000);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6000);
    expect(parseRetryAfter('soon')).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });

  it('treats unknown errors as non-retryable', () => {
    expect(classifyFailure(new Error('boom'))).toMatchObject({ kind: 'upstream', transient: false });
  });
});
