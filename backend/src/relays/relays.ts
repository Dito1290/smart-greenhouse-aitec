import type { Publisher } from '../mqtt/gateway.js';
import { logger } from '../logger.js';

/** Exact command strings understood by the existing ESP32 firmware. */
export const RELAY_COMMANDS = {
  fertilizer: { on: 'pupuk_on', off: 'pupuk_off', label: 'Relay pupuk' },
  exhaust: { on: 'exhaust_on', off: 'exhaust_off', label: 'Kipas exhaust' },
  light: { on: 'lampu_on', off: 'lampu_off', label: 'Lampu greenhouse' },
} as const;

export type RelayId = keyof typeof RELAY_COMMANDS;
export type RelayAction = 'on' | 'off';

export function isRelayId(v: unknown): v is RelayId {
  return typeof v === 'string' && Object.hasOwn(RELAY_COMMANDS, v);
}

export function isRelayAction(v: unknown): v is RelayAction {
  return v === 'on' || v === 'off';
}

export function commandFor(relay: RelayId, action: RelayAction): string {
  return RELAY_COMMANDS[relay][action];
}

export type CommandStatus = 'sending' | 'published' | 'failed';

export interface RelayCommandRecord {
  relay: RelayId;
  action: RelayAction;
  command: string;
  status: CommandStatus;
  requestedAt: number;
  completedAt: number | null;
  error: string | null;
  /** Always false: the firmware publishes no relay state or acknowledgement. */
  physicalStateConfirmed: false;
}

export class RelayError extends Error {
  constructor(
    readonly code: 'busy' | 'cooldown' | 'broker_disconnected' | 'publish_failed',
    readonly httpStatus: number,
    message: string,
  ) {
    super(message);
  }
}

export class RelayService {
  private last = new Map<RelayId, RelayCommandRecord>();

  constructor(
    private readonly publisher: Publisher,
    private readonly opts: { topic: string; timeoutMs?: number; cooldownMs?: number; now?: () => number },
  ) {}

  private now() {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  snapshot(): Record<RelayId, RelayCommandRecord | null> {
    return {
      fertilizer: this.last.get('fertilizer') ?? null,
      exhaust: this.last.get('exhaust') ?? null,
      light: this.last.get('light') ?? null,
    };
  }

  async send(relay: RelayId, action: RelayAction): Promise<RelayCommandRecord> {
    const prev = this.last.get(relay);
    if (prev?.status === 'sending') {
      throw new RelayError('busy', 409, 'Perintah sebelumnya untuk relay ini masih dikirim.');
    }
    const cooldownMs = this.opts.cooldownMs ?? 3000;
    if (prev && prev.status === 'published' && prev.action === action && this.now() - prev.requestedAt < cooldownMs) {
      throw new RelayError('cooldown', 429, 'Perintah yang sama baru saja dikirim. Tunggu beberapa detik.');
    }
    if (!this.publisher.isConnected()) {
      throw new RelayError('broker_disconnected', 503, 'Broker MQTT tidak terhubung. Perintah tidak dikirim.');
    }

    const record: RelayCommandRecord = {
      relay,
      action,
      command: commandFor(relay, action),
      status: 'sending',
      requestedAt: this.now(),
      completedAt: null,
      error: null,
      physicalStateConfirmed: false,
    };
    this.last.set(relay, record);

    try {
      await this.publisher.publish(this.opts.topic, record.command, this.opts.timeoutMs ?? 5000);
      record.status = 'published';
      logger.info('relay command published', { relay, command: record.command });
    } catch (err) {
      record.status = 'failed';
      record.error = (err as Error).message;
      logger.error('relay command failed', { relay, command: record.command, error: record.error });
    } finally {
      record.completedAt = this.now();
    }

    if (record.status === 'failed') {
      const msg =
        record.error === 'publish_timeout'
          ? 'Broker belum mengonfirmasi perintah dalam batas waktu. Status tidak pasti: perintah mungkin tetap sampai ke perangkat.'
          : 'Perintah gagal dikirim ke broker MQTT.';
      throw Object.assign(new RelayError('publish_failed', 502, msg), { record });
    }
    return { ...record };
  }
}
