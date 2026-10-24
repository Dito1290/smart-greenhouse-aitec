import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { ISSUE_TEXT, formatValue } from '../format';
import { colors, font, radius, space } from '../theme';
import type { FieldInfo, Reading, SensorField } from '../types';
import type { IconName } from './ui';

export const FIELD_ICONS: Record<SensorField, IconName> = {
  TDS: 'water-outline',
  pH: 'flask-outline',
  env_temp_c: 'thermometer-outline',
  env_humidity: 'cloud-outline',
  uv_intensity: 'sunny-outline',
  luminous_intensity: 'bulb-outline',
  atmosphere_pressure: 'speedometer-outline',
  temperature: 'thermometer-outline',
  humidity: 'cloud-outline',
};

const SHORT_LABEL: Partial<Record<SensorField, string>> = {
  TDS: 'TDS',
  pH: 'pH larutan',
  env_temp_c: 'Suhu udara',
  env_humidity: 'Kelembapan (RH)',
  uv_intensity: 'UV',
  luminous_intensity: 'Cahaya',
  atmosphere_pressure: 'Tekanan udara',
};

export function SensorTile({ field, reading, stale }: { field: FieldInfo; reading: Reading | null; stale: boolean }) {
  const value = reading?.values[field.key] ?? null;
  const issue = reading?.issues[field.key];
  const unavailable = reading !== null && value === null;
  return (
    <View
      style={[s.tile, stale && s.stale]}
      accessible
      accessibilityLabel={`${field.label}: ${value === null ? 'tidak tersedia' : `${formatValue(field.key, value)} ${field.unit}`}${stale ? ', data basi' : ''}`}
    >
      <View style={s.head}>
        <Ionicons name={FIELD_ICONS[field.key]} size={16} color={colors.textMuted} />
        <Text style={s.label} numberOfLines={1}>
          {SHORT_LABEL[field.key] ?? field.label}
        </Text>
      </View>
      <View style={s.valueRow}>
        <Text style={[s.value, (value === null || stale) && { color: colors.textFaint }]}>{formatValue(field.key, value)}</Text>
        {field.unit && value !== null ? <Text style={s.unit}>{field.unit}{field.unitVerified ? '' : '*'}</Text> : null}
      </View>
      {unavailable ? (
        <Text style={s.issue}>{issue ? ISSUE_TEXT[issue] : 'Tidak tersedia'}</Text>
      ) : stale ? (
        <Text style={s.issue}>Nilai terakhir, bukan kondisi kini</Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  tile: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    minHeight: 96,
  },
  stale: { backgroundColor: colors.surfaceAlt, borderStyle: 'dashed' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: font.label, color: colors.textMuted, flexShrink: 1 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: space.sm },
  value: { fontSize: font.value, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 13, color: colors.textMuted },
  issue: { fontSize: 11.5, color: colors.warn, marginTop: 4 },
});
