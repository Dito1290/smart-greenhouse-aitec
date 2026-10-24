import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import type { IconName } from './ui';

export type TabKey = 'dashboard' | 'sensors' | 'assistant' | 'settings';

const TABS: { key: TabKey; label: string; icon: IconName; iconActive: IconName }[] = [
  { key: 'dashboard', label: 'Dasbor', icon: 'home-outline', iconActive: 'home' },
  { key: 'sensors', label: 'Sensor', icon: 'stats-chart-outline', iconActive: 'stats-chart' },
  { key: 'assistant', label: 'Asisten', icon: 'chatbubbles-outline', iconActive: 'chatbubbles' },
  { key: 'settings', label: 'Pengaturan', icon: 'settings-outline', iconActive: 'settings' },
];

export function TabBar({ active, onChange }: { active: TabKey; onChange: (k: TabKey) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 8) }]} accessibilityRole="tablist">
      {TABS.map((t) => {
        const on = t.key === active;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            style={s.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t.label}
          >
            <Ionicons name={on ? t.iconActive : t.icon} size={22} color={on ? colors.primary : colors.textFaint} />
            <Text style={[s.label, { color: on ? colors.primaryDark : colors.textFaint, fontWeight: on ? '700' : '500' }]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 6,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 52, gap: 2 },
  label: { fontSize: 11.5 },
});
