import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { ApiError, apiRequest } from '../api';
import type { Freshness, LatestResponse, RelayAction, RelayCommandRecord, RelayId, StatusResponse } from '../types';
import { useSettings } from './settings';

const POLL_MS = 3000;

export interface BackendLink {
  /** null = not tried yet */
  reachable: boolean | null;
  lastOkAt: number | null;
  error: ApiError | null;
}

export interface RelayUiState {
  pending: RelayAction | null;
  lastResult: { ok: boolean; message: string; at: number } | null;
}

interface GreenhouseContextValue {
  status: StatusResponse | null;
  latest: LatestResponse | null;
  link: BackendLink;
  /** Data age computed on the device so it keeps growing while the server is unreachable. */
  dataAgeMs: number | null;
  dataState: Freshness;
  now: number;
  relayUi: Record<RelayId, RelayUiState>;
  sendRelay: (relay: RelayId, action: RelayAction) => Promise<void>;
  refresh: () => Promise<void>;
}

const GreenhouseContext = createContext<GreenhouseContextValue | null>(null);

const EMPTY_RELAY: RelayUiState = { pending: null, lastResult: null };

export function GreenhouseProvider({ children }: { children: ReactNode }) {
  const { settings, configured } = useSettings();
  const conn = useMemo(() => ({ baseUrl: settings.baseUrl, token: settings.token }), [settings.baseUrl, settings.token]);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [latest, setLatest] = useState<LatestResponse | null>(null);
  const [link, setLink] = useState<BackendLink>({ reachable: null, lastOkAt: null, error: null });
  const [now, setNow] = useState(Date.now());
  const [relayUi, setRelayUi] = useState<Record<RelayId, RelayUiState>>({
    fertilizer: EMPTY_RELAY,
    exhaust: EMPTY_RELAY,
    light: EMPTY_RELAY,
  });
  const clockOffset = useRef(0);
  const inFlight = useRef(false);
  const relayLocks = useRef<Partial<Record<RelayId, boolean>>>({});

  // Drop data from a previous server/token so it can't be mistaken for current readings.
  useEffect(() => {
    setStatus(null);
    setLatest(null);
    setLink({ reachable: null, lastOkAt: null, error: null });
  }, [conn]);

  const refresh = useCallback(async () => {
    if (!configured || inFlight.current) return;
    inFlight.current = true;
    try {
      const [s, l] = await Promise.all([
        apiRequest<StatusResponse>(conn, '/api/status', { timeoutMs: 8000 }),
        apiRequest<LatestResponse>(conn, '/api/sensors/latest', { timeoutMs: 8000 }),
      ]);
      clockOffset.current = s.serverTime - Date.now();
      setStatus(s);
      setLatest(l);
      setLink({ reachable: true, lastOkAt: Date.now(), error: null });
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError('unknown', 'Galat tidak dikenal.');
      setLink((prev) => ({ ...prev, reachable: false, error: e }));
    } finally {
      inFlight.current = false;
    }
  }, [conn, configured]);

  useEffect(() => {
    if (!configured) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      void refresh();
      timer = setInterval(() => void refresh(), POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (s) => (s === 'active' ? start() : stop()));
    return () => {
      stop();
      sub.remove();
    };
  }, [configured, refresh]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const lastReceivedAt = latest?.reading?.receivedAt ?? null;
  const staleAfterMs = latest?.freshness.staleAfterMs ?? 20000;
  const dataAgeMs = lastReceivedAt === null ? null : Math.max(0, now + clockOffset.current - lastReceivedAt);
  const dataState: Freshness = dataAgeMs === null ? 'none' : dataAgeMs > staleAfterMs ? 'stale' : 'fresh';

  const sendRelay = useCallback(
    async (relay: RelayId, action: RelayAction) => {
      // Synchronous lock: blocks double taps before React re-renders the disabled button.
      if (relayLocks.current[relay]) return;
      relayLocks.current[relay] = true;
      setRelayUi((p) => ({ ...p, [relay]: { ...p[relay], pending: action } }));
      let result: RelayUiState['lastResult'];
      try {
        const res = await apiRequest<{ record: RelayCommandRecord }>(conn, `/api/relays/${relay}`, {
          method: 'POST',
          body: { action },
          timeoutMs: 12000,
        });
        result = {
          ok: true,
          message: `Perintah "${res.record.command}" diterima broker. Status fisik relay belum terkonfirmasi.`,
          at: Date.now(),
        };
      } catch (err) {
        const e = err as ApiError;
        result = {
          ok: false,
          message:
            e.code === 'timeout'
              ? 'Server tidak merespons. Status perintah tidak pasti; periksa perangkat sebelum mengulang.'
              : e.message,
          at: Date.now(),
        };
      } finally {
        relayLocks.current[relay] = false;
      }
      setRelayUi((p) => ({ ...p, [relay]: { pending: null, lastResult: result } }));
      void refresh();
    },
    [conn, refresh],
  );

  const value = useMemo(
    () => ({ status, latest, link, dataAgeMs, dataState, now, relayUi, sendRelay, refresh }),
    [status, latest, link, dataAgeMs, dataState, now, relayUi, sendRelay, refresh],
  );
  return <GreenhouseContext.Provider value={value}>{children}</GreenhouseContext.Provider>;
}

export function useGreenhouse() {
  const ctx = useContext(GreenhouseContext);
  if (!ctx) throw new Error('useGreenhouse outside GreenhouseProvider');
  return ctx;
}
