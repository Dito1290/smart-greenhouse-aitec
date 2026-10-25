export type SensorField =
  | 'TDS'
  | 'pH'
  | 'temperature'
  | 'humidity'
  | 'env_temp_c'
  | 'env_humidity'
  | 'uv_intensity'
  | 'luminous_intensity'
  | 'atmosphere_pressure';

export type SensorValues = Record<SensorField, number | null>;
export type FieldIssue = 'missing' | 'null' | 'not_a_number' | 'out_of_range';
export type Freshness = 'none' | 'fresh' | 'stale';

export interface Reading {
  receivedAt: number;
  values: SensorValues;
  issues: Partial<Record<SensorField, FieldIssue>>;
  mirrorMismatch: SensorField[];
}

export interface FieldInfo {
  key: SensorField;
  label: string;
  unit: string;
  unitVerified: boolean;
  note?: string;
}

export interface LatestResponse {
  serverTime: number;
  reading: Reading | null;
  freshness: { state: Freshness; ageMs: number | null; staleAfterMs: number };
  fields: FieldInfo[];
}

export type RelayId = 'fertilizer' | 'exhaust' | 'light';
export type RelayAction = 'on' | 'off';

export interface RelayCommandRecord {
  relay: RelayId;
  action: RelayAction;
  command: string;
  status: 'sending' | 'published' | 'failed';
  requestedAt: number;
  completedAt: number | null;
  error: string | null;
  physicalStateConfirmed: false;
}

export interface StatusResponse {
  serverTime: number;
  broker: {
    connected: boolean;
    host: string;
    port: number;
    lastConnectedAt: number | null;
    lastDisconnectedAt: number | null;
    lastError: string | null;
    reconnectAttempts: number;
    nextRetryMs: number | null;
  };
  data: {
    state: Freshness;
    ageMs: number | null;
    staleAfterMs: number;
    lastReceivedAt: number | null;
    counters: { accepted: number; duplicates: number; rejected: number };
    lastRejection: { at: number; reason: string } | null;
  };
  relays: Record<RelayId, RelayCommandRecord | null>;
  relayStateReporting: boolean;
  assistant: { configured: boolean; model: string };
  topics: { sensor: string; relay: string };
}

export interface HistoryResponse {
  serverTime: number;
  minutes: number;
  readings: { t: number; v: SensorValues }[];
}

export interface PlantProfile {
  species: string;
  growthStage: string;
  medium: string;
  notes: string;
}

export interface ChatResponse {
  reply: string;
  /** Model that produced this reply (may be the server's fallback model). */
  model: string;
  /** Reply hit the output limit and may be cut off. */
  truncated?: boolean;
  context: { attached: boolean; dataState: Freshness; readingAt: number | null; recentCount: number; historyUsed?: number };
}

/** Assistant failures that need the server admin, not a retry. */
export const ASSISTANT_CONFIG_ERRORS = ['not_configured', 'auth', 'model_config', 'quota_exhausted', 'bad_request'];
