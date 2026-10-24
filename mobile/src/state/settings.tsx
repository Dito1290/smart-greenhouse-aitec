import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { normalizeBaseUrl } from '../api';
import type { PlantProfile } from '../types';

const SETTINGS_KEY = 'gh.settings.v1';
const TOKEN_KEY = 'gh.accessToken';

export interface Settings {
  baseUrl: string;
  token: string;
  autoSpeak: boolean;
  profile: PlantProfile;
}

const DEFAULTS: Settings = {
  baseUrl: process.env.EXPO_PUBLIC_API_URL ?? '',
  token: '',
  autoSpeak: true,
  profile: { species: '', growthStage: '', medium: '', notes: '' },
};

interface SettingsContextValue {
  settings: Settings;
  loaded: boolean;
  configured: boolean;
  update: (patch: Partial<Settings>) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [raw, token] = await Promise.all([AsyncStorage.getItem(SETTINGS_KEY), SecureStore.getItemAsync(TOKEN_KEY)]);
        const stored = raw ? JSON.parse(raw) : {};
        setSettings({
          ...DEFAULTS,
          ...stored,
          profile: { ...DEFAULTS.profile, ...(stored.profile ?? {}) },
          token: token ?? '',
        });
      } catch {
        // Corrupt storage: fall back to defaults; the user can re-enter settings.
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const update = useCallback(async (patch: Partial<Settings>) => {
    const next = await new Promise<Settings>((resolve) =>
      setSettings((prev) => {
        const merged = { ...prev, ...patch };
        if (patch.baseUrl !== undefined) merged.baseUrl = normalizeBaseUrl(patch.baseUrl);
        resolve(merged);
        return merged;
      }),
    );
    const { token, ...rest } = next;
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(rest));
    if (patch.token !== undefined) {
      if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
      else await SecureStore.deleteItemAsync(TOKEN_KEY);
    }
  }, []);

  const value = useMemo(
    () => ({ settings, loaded, configured: !!settings.baseUrl && !!settings.token, update }),
    [settings, loaded, update],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings outside SettingsProvider');
  return ctx;
}
