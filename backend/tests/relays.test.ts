import { describe, expect, it } from 'vitest';
import type { Publisher } from '../src/mqtt/gateway.js';
import { RelayService, commandFor, isRelayAction, isRelayId } from '../src/relays/relays.js';

class FakePublisher implements Publisher {
  connected = true;
  sent: { topic: string; payload: string }[] = [];
  delayMs = 0;
  fail: Error | null = null;
  isConnected() {
    return this.connected;
  }
  async publish(topic: string, payload: string) {
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.fail) throw this.fail;
    this.sent.push({ topic, payload });
  }
}

describe('relay command mapping', () => {
  it('maps to the exact firmware strings', () => {
    expect(commandFor('fertilizer', 'on')).toBe('pupuk_on');
    expect(commandFor('fertilizer', 'off')).toBe('pupuk_off');
    expect(commandFor('exhaust', 'on')).toBe('exhaust_on');
    expect(commandFor('exhaust', 'off')).toBe('exhaust_off');
    expect(commandFor('light', 'on')).toBe('lampu_on');
    expect(commandFor('light', 'off')).toBe('lampu_off');
  });

  it('rejects anything outside the allowlist', () => {
    for (const bad of ['pump', 'toString', '__proto__', 'constructor', '', 'LIGHT']) expect(isRelayId(bad)).toBe(false);
    for (const bad of ['ON', 'toggle', 'pupuk_on', 1, null]) expect(isRelayAction(bad)).toBe(false);
  });
});

describe('RelayService', () => {
  it('publishes to relay/control and never claims physical confirmation', async () => {
    const pub = new FakePublisher();
    const svc = new RelayService(pub, { topic: 'relay/control' });
    const rec = await svc.send('light', 'on');
    expect(pub.sent).toEqual([{ topic: 'relay/control', payload: 'lampu_on' }]);
    expect(rec).toMatchObject({ status: 'published', physicalStateConfirmed: false });
  });

  it('blocks concurrent duplicates and rapid repeats', async () => {
    const pub = new FakePublisher();
    pub.delayMs = 50;
    const svc = new RelayService(pub, { topic: 'relay/control', cooldownMs: 3000 });
    const first = svc.send('exhaust', 'on');
    await expect(svc.send('exhaust', 'on')).rejects.toMatchObject({ code: 'busy' });
    await first;
    await expect(svc.send('exhaust', 'on')).rejects.toMatchObject({ code: 'cooldown' });
    // The opposite action is allowed immediately so the operator can always switch off.
    await svc.send('exhaust', 'off');
    expect(pub.sent.map((s) => s.payload)).toEqual(['exhaust_on', 'exhaust_off']);
  });

  it('refuses to queue commands while the broker is down', async () => {
    const pub = new FakePublisher();
    pub.connected = false;
    const svc = new RelayService(pub, { topic: 'relay/control' });
    await expect(svc.send('fertilizer', 'on')).rejects.toMatchObject({ code: 'broker_disconnected', httpStatus: 503 });
    expect(pub.sent).toHaveLength(0);
    expect(svc.snapshot().fertilizer).toBeNull();
  });

  it('records publish failures and allows retry', async () => {
    const pub = new FakePublisher();
    pub.fail = new Error('publish_timeout');
    const svc = new RelayService(pub, { topic: 'relay/control' });
    await expect(svc.send('light', 'off')).rejects.toMatchObject({ code: 'publish_failed' });
    expect(svc.snapshot().light).toMatchObject({ status: 'failed', error: 'publish_timeout' });
    pub.fail = null;
    await expect(svc.send('light', 'off')).resolves.toMatchObject({ status: 'published' });
  });
});
