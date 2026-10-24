import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { AssistantError } from '../src/assistant/gemini.js';
import { createApp } from '../src/http/app.js';
import type { BrokerStatus, Publisher } from '../src/mqtt/gateway.js';
import { RelayService } from '../src/relays/relays.js';
import { SensorStore } from '../src/sensors/store.js';
import { FakeAssistant, VALID_PAYLOAD } from './helpers.js';

const TOKEN = 'test-token-0123456789abcdef';
const auth = { Authorization: `Bearer ${TOKEN}` };

function setup() {
  const store = new SensorStore({ staleAfterMs: 20_000, historyMs: 3_600_000 });
  const sent: string[] = [];
  const publisher: Publisher = {
    isConnected: () => true,
    publish: async (_t, p) => void sent.push(p),
  };
  const assistant = new FakeAssistant();
  const broker: BrokerStatus = {
    connected: true, host: 'h', port: 1883, lastConnectedAt: 1, lastDisconnectedAt: null,
    lastError: null, reconnectAttempts: 0, nextRetryMs: null,
  };
  const app = createApp({
    accessToken: TOKEN,
    store,
    relays: new RelayService(publisher, { topic: 'relay/control' }),
    assistant,
    brokerStatus: () => broker,
    topics: { sensor: 'environment/data', relay: 'relay/control' },
  });
  return { app, store, sent, assistant };
}

describe('HTTP API', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('health is public, everything else needs the token', async () => {
    await request(ctx.app).get('/api/health').expect(200);
    await request(ctx.app).get('/api/status').expect(401);
    await request(ctx.app).get('/api/status').set('Authorization', 'Bearer wrong').expect(401);
    await request(ctx.app).post('/api/relays/light').send({ action: 'on' }).expect(401);
    expect(ctx.sent).toHaveLength(0);
  });

  it('returns null reading before data and the reading after', async () => {
    let res = await request(ctx.app).get('/api/sensors/latest').set(auth).expect(200);
    expect(res.body.reading).toBeNull();
    expect(res.body.freshness.state).toBe('none');
    ctx.store.ingest(JSON.stringify(VALID_PAYLOAD));
    res = await request(ctx.app).get('/api/sensors/latest').set(auth).expect(200);
    expect(res.body.reading.values.TDS).toBe(812.4);
    expect(res.body.fields.map((f: { key: string }) => f.key)).not.toContain('temperature');
  });

  it('publishes allowlisted relay commands and rejects others', async () => {
    const res = await request(ctx.app).post('/api/relays/fertilizer').set(auth).send({ action: 'off' }).expect(200);
    expect(res.body.record).toMatchObject({ command: 'pupuk_off', status: 'published', physicalStateConfirmed: false });
    await request(ctx.app).post('/api/relays/pump').set(auth).send({ action: 'on' }).expect(400);
    await request(ctx.app).post('/api/relays/light').set(auth).send({ action: 'lampu_on' }).expect(400);
    await request(ctx.app).post('/api/relays/light').set(auth).send({ topic: 'x', action: 'on', payload: 'evil' }).expect(200);
    expect(ctx.sent).toEqual(['pupuk_off', 'lampu_on']);
  });

  it('sends the question with sensor context and profile to the assistant', async () => {
    ctx.store.ingest(JSON.stringify(VALID_PAYLOAD));
    const res = await request(ctx.app)
      .post('/api/assistant/chat')
      .set(auth)
      .send({ message: 'Apa arti nilai TDS yang terbaca?', profile: { species: 'Tomat' }, history: [{ role: 'user', text: 'halo' }, { role: 'model', text: 'hai' }] })
      .expect(200);
    expect(res.body).toMatchObject({ reply: 'jawaban uji', context: { attached: true, dataState: 'fresh' } });
    const call = ctx.assistant.calls[0];
    expect(call.userTurn).toContain('[TDS]: 812.40 ppm');
    expect(call.userTurn).toContain('Jenis tanaman: Tomat');
    expect(call.userTurn).toContain('Apa arti nilai TDS yang terbaca?');
    expect(call.history).toHaveLength(2);
    expect(ctx.sent).toHaveLength(0);
  });

  it('surfaces assistant failures instead of a fabricated answer', async () => {
    ctx.assistant.failWith = new AssistantError('not_configured', 503, 'Gemini belum dikonfigurasi');
    const res = await request(ctx.app).post('/api/assistant/chat').set(auth).send({ message: 'halo' }).expect(503);
    expect(res.body).toEqual({ error: 'not_configured', message: 'Gemini belum dikonfigurasi' });
    await request(ctx.app).post('/api/assistant/chat').set(auth).send({ message: '   ' }).expect(400);
  });

  it('transcribes audio and reports unclear speech', async () => {
    const audioBase64 = 'A'.repeat(200);
    let res = await request(ctx.app).post('/api/assistant/transcribe').set(auth).send({ audioBase64, mimeType: 'audio/mp4' }).expect(200);
    expect(res.body.text).toBe('bagaimana kondisi greenhouse saya');
    ctx.assistant.transcript = '[TIDAK_TERDENGAR]';
    res = await request(ctx.app).post('/api/assistant/transcribe').set(auth).send({ audioBase64, mimeType: 'audio/mp4' }).expect(422);
    expect(res.body.error).toBe('no_speech');
    await request(ctx.app).post('/api/assistant/transcribe').set(auth).send({ audioBase64, mimeType: 'video/mp4' }).expect(400);
  });

  it('rejects malformed JSON bodies cleanly', async () => {
    await request(ctx.app).post('/api/relays/light').set(auth).set('Content-Type', 'application/json').send('{bad').expect(400);
  });
});
