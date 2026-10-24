import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ApiError, apiRequest } from '../api';
import { LineChart } from '../components/LineChart';
import { Banner, Card, SectionTitle, styles as ui } from '../components/ui';
import { ALL_RAW_FIELDS, PRIMARY_FIELDS } from '../fields';
import { ISSUE_TEXT, formatAge, formatDateTime, formatValue } from '../format';
import { useGreenhouse } from '../state/greenhouse';
import { useSettings } from '../state/settings';
import { colors, space } from '../theme';
import type { HistoryResponse } from '../types';

const RANGES = [
  { minutes: 15, label: '15 mnt' },
  { minutes: 60, label: '1 jam' },
  { minutes: 360, label: '6 jam' },
  { minutes: 1440, label: '24 jam' },
];

export function SensorsScreen({ active }: { active: boolean }) {
  const { settings, configured } = useSettings();
  const { latest, dataState, dataAgeMs } = useGreenhouse();
  const [minutes, setMinutes] = useState(60);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    try {
      const h = await apiRequest<HistoryResponse>(settings, `/api/sensors/history?minutes=${minutes}`, { timeoutMs: 15000 });
      setHistory(h);
      setError(null);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setLoading(false);
    }
  }, [configured, settings, minutes]);

  useEffect(() => {
    if (!active) return;
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [active, load]);

  const fields = latest?.fields ?? PRIMARY_FIELDS;
  const reading = latest?.reading ?? null;
  const endT = history?.serverTime ?? Date.now();
  const startT = endT - minutes * 60_000;
  // Wider ranges are thinned server-side, so allow larger gaps before breaking the line.
  const gapMs = Math.max(60_000, (minutes * 60_000) / 150);

  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.title} accessibilityRole="header">
        Detail sensor
      </Text>
      <Text style={ui.muted}>
        {reading ? `Pembacaan terakhir ${formatDateTime(reading.receivedAt)} · ${formatAge(dataAgeMs)}` : 'Belum ada pembacaan'}
      </Text>
      {dataState === 'stale' && (
        <View style={{ marginTop: space.md }}>
          <Banner tone="warn" icon="time-outline" title="Data basi">
            Tidak ada data baru dalam {Math.round((latest?.freshness.staleAfterMs ?? 20000) / 1000)} detik terakhir.
          </Banner>
        </View>
      )}

      <View style={s.ranges} accessibilityRole="radiogroup">
        {RANGES.map((r) => {
          const on = r.minutes === minutes;
          return (
            <Pressable
              key={r.minutes}
              onPress={() => setMinutes(r.minutes)}
              style={[s.chip, on && s.chipOn]}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
            >
              <Text style={[s.chipText, on && s.chipTextOn]}>{r.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {error && (
        <Banner tone="danger" icon="cloud-offline-outline" title="Riwayat gagal dimuat">
          {error}
        </Banner>
      )}
      {history && (
        <Text style={ui.muted}>
          {history.readings.length} pembacaan nyata pada rentang ini{loading ? ' · memperbarui…' : ''}. Garis terputus = tidak ada data.
        </Text>
      )}

      {fields.map((f) => {
        const points = (history?.readings ?? []).map((r) => ({ t: r.t, v: r.v[f.key] }));
        const issue = reading?.issues[f.key];
        return (
          <Card key={f.key} style={{ marginTop: space.md }}>
            <Text style={s.cardTitle}>{f.label}</Text>
            <Text style={s.meta}>
              Field <Text style={s.code}>{f.key}</Text>
              {f.unit ? ` · satuan ${f.unit}${f.unitVerified ? '' : ' (diasumsikan)'}` : ''}
              {issue ? ` · ${ISSUE_TEXT[issue]}` : ''}
            </Text>
            {f.note ? <Text style={s.meta}>{f.note}</Text> : null}
            <View style={{ marginTop: space.md }}>
              <LineChart
                points={points}
                startT={startT}
                endT={endT}
                gapMs={gapMs}
                formatY={(v) => `${formatValue(f.key, v)}${f.unit ? ` ${f.unit}` : ''}`}
              />
            </View>
          </Card>
        );
      })}

      <SectionTitle>Data mentah terakhir</SectionTitle>
      <Card>
        {ALL_RAW_FIELDS.map((k, i) => (
          <View key={k} style={[s.rawRow, i > 0 && s.rawDivider]}>
            <Text style={s.code}>{k}</Text>
            <Text style={s.rawValue}>{reading?.values[k] ?? (reading ? 'tidak tersedia' : '—')}</Text>
          </View>
        ))}
        <Text style={[ui.muted, { marginTop: space.sm }]}>
          "temperature" dan "humidity" adalah salinan dari env_temp_c dan env_humidity di firmware — bukan sensor terpisah.
        </Text>
      </Card>
      <View style={{ height: space.xl }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  content: { padding: space.lg, paddingTop: space.md },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  ranges: { flexDirection: 'row', gap: space.sm, marginVertical: space.md },
  chip: { paddingHorizontal: 14, minHeight: 40, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13.5, color: colors.text, fontWeight: '600' },
  chipTextOn: { color: '#fff' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 4, lineHeight: 16 },
  code: { fontFamily: 'monospace', fontSize: 12.5, color: colors.text },
  rawRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  rawDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rawValue: { fontSize: 13, color: colors.text, fontVariant: ['tabular-nums'] },
});
