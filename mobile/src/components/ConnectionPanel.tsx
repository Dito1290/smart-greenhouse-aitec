import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { formatAge } from '../format';
import { useGreenhouse } from '../state/greenhouse';
import { colors, space, toneColors, type Tone } from '../theme';
import { Card, type IconName } from './ui';

interface Row {
  icon: IconName;
  label: string;
  value: string;
  tone: Tone;
  detail?: string;
}

/**
 * Four separate links, never collapsed into one green dot:
 * app→server, server→broker, device→data, and relay physical state.
 */
export function ConnectionPanel({ compact }: { compact?: boolean }) {
  const { link, status, dataState, dataAgeMs } = useGreenhouse();

  const rows: Row[] = [
    link.reachable === null
      ? { icon: 'phone-portrait-outline', label: 'Aplikasi ↔ server', value: 'Menghubungkan…', tone: 'neutral' }
      : link.reachable
        ? { icon: 'phone-portrait-outline', label: 'Aplikasi ↔ server', value: 'Terhubung', tone: 'good' }
        : {
            icon: 'phone-portrait-outline',
            label: 'Aplikasi ↔ server',
            value: 'Tidak terjangkau',
            tone: 'danger',
            detail: link.error?.message,
          },
    !status
      ? { icon: 'git-network-outline', label: 'Server ↔ broker MQTT', value: 'Tidak diketahui', tone: 'neutral' }
      : status.broker.connected
        ? { icon: 'git-network-outline', label: 'Server ↔ broker MQTT', value: 'Terhubung', tone: 'good' }
        : {
            icon: 'git-network-outline',
            label: 'Server ↔ broker MQTT',
            value: 'Terputus',
            tone: 'danger',
            detail: status.broker.lastError ?? undefined,
          },
    dataState === 'fresh'
      ? { icon: 'hardware-chip-outline', label: 'Data sensor ESP32', value: `Masuk ${formatAge(dataAgeMs)}`, tone: 'good' }
      : dataState === 'stale'
        ? {
            icon: 'hardware-chip-outline',
            label: 'Data sensor ESP32',
            value: `Basi · ${formatAge(dataAgeMs)}`,
            tone: 'warn',
            detail: 'Perangkat mungkin mati, putus Wi-Fi, atau broker tidak meneruskan data.',
          }
        : { icon: 'hardware-chip-outline', label: 'Data sensor ESP32', value: 'Belum ada data', tone: 'neutral' },
    {
      icon: 'toggle-outline',
      label: 'Status fisik relay',
      value: 'Tidak dilaporkan',
      tone: 'neutral',
      detail: compact ? undefined : 'Firmware tidak mengirim status relay; perintah terkirim ≠ relay berubah.',
    },
  ];

  return (
    <Card style={{ paddingVertical: space.sm }}>
      {rows.map((r, i) => {
        const c = toneColors[r.tone];
        return (
          <View
            key={r.label}
            style={[s.row, i > 0 && s.divider]}
            accessible
            accessibilityLabel={`${r.label}: ${r.value}${r.detail ? `. ${r.detail}` : ''}`}
          >
            <Ionicons name={r.icon} size={18} color={colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={s.label}>{r.label}</Text>
              {r.detail && !compact ? <Text style={s.detail}>{r.detail}</Text> : null}
            </View>
            <View style={[s.badge, { backgroundColor: c.bg }]}>
              <View style={[s.dot, { backgroundColor: c.fg }]} />
              <Text style={[s.value, { color: c.fg }]}>{r.value}</Text>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  label: { fontSize: 14, color: colors.text, fontWeight: '500' },
  detail: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  value: { fontSize: 12, fontWeight: '700' },
});
