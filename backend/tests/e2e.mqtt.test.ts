import { createBroker } from 'aedes';
import mqtt from 'mqtt';
import { createServer, type Server } from 'node:net';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/http/app.js';
import { MqttGateway } from '../src/mqtt/gateway.js';
import { RelayService } from '../src/relays/relays.js';
import { SensorStore } from '../src/sensors/store.js';
import { FakeAssistant, VALID_PAYLOAD } from './helpers.js';

// Local broker standing in for sdp.polinela.ac.id; a raw mqtt client plays the ESP32.
const TOKEN = 'e2e-token-0123456789abcdef';
const auth = { Authorization: `Bearer ${TOKEN}` };
const waitFor = async (fn: () => boolean, ms = 4000) => {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('timeout waiting for condition');
    await new Promise((r) => setTimeout(r, 25));
  }
};

describe('end-to-end over a real MQTT broker', () => {
  const broker = createBroker({
    authenticate: (_c, user, pass, done) => done(null, user === 'septa2' && pass?.toString() === 'secret'),
  });
  let server: Server;
  let gateway: MqttGateway;
  let device: mqtt.MqttClient;
  let store: SensorStore;
  let app: ReturnType<typeof createApp>;
  const deviceReceived: string[] = [];

  beforeAll(async () => {
    server = createServer(broker.handle);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;

    store = new SensorStore({ staleAfterMs: 20_000, historyMs: 3_600_000 });
    gateway = new MqttGateway({
      host: '127.0.0.1', port, username: 'septa2', password: 'secret',
      sensorTopic: 'environment/data', onSensorMessage: (p) => store.ingest(p),
    });
    gateway.start();
    app = createApp({
      accessToken: TOKEN, store, relays: new RelayService(gateway, { topic: 'relay/control' }),
      assistant: new FakeAssistant(), brokerStatus: () => gateway.getStatus(),
      topics: { sensor: 'environment/data', relay: 'relay/control' },
    });

    device = mqtt.connect({ host: '127.0.0.1', port, username: 'septa2', password: 'secret', clientId: 'ESP32-sim' });
    await new Promise<void>((r) => device.on('connect', () => r()));
    await device.subscribeAsync('relay/control');
    device.on('message', (_t, m) => deviceReceived.push(m.toString()));
    await waitFor(() => gateway.isConnected());
  });

  afterAll(async () => {
    await device?.endAsync();
    await gateway?.stop();
    await new Promise<void>((r) => broker.close(() => r()));
    server?.close();
  });

  it('sensor JSON published by the device reaches the API', async () => {
    await device.publishAsync('environment/data', JSON.stringify(VALID_PAYLOAD));
    await waitFor(() => store.getLatest() !== null);
    const res = await request(app).get('/api/sensors/latest').set(auth).expect(200);
    expect(res.body.reading.values).toMatchObject({ TDS: 812.4, pH: 6.21, atmosphere_pressure: 1008.6 });
    expect(res.body.freshness.state).toBe('fresh');
  });

  it('invalid JSON from the device does not break ingestion', async () => {
    await device.publishAsync('environment/data', '{not json');
    await device.publishAsync('environment/data', JSON.stringify({ ...VALID_PAYLOAD, TDS: 777 }));
    await waitFor(() => store.getLatest()?.values.TDS === 777);
    expect(store.counters.rejected).toBeGreaterThanOrEqual(1);
  });

  it('relay command arrives at the device as the exact firmware string', async () => {
    await request(app).post('/api/relays/exhaust').set(auth).send({ action: 'on' }).expect(200);
    await request(app).post('/api/relays/fertilizer').set(auth).send({ action: 'off' }).expect(200);
    await waitFor(() => deviceReceived.length >= 2);
    expect(deviceReceived).toEqual(['exhaust_on', 'pupuk_off']);
  });

  it('broker outage is visible and relay commands are refused, not queued', async () => {
    const port = (server.address() as AddressInfo).port;
    for (const c of Object.values((broker as unknown as { clients: Record<string, { close(): void }> }).clients)) c.close();
    await new Promise<void>((r) => server.close(() => r()));
    await waitFor(() => !gateway.isConnected());
    const status = await request(app).get('/api/status').set(auth).expect(200);
    expect(status.body.broker.connected).toBe(false);
    await request(app).post('/api/relays/light').set(auth).send({ action: 'on' }).expect(503);
    // Restart so afterAll can clean up normally.
    server = createServer(broker.handle);
    await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
  });

  it('wrong broker credentials are reported, not hidden', async () => {
    const port = (server.address() as AddressInfo).port;
    const bad = new MqttGateway({
      host: '127.0.0.1', port, username: 'septa2', password: 'nope',
      sensorTopic: 'environment/data', onSensorMessage: () => {},
    });
    bad.start();
    await waitFor(() => bad.getStatus().lastError !== null);
    expect(bad.getStatus().connected).toBe(false);
    expect(bad.getStatus().lastError).toMatch(/Not authorized|Bad username/i);
    await waitFor(() => bad.getStatus().reconnectAttempts >= 1, 5000);
    await bad.stop();
  });
});
