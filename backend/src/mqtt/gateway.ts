import mqtt, { type MqttClient } from 'mqtt';
import { randomBytes } from 'node:crypto';
import { logger } from '../logger.js';

export interface BrokerStatus {
  connected: boolean;
  host: string;
  port: number;
  lastConnectedAt: number | null;
  lastDisconnectedAt: number | null;
  lastError: string | null;
  reconnectAttempts: number;
  nextRetryMs: number | null;
}

export interface Publisher {
  isConnected(): boolean;
  publish(topic: string, payload: string, timeoutMs: number): Promise<void>;
}

const BASE_RETRY_MS = 2000;
const MAX_RETRY_MS = 60000;

export class MqttGateway implements Publisher {
  private client: MqttClient | null = null;
  private status: BrokerStatus;

  constructor(
    private readonly opts: {
      host: string;
      port: number;
      username?: string;
      password?: string;
      clientId?: string;
      sensorTopic: string;
      onSensorMessage: (payload: Buffer) => void;
    },
  ) {
    this.status = {
      connected: false,
      host: opts.host,
      port: opts.port,
      lastConnectedAt: null,
      lastDisconnectedAt: null,
      lastError: null,
      reconnectAttempts: 0,
      nextRetryMs: null,
    };
  }

  start() {
    const clientId = this.opts.clientId ?? `gh-companion-${randomBytes(4).toString('hex')}`;
    const client = mqtt.connect({
      host: this.opts.host,
      port: this.opts.port,
      protocol: 'mqtt',
      username: this.opts.username,
      password: this.opts.password,
      clientId,
      clean: true,
      keepalive: 30,
      connectTimeout: 10000,
      reconnectPeriod: BASE_RETRY_MS,
      // Keep retrying (with backoff) after auth/ACL refusals instead of giving up forever.
      reconnectOnConnackError: true,
      // Relay commands must never be replayed later from an offline queue.
      queueQoSZero: false,
    });
    this.client = client;

    client.on('connect', () => {
      this.status.connected = true;
      this.status.lastConnectedAt = Date.now();
      this.status.lastError = null;
      this.status.reconnectAttempts = 0;
      this.status.nextRetryMs = null;
      client.options.reconnectPeriod = BASE_RETRY_MS;
      logger.info('mqtt connected', { host: this.opts.host, port: this.opts.port, clientId });
      client.subscribe(this.opts.sensorTopic, { qos: 0 }, (err) => {
        if (err) {
          this.status.lastError = `subscribe gagal: ${err.message}`;
          logger.error('mqtt subscribe failed', { topic: this.opts.sensorTopic, error: err.message });
        } else {
          logger.info('mqtt subscribed', { topic: this.opts.sensorTopic });
        }
      });
    });

    client.on('message', (topic, payload) => {
      if (topic === this.opts.sensorTopic) this.opts.onSensorMessage(payload);
    });

    client.on('close', () => {
      if (this.status.connected) {
        this.status.lastDisconnectedAt = Date.now();
        logger.warn('mqtt disconnected');
      }
      this.status.connected = false;
    });

    client.on('reconnect', () => {
      // Exponential backoff, bounded; mqtt.js reads reconnectPeriod at scheduling time.
      this.status.reconnectAttempts++;
      const next = Math.min(BASE_RETRY_MS * 2 ** this.status.reconnectAttempts, MAX_RETRY_MS);
      client.options.reconnectPeriod = next;
      this.status.nextRetryMs = next;
    });

    client.on('error', (err) => {
      this.status.lastError = err.message;
      logger.error('mqtt error', { error: err.message, attempts: this.status.reconnectAttempts });
    });
  }

  getStatus(): BrokerStatus {
    return { ...this.status };
  }

  isConnected() {
    return !!this.client?.connected;
  }

  publish(topic: string, payload: string, timeoutMs: number): Promise<void> {
    const client = this.client;
    if (!client || !client.connected) return Promise.reject(new Error('broker_disconnected'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('publish_timeout')), timeoutMs);
      // QoS 1: callback fires on PUBACK, i.e. the broker accepted it — not that the relay switched.
      client.publish(topic, payload, { qos: 1, retain: false }, (err) => {
        clearTimeout(timer);
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async stop() {
    if (!this.client) return;
    await this.client.endAsync(false).catch(() => this.client?.end(true));
    this.client = null;
  }
}
